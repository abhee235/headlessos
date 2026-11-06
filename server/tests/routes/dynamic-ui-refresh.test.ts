// M15.9: a widget refresh runs on a timer with no click, and a model can write its command.
// Through the real routes, so the two can't drift apart.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { dynamicUIRoutes } from '../../src/routes/dynamic-ui.js';
import type { ConnectionManager } from '../../src/ssh/connection-manager.js';
import type { DynamicUIGenerator } from '../../src/dynamic-ui/generator.js';

const exec = vi.fn();
let app: FastifyInstance;

beforeEach(async () => {
  exec.mockReset().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
  app = Fastify();
  await app.register(websocket);
  await app.register(dynamicUIRoutes, {
    connectionManager: {
      getState: () => ({ status: 'connected' }),
      exec,
    } as unknown as ConnectionManager,
    generator: { getRegistry: () => ({}) } as unknown as DynamicUIGenerator,
  });
});

afterEach(() => app.close());

const refresh = (command: string) =>
  app.inject({ method: 'POST', url: '/api/servers/s1/dynamic-ui/refresh', payload: { command } });

const action = (command: string) =>
  app.inject({ method: 'POST', url: '/api/servers/s1/dynamic-ui/execute-action', payload: { command } });

describe('widget refresh', () => {
  it.each([
    ['stops a service', 'sudo systemctl stop nginx'],
    ['removes a container', 'docker rm 0123456789ab'],
    ['removes a package', 'sudo apt remove -y nginx'],
    ['turns off the firewall', 'sudo ufw --force disable'],
    ['kills a process', 'kill -9 1234'],
    ['overwrites a file', 'docker ps > /root/.bashrc'],
    ['appends to a file', 'docker ps >> /root/.bashrc'],
  ])('refuses a command that %s', async (_name, command) => {
    const res = await refresh(command);
    expect(res.statusCode).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('refuses find -delete, which the allowlist alone would pass', async () => {
    const res = await refresh('find /etc -maxdepth 1 -delete');
    expect(res.statusCode).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it.each(['df -h', 'docker ps', 'systemctl status nginx', 'crontab -l 2>&1'])('runs %s', async (command) => {
    const res = await refresh(command);
    expect(res.statusCode).toBe(200);
    expect(exec).toHaveBeenCalledOnce();
  });
});

describe('view buttons', () => {
  it('refuses a change, as it always has', async () => {
    const res = await action('sudo systemctl stop nginx');
    expect(res.statusCode).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('refuses a redirect to a file', async () => {
    const res = await action('docker ps > /root/.bashrc');
    expect(res.statusCode).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('still runs a read', async () => {
    const res = await action('docker ps');
    expect(res.statusCode).toBe(200);
    expect(exec).toHaveBeenCalledOnce();
  });
});
