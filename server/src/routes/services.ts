// M3.6 / M12.8: Services Routes — thin HTTP wrappers around SystemdService
// @see docs/phases/phase-3.md, docs/phases/phase-12.md

import type { FastifyInstance } from 'fastify';
import type { SystemdService } from '../services/domain/systemd-service.js';

interface ServicesRouteOpts {
  systemdService: SystemdService;
}

export async function servicesRoutes(
  fastify: FastifyInstance,
  opts: ServicesRouteOpts,
): Promise<void> {
  const { systemdService } = opts;

  // ── GET /api/servers/:id/services ─────────────────────

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/services',
    async (req, reply) => {
      const r = await systemdService.listServices(req.params.id);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return {
        success: true,
        data: r.data!.services,
        systemdAvailable: r.data!.systemdAvailable,
        init: r.data!.init, // EX8.9
      };
    },
  );

  // ── POST /api/servers/:id/services/:serviceName/:action ──

  fastify.post<{ Params: { id: string; serviceName: string; action: string } }>(
    '/api/servers/:id/services/:serviceName/:action',
    async (req, reply) => {
      const { id, serviceName, action } = req.params;
      const r = await systemdService.controlService(id, serviceName, action);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true };
    },
  );

  // ── GET /api/servers/:id/services/:serviceName/status ──

  fastify.get<{ Params: { id: string; serviceName: string } }>(
    '/api/servers/:id/services/:serviceName/status',
    async (req, reply) => {
      const { id, serviceName } = req.params;
      const r = await systemdService.getServiceStatus(id, serviceName);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, data: r.data };
    },
  );

  // ── GET /api/servers/:id/services/:serviceName/logs ───

  fastify.get<{
    Params: { id: string; serviceName: string };
    Querystring: { lines?: string };
  }>(
    '/api/servers/:id/services/:serviceName/logs',
    async (req, reply) => {
      const { id, serviceName } = req.params;
      const lines = req.query.lines ?? '100';
      const r = await systemdService.getServiceLogs(id, serviceName, lines);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, data: r.data };
    },
  );
}
