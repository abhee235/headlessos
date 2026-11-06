// M16.4: locked logins say so, and never read as lost ones
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const state = vi.hoisted(() => ({ locked: true }));

vi.mock('../../src/security/encryption.js', async (orig) => ({
  ...(await orig<typeof import('../../src/security/encryption.js')>()),
  loginsLocked: () => state.locked,
  secretStore: () => (state.locked ? 'locked' : 'keychain'),
}));

import { serverRoutes } from '../../src/routes/servers.js';
import { loginsLockedFailure } from '../../src/ssh/connect-failure.js';
import type { ConfigStore } from '../../src/config/store.js';
import type { ConnectionManager } from '../../src/ssh/connection-manager.js';
import type { ServerConfig } from 'headlessos-shared';

const PASSWORD_SERVER = { id: 'p1', name: 'pi', host: '192.168.1.20', port: 22, username: 'pi', authMethod: 'password' } as ServerConfig;
const KEY_SERVER = { id: 'k1', name: 'vps', host: '10.0.0.5', port: 22, username: 'root', authMethod: 'privateKey' } as ServerConfig;

let app: FastifyInstance;
let connect: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  state.locked = true;
  connect = vi.fn(async () => undefined);
  app = Fastify({ logger: false });
  const servers = [PASSWORD_SERVER, KEY_SERVER];
  const configStore = {
    getServers: async () => servers,
    getServer: async (id: string) => servers.find((s) => s.id === id),
    damagedListFile: () => null,
  } as unknown as ConfigStore;
  const connectionManager = { connect, getState: (serverId: string) => ({ serverId, status: 'connected' }) } as unknown as ConnectionManager;
  await app.register(serverRoutes, { configStore, connectionManager });
});

afterEach(() => app.close());

const post = (id: string, payload = {}) => app.inject({ method: 'POST', url: `/api/servers/${id}/connect`, payload });

describe('while saved logins are locked', () => {
  it('says so for a key server, and does not say to remove it', async () => {
    const res = await post('k1');
    expect(res.statusCode).toBe(423);
    expect(res.json().failure.title).toBe('Your saved logins are locked');
    expect(res.body).not.toContain('remove this server');
    expect(connect).not.toHaveBeenCalled();
  });

  it('says so for a password server with nothing typed', async () => {
    const res = await post('p1');
    expect(res.json().failure.help).toBe('saved-logins-are-locked');
    expect(connect).not.toHaveBeenCalled();
  });

  it('still signs in with a password typed at sign-in', async () => {
    expect((await post('p1', { password: 'typed' })).statusCode).toBe(200);
    expect(connect).toHaveBeenCalledOnce();
  });

  it('does not mark a key server as having lost its key', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/servers' })).json() as Array<{ id: string; keyLost?: boolean }>;
    expect(list.find((s) => s.id === 'k1')?.keyLost).toBeUndefined();
  });

  it('tells the window, with what to do', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/servers/notice' });
    expect(res.json()).toMatchObject({ secretStore: 'locked', locked: { title: 'Your saved logins are locked' } });
  });
});

describe('once they open', () => {
  beforeEach(() => { state.locked = false; });

  it('goes back to the lost-key message for a key that really is gone', async () => {
    expect((await post('k1')).json().failure.title).toBe("This server's saved key can't be read");
  });

  it('has nothing to report', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/servers/notice' });
    expect(res.json()).toMatchObject({ locked: null, secretStore: 'keychain' });
  });
});

describe('the locked message', () => {
  it('tells a Mac user what to click', () => {
    expect(loginsLockedFailure('darwin', true).hint).toContain('Always Allow');
  });

  it('tells a developer about the .env line', () => {
    expect(loginsLockedFailure('win32', false).hint).toContain('HEADLESSOS_INSTALL_SECRET');
  });

  it('says a typed password still works elsewhere', () => {
    expect(loginsLockedFailure('win32', true).hint).toContain('type a password');
  });
});
