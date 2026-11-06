// M15.12: credentials stay in the backend, on every route that returns a server
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serverRoutes } from '../../src/routes/servers.js';
import { ConfigStore } from '../../src/config/store.js';
import type { ConnectionManager } from '../../src/ssh/connection-manager.js';
import type { ServerConfig } from 'headlessos-shared';

const SAVED = {
  id: 's1',
  name: 'pi',
  host: '192.168.1.20',
  port: 22,
  username: 'pi',
  authMethod: 'privateKey',
  password: 'battery staple',
  privateKeyPath: '-----BEGIN OPENSSH PRIVATE KEY-----',
  passphrase: 'correct horse',
} as ServerConfig;

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify();
  const configStore = {
    getServers: async () => [SAVED],
    addServer: async () => SAVED,
    updateServer: async () => SAVED,
  } as unknown as ConfigStore;
  const connectionManager = { getState: () => ({ status: 'disconnected' }) } as unknown as ConnectionManager;
  await app.register(serverRoutes, { configStore, connectionManager });
});

afterEach(() => app.close());

function expectNoSecrets(body: string) {
  expect(body).toContain('192.168.1.20');
  expect(body).not.toContain('PRIVATE KEY');
  expect(body).not.toContain('correct horse');
  expect(body).not.toContain('battery staple');
}

describe('server routes', () => {
  it('leave credentials out of the list', async () => {
    expectNoSecrets((await app.inject({ method: 'GET', url: '/api/servers' })).body);
  });

  it('leave them out after adding a server', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/servers', payload: { name: 'pi' } });
    expectNoSecrets(res.body);
  });

  it('leave them out after updating a server', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/servers/s1', payload: { name: 'pi' } });
    expectNoSecrets(res.body);
  });
});
