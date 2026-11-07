// M16.12: the server's log records failures, and never what someone was doing
// @see docs/phases/phase-16.md

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { errorKind, logOptions } from '../../src/security/log-serializers.js';

type Handler = (req: FastifyRequest, reply: FastifyReply) => unknown;

const PLANTED = '/api/servers/my-server-id/files?path=/home/jane/contract.pdf&token=abc';

async function run(handler: Handler, url = PLANTED): Promise<string> {
  let text = '';
  const stream = new Writable({
    write(chunk, _enc, done) {
      text += chunk.toString();
      done();
    },
  });
  const app = Fastify({ ...logOptions, logger: { ...logOptions.logger, stream } });
  app.get('/api/servers/:id/files', handler);
  await app.ready();
  await app.inject({ url });
  await app.close();
  return text;
}

describe('the server log', () => {
  it('writes nothing for a request that worked', async () => {
    const text = await run(() => ({ ok: true }));
    expect(text).not.toContain('incoming request');
    expect(text).not.toContain('request completed');
    expect(text).not.toContain('contract.pdf');
    expect(text).not.toContain('my-server-id');
  });

  it('names the route of a failed request, not the path or what was asked for', async () => {
    const text = await run(() => {
      throw Object.assign(new Error('Read failed for /home/jane/contract.pdf on 192.168.1.20'), {
        username: 'jane',
        address: '192.168.1.20',
      });
    });
    expect(text).toContain('/api/servers/:id/files');
    expect(text).toContain('"status":500');
    expect(text).toContain('Read failed for');
    for (const value of ['my-server-id', 'contract.pdf', '192.168.1.20', 'jane', 'abc']) {
      expect(text).not.toContain(value);
    }
  });

  it('logs a route that answers with a 500 itself', async () => {
    const text = await run((_req, reply) => {
      reply.code(500);
      return { error: 'could not read /home/jane/contract.pdf' };
    });
    expect(text).toContain('"status":500');
    expect(text).toContain('/api/servers/:id/files');
    expect(text).not.toContain('contract.pdf');
  });

  it('writes nothing for a request the owner got wrong', async () => {
    const text = await run((_req, reply) => {
      reply.code(404);
      return { error: 'no such file' };
    });
    expect(text).toBe('');
  });

  it('says nothing about a route that does not exist, whose URL could name anything', async () => {
    const text = await run(() => ({ ok: true }), '/nothing/here/contract.pdf?path=/home/jane');
    expect(text).toBe('');
  });

  it('keeps the raw message out of the text of the line, too', async () => {
    const text = await run(() => {
      throw new Error('Read failed for /home/jane/contract.pdf');
    });
    expect(text).not.toContain('/home/jane');
    expect(text).toContain('"msg":"request error"');
  });

  it('is what the server is started with', () => {
    const index = readFileSync(join(import.meta.dirname, '../../src/index.ts'), 'utf8');
    expect(index).toContain('Fastify(logOptions)');
  });
});

describe('errorKind', () => {
  it('gives the kind of an ssh2 error, without its message', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 192.168.1.20:22'), {
      code: 'ECONNREFUSED',
      level: 'client-socket',
    });
    expect(errorKind(err)).toBe('ECONNREFUSED client-socket');
  });

  it('falls back to the name of the error', () => {
    expect(errorKind(new TypeError('secret detail'))).toBe('TypeError');
    expect(errorKind(undefined)).toBe('unknown error');
  });
});
