// EX8.9: Services route — response shape with init / startup / pid (Fastify inject)
// @see docs/phases/phase-ex8.md

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { servicesRoutes } from '../../src/routes/services.js';
import type { SystemdService } from '../../src/services/domain/systemd-service.js';

const SERVICES = [
  { name: 'ssh', loadState: 'loaded', activeState: 'active', subState: 'running', description: 'OpenBSD Secure Shell server', startup: 'automatic', pid: null },
];

describe('Services routes (EX8.9)', () => {
  let app: FastifyInstance;
  const svc = {
    listServices: vi.fn(),
    controlService: vi.fn(),
    getServiceStatus: vi.fn(),
    getServiceLogs: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(servicesRoutes, { systemdService: svc as unknown as SystemdService });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET services keeps data + systemdAvailable and adds init', async () => {
    svc.listServices.mockResolvedValue({ ok: true, data: { services: SERVICES, systemdAvailable: false, init: 'sysv' } });
    const res = await app.inject({ method: 'GET', url: '/api/servers/srv1/services' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: SERVICES, systemdAvailable: false, init: 'sysv' });
  });

  it('GET services maps failures', async () => {
    svc.listServices.mockResolvedValue({ ok: false, error: 'Failed to list units', statusCode: 500 });
    const res = await app.inject({ method: 'GET', url: '/api/servers/srv1/services' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ success: false, error: 'Failed to list units' });
  });

  it('POST services/:name/:action forwards to controlService', async () => {
    svc.controlService.mockResolvedValue({ ok: true });
    const res = await app.inject({ method: 'POST', url: '/api/servers/srv1/services/nginx/restart' });
    expect(res.statusCode).toBe(200);
    expect(svc.controlService).toHaveBeenCalledWith('srv1', 'nginx', 'restart');
  });
});
