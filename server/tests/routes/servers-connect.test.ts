// M15.14, M15.16, M15.17: what the connect route tells the window when something is wrong
import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serverRoutes } from '../../src/routes/servers.js';
import type { ConfigStore } from '../../src/config/store.js';
import type { ConnectionManager } from '../../src/ssh/connection-manager.js';
import type { ServerConfig } from 'headlessos-shared';

const PASSWORD_SERVER = { id: 'p1', name: 'pi', host: '192.168.1.20', port: 2222, username: 'pi', authMethod: 'password', password: 'saved' } as ServerConfig;
const LOST_KEY_SERVER = { id: 'k1', name: 'vps', host: '10.0.0.5', port: 22, username: 'root', authMethod: 'privateKey' } as ServerConfig;

let app: FastifyInstance;

async function start(connect: () => Promise<void>, damagedList: string | null = null) {
  app = Fastify({ logger: false });
  const servers = [PASSWORD_SERVER, LOST_KEY_SERVER];
  const configStore = {
    getServers: async () => servers,
    getServer: async (id: string) => servers.find((s) => s.id === id),
    damagedListFile: () => damagedList,
  } as unknown as ConfigStore;
  const connectionManager = {
    connect: vi.fn(connect),
    getState: (serverId: string) => ({ serverId, status: 'connected' }),
  } as unknown as ConnectionManager;
  await app.register(serverRoutes, { configStore, connectionManager });
  return connectionManager;
}

afterEach(() => app.close());

describe('POST /api/servers/:id/connect', () => {
  it('returns the plain title and the whole failure', async () => {
    await start(async () => { throw new Error('connect ECONNREFUSED 192.168.1.20:2222'); });
    const res = await app.inject({ method: 'POST', url: '/api/servers/p1/connect', payload: {} });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: 'Nothing is answering at 192.168.1.20:2222',
      failure: {
        title: 'Nothing is answering at 192.168.1.20:2222',
        hint: 'The server may be off, or SSH may use another port.',
        detail: 'connect ECONNREFUSED 192.168.1.20:2222',
        help: 'connection-refused',
      },
    });
  });

  it('M15.16: does not connect to a server whose key is gone', async () => {
    const manager = await start(async () => undefined);
    const res = await app.inject({ method: 'POST', url: '/api/servers/k1/connect', payload: {} });
    expect(res.statusCode).toBe(422);
    expect(res.json().failure.title).toBe("This server's saved key can't be read");
    expect(manager.connect).not.toHaveBeenCalled();
  });

  it('M15.16: connects when the sign-in supplies a key after all', async () => {
    const manager = await start(async () => undefined);
    const res = await app.inject({ method: 'POST', url: '/api/servers/k1/connect', payload: { privateKey: 'key text' } });
    expect(res.statusCode).toBe(200);
    expect(manager.connect).toHaveBeenCalledOnce();
  });

  it('M15.16: counts a password typed at sign-in', async () => {
    await start(async () => { throw new Error('All configured authentication methods failed'); });
    const res = await app.inject({ method: 'POST', url: '/api/servers/p1/connect', payload: { password: 'typed' } });
    expect(res.json().failure.title).toBe('The server refused this login');
  });
});

describe('GET /api/servers', () => {
  it('M15.16: marks a key server with no key, and only that one', async () => {
    await start(async () => undefined);
    const list = (await app.inject({ method: 'GET', url: '/api/servers' })).json() as Array<{ id: string; keyLost?: boolean }>;
    expect(list.find((s) => s.id === 'k1')?.keyLost).toBe(true);
    expect(list.find((s) => s.id === 'p1')?.keyLost).toBeUndefined();
  });
});

describe('GET /api/servers/notice', () => {
  it('M15.17: names a damaged list', async () => {
    await start(async () => undefined, 'servers.json.broken');
    const res = await app.inject({ method: 'GET', url: '/api/servers/notice' });
    expect(res.json()).toMatchObject({ damagedList: 'servers.json.broken' });
  });

  it('M15.17: is empty otherwise', async () => {
    await start(async () => undefined);
    const res = await app.inject({ method: 'GET', url: '/api/servers/notice' });
    expect(res.json()).toMatchObject({ damagedList: null, locked: null });
  });
});
