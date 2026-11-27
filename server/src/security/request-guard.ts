// M5 (C3) + M17.13: which requests the backend answers, checked before any route runs.
// The server binds 127.0.0.1, and every request must carry the per-install API token. The Host
// and WebSocket Origin rules stop other web pages from reaching it through DNS rebinding or a
// cross-site WebSocket (CORS doesn't apply to a WebSocket handshake).
// @see docs/SECURITY_AUDIT.md (C3), docs/phases/phase-17.md (M17.13)

import type { FastifyInstance } from 'fastify';

export interface RequestFacts {
  host?: string;
  /** The `Upgrade` header: `websocket` on a WebSocket handshake. */
  upgrade?: string;
  origin?: string;
  url: string;
  headerToken?: string | string[];
  queryToken?: unknown;
}

export interface Refusal {
  code: 401 | 403;
  error: string;
}

/** Only loopback names: an attacker's domain rebound to 127.0.0.1 still sends its own Host. */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  // Strip the port; handle IPv6 "[::1]:3001" as well as "host:port".
  const host = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * The browser on `npm run dev` sends its localhost address. The desktop app's page is a file:
 * Chromium sends `Origin: file://` on its WebSocket handshakes (M17.13; measured in Electron 33),
 * and `null` comes from sandboxed frames and other browsers. A page anywhere else can't read the
 * token file, so the token check below still stops it.
 */
export function isAllowedWebSocketOrigin(origin: string | undefined): boolean {
  return (
    !origin ||
    origin === 'null' ||
    origin === 'file://' ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

/** The header wins over `?token=`, which `<img>` and WebSocket need because they can't set headers. */
function providedToken(facts: RequestFacts): string | undefined {
  if (typeof facts.headerToken === 'string') return facts.headerToken;
  if (typeof facts.queryToken === 'string') return facts.queryToken;
  return undefined;
}

/** Why a request is refused, or null when it may go on to its route. */
export function refuseRequest(facts: RequestFacts, apiToken: string): Refusal | null {
  if (!isLoopbackHost(facts.host)) {
    return { code: 403, error: 'Forbidden: invalid Host header' };
  }
  if ((facts.upgrade ?? '').toLowerCase() === 'websocket' && !isAllowedWebSocketOrigin(facts.origin)) {
    return { code: 403, error: 'Forbidden: invalid WebSocket origin' };
  }
  // /health is the only endpoint without the token (a liveness probe).
  if (facts.url === '/health' || facts.url.startsWith('/health?')) return null;
  if (providedToken(facts) !== apiToken) {
    return { code: 401, error: 'Unauthorized: missing or invalid API token' };
  }
  return null;
}

/** Runs refuseRequest on every request, WebSocket handshakes included. */
export function registerRequestGuard(app: FastifyInstance, apiToken: string): void {
  app.addHook('onRequest', async (req, reply) => {
    const refusal = refuseRequest(
      {
        host: req.headers.host,
        upgrade: req.headers.upgrade,
        origin: req.headers.origin,
        url: req.url,
        headerToken: req.headers['x-headlessos-token'],
        queryToken: (req.query as { token?: unknown } | undefined)?.token,
      },
      apiToken,
    );
    if (refusal) return reply.code(refusal.code).send({ error: refusal.error });
  });
}
