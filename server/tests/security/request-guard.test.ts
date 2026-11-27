// M5 (C3) + M17.13: the Host, WebSocket Origin and API token rules every request passes.
// @see docs/phases/phase-17.md (M17.13), docs/SECURITY_AUDIT.md (C3)

import type { Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import {
  isAllowedWebSocketOrigin,
  isLoopbackHost,
  refuseRequest,
  registerRequestGuard,
  type RequestFacts,
} from '../../src/security/request-guard.js';

const TOKEN = 'a'.repeat(64);
const ws = (origin: string | undefined, extra: Partial<RequestFacts> = {}): RequestFacts => ({
  host: 'localhost:3001',
  upgrade: 'websocket',
  origin,
  url: '/ws/terminal/srv-1?token=' + TOKEN,
  queryToken: TOKEN,
  ...extra,
});

describe('isLoopbackHost', () => {
  it('accepts loopback names, with or without a port', () => {
    for (const h of ['localhost', 'localhost:3001', '127.0.0.1:51234', '[::1]:3001']) {
      expect(isLoopbackHost(h)).toBe(true);
    }
  });

  it('refuses any other name, and a missing Host', () => {
    for (const h of [undefined, '', 'evil.example', 'evil.example:3001', 'localhost.evil.example', '192.168.1.20:3001']) {
      expect(isLoopbackHost(h)).toBe(false);
    }
  });
});

describe('isAllowedWebSocketOrigin', () => {
  it('M17.13: accepts file://, which Chromium sends from the desktop app\'s page', () => {
    expect(isAllowedWebSocketOrigin('file://')).toBe(true);
  });

  it('accepts no Origin, null and the dev server on localhost', () => {
    for (const o of [undefined, 'null', 'http://localhost:3000', 'http://127.0.0.1:5173', 'https://localhost']) {
      expect(isAllowedWebSocketOrigin(o)).toBe(true);
    }
  });

  it('refuses other sites and look-alikes', () => {
    for (const o of ['https://evil.example', 'http://localhost.evil.example', 'http://127.0.0.1.evil.example:3000', 'file://evil.example', 'chrome-extension://abc']) {
      expect(isAllowedWebSocketOrigin(o)).toBe(false);
    }
  });
});

describe('refuseRequest', () => {
  it('M17.13: lets the desktop app\'s WebSocket through with the token', () => {
    expect(refuseRequest(ws('file://'), TOKEN)).toBeNull();
  });

  it('still needs the token on a file:// WebSocket', () => {
    expect(refuseRequest(ws('file://', { queryToken: undefined }), TOKEN)?.code).toBe(401);
  });

  it('refuses a WebSocket from another site with 403, even with the token', () => {
    expect(refuseRequest(ws('https://evil.example'), TOKEN)).toEqual({ code: 403, error: 'Forbidden: invalid WebSocket origin' });
  });

  it('checks the Host before anything else', () => {
    expect(refuseRequest(ws('file://', { host: 'evil.example', queryToken: undefined }), TOKEN)?.error).toBe('Forbidden: invalid Host header');
  });

  it('leaves the Origin of plain requests to CORS', () => {
    expect(refuseRequest({ host: 'localhost', origin: 'https://evil.example', url: '/api/servers', headerToken: TOKEN }, TOKEN)).toBeNull();
  });

  it('takes the token from the header first, then ?token=', () => {
    const base = { host: 'localhost', url: '/api/servers' };
    expect(refuseRequest({ ...base, headerToken: TOKEN }, TOKEN)).toBeNull();
    expect(refuseRequest({ ...base, queryToken: TOKEN }, TOKEN)).toBeNull();
    expect(refuseRequest({ ...base, headerToken: 'wrong', queryToken: TOKEN }, TOKEN)?.code).toBe(401);
    expect(refuseRequest({ ...base, headerToken: [TOKEN, TOKEN], queryToken: TOKEN }, TOKEN)).toBeNull();
    expect(refuseRequest({ ...base, queryToken: [TOKEN] }, TOKEN)?.code).toBe(401);
    expect(refuseRequest(base, TOKEN)?.code).toBe(401);
  });

  it('exempts only /health from the token', () => {
    expect(refuseRequest({ host: 'localhost', url: '/health' }, TOKEN)).toBeNull();
    expect(refuseRequest({ host: 'localhost', url: '/health?probe=1' }, TOKEN)).toBeNull();
    expect(refuseRequest({ host: 'localhost', url: '/healthz' }, TOKEN)?.code).toBe(401);
  });
});

// A real handshake through the real hook: the 0.2.0–0.3.3 desktop app failed here with 403.
describe('a WebSocket handshake through registerRequestGuard', () => {
  let app: FastifyInstance;
  let port = 0;
  const sockets = new Set<Socket>();

  beforeAll(async () => {
    app = Fastify();
    // A refused handshake's socket stays open on the server side, and close() would wait for it.
    app.server.on('connection', (s: Socket) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
    registerRequestGuard(app, TOKEN);
    await app.register(websocket);
    app.register(async (scope) => {
      scope.get('/ws/echo', { websocket: true }, (socket) => {
        socket.on('message', (data: Buffer) => socket.send(data.toString()));
      });
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as { port: number }).port;
  });

  afterAll(async () => {
    for (const s of sockets) s.destroy();
    await app.close();
  });

  function handshake(origin: string, token = TOKEN): Promise<string> {
    return new Promise((resolve) => {
      const sock = new WebSocket(`ws://localhost:${port}/ws/echo?token=${token}`, { origin });
      sock.on('open', () => sock.send('ping'));
      sock.on('message', (data) => { resolve(`open: ${data.toString()}`); sock.close(); });
      sock.on('unexpected-response', (_req, res) => { resolve(`refused: ${res.statusCode}`); sock.terminate(); });
      sock.on('error', (err) => resolve(`error: ${err.message}`));
    });
  }

  it('M17.13: opens from the desktop app\'s Origin', async () => {
    expect(await handshake('file://')).toBe('open: ping');
  });

  it('opens from the dev server', async () => {
    expect(await handshake('http://localhost:3000')).toBe('open: ping');
  });

  it('refuses another site, and a wrong token', async () => {
    expect(await handshake('https://evil.example')).toBe('refused: 403');
    expect(await handshake('file://', 'b'.repeat(64))).toBe('refused: 401');
  });
});
