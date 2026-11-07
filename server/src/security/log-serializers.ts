// M16.12: what the server may write to its log. A log is for finding out what went wrong, and
// people paste it into public issues, so it records failures and never what someone was doing.
// electron/diagnostics.js filters the same output again as it reaches the file.
// @see docs/phases/phase-16.md

import { LogController, type FastifyReply, type FastifyRequest } from 'fastify';
import { sanitizeErrorMessage } from './validators.js';

interface LoggedRequest {
  method?: string;
  routeOptions?: { url?: string };
}

interface LoggedError extends Error {
  code?: unknown;
  statusCode?: unknown;
}

/**
 * The kind of a failure, for a log line. ssh2 and Node put the address and the user in an error's
 * message, but its code and level say enough to tell a refused connection from a bad password.
 */
export function errorKind(err: unknown): string {
  const { code, level, name } = (err ?? {}) as { code?: unknown; level?: unknown; name?: unknown };
  const parts = [code, level].filter((part) => typeof part === 'string' && part);
  if (parts.length) return parts.join(' ');
  return typeof name === 'string' && name ? name : 'unknown error';
}

/**
 * Which lines Fastify writes. One line per request would be a record of every file, container and
 * service opened, and its own error lines use the URL or the raw message as the line's text, where
 * the serializers below can't reach them.
 */
class FailuresOnly extends LogController {
  override incomingRequest(): void {}

  override routeNotFound(): void {}

  /** Also catches a route that sets a 500 itself, which raises no error */
  override requestCompleted(_error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    if (reply.statusCode >= 500) request.log.error({ req: request, status: reply.statusCode }, 'request failed');
  }

  override defaultErrorLog(error: Error, request: FastifyRequest, reply: FastifyReply): void {
    if (reply.statusCode >= 500) request.log.error({ req: request, err: error }, 'request error');
  }

  override writeHeadError(error: Error, request: FastifyRequest): void {
    request.log.warn({ req: request, err: error }, 'could not write the response');
  }
}

export const logOptions = {
  logController: new FailuresOnly(),
  logger: {
    serializers: {
      /** The route's pattern (/api/servers/:id/files): the real path and query name real things */
      req: (req: LoggedRequest) => ({ method: req.method, route: req.routeOptions?.url ?? 'no route' }),
      /** Only these fields: an error's own properties can hold an address, a user or a config */
      err: (err: LoggedError) => ({
        type: err.name,
        code: err.code,
        statusCode: err.statusCode,
        message: sanitizeErrorMessage(err.message),
        // The first line of a stack repeats the message
        stack: (err.stack ?? '').split('\n').filter((line) => line.trimStart().startsWith('at ')).join('\n'),
      }),
    },
  },
};
