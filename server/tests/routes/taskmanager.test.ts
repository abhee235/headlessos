// EX8.9: Task Manager route tests — Users, App history, Startup apps
// @see docs/phases/phase-ex8.md

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { taskManagerRoutes } from '../../src/routes/taskmanager.js';
import type { TaskManagerService } from '../../src/services/domain/taskmanager-service.js';

const USERS = {
  accounts: [{ name: 'root', uid: 0, shell: '/bin/bash', kind: 'admin' }],
  sessions: [{ user: 'root', tty: 'pts/0', from: null, loginAt: '2026-10-20T17:06:32.000Z' }],
  currentUser: 'testuser',
};
const HISTORY = {
  since: '2026-10-20T01:21:05.000Z',
  ioReadable: false,
  apps: [{ name: 'bash', cpuSeconds: 3, rssKb: 3328, instances: 1, readBytes: null, writeBytes: null, users: ['root'] }],
};
const STARTUP = {
  init: 'sysv', pid1: 'sshd', bootedAt: '2026-10-20T01:21:05.000Z', boot: null,
  items: [{ id: 'ssh', name: 'OpenBSD Secure Shell server', command: '/etc/init.d/ssh', source: 'sysv', enabled: true, delayMs: null, impact: null, toggleable: true }],
};

function mockService() {
  return {
    getSnapshot: vi.fn(),
    getProcessDetail: vi.fn(),
    killProcess: vi.fn(),
    getUsers: vi.fn(async () => ({ ok: true, data: USERS })),
    getAppHistory: vi.fn(async () => ({ ok: true, data: HISTORY })),
    getStartup: vi.fn(async () => ({ ok: true, data: STARTUP })),
    setStartupItem: vi.fn(async () => ({ ok: true })),
  };
}

describe('Task Manager routes (EX8.9)', () => {
  let app: FastifyInstance;
  let svc: ReturnType<typeof mockService>;

  beforeEach(async () => {
    svc = mockService();
    app = Fastify();
    await app.register(taskManagerRoutes, { taskManagerService: svc as unknown as TaskManagerService });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET users → { success, data }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/servers/srv1/taskmanager/users' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: USERS });
    expect(svc.getUsers).toHaveBeenCalledWith('srv1');
  });

  it('GET app-history → { success, data }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/servers/srv1/taskmanager/app-history' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: HISTORY });
  });

  it('GET startup → { success, data }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/servers/srv1/taskmanager/startup' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: STARTUP });
  });

  it('maps service failures to their status code', async () => {
    svc.getStartup.mockResolvedValueOnce({ ok: false, error: 'Server "srv1" is not connected', statusCode: 400 } as never);
    const res = await app.inject({ method: 'GET', url: '/api/servers/srv1/taskmanager/startup' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ success: false, error: 'Server "srv1" is not connected' });
  });

  it('POST startup/:item/:action passes the decoded item and action', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/servers/srv1/taskmanager/startup/nginx.service/disable' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });
    expect(svc.setStartupItem).toHaveBeenCalledWith('srv1', 'nginx.service', 'disable');
  });

  it('POST decodes URL-encoded ids (cron @reboot#1) and returns the 400', async () => {
    svc.setStartupItem.mockResolvedValueOnce({ ok: false, error: 'read-only', statusCode: 400 } as never);
    const res = await app.inject({
      method: 'POST',
      url: `/api/servers/srv1/taskmanager/startup/${encodeURIComponent('@reboot#1')}/disable`,
    });
    expect(res.statusCode).toBe(400);
    expect(svc.setStartupItem).toHaveBeenCalledWith('srv1', '@reboot#1', 'disable');
  });
});
