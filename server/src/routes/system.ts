// M2.1 / M12.8: System Dashboard Routes — thin HTTP wrappers around SystemService
// @see docs/phases/phase-2.md, docs/phases/phase-12.md

import type { FastifyInstance } from 'fastify';
import type { SystemService } from '../services/domain/system-service.js';

interface SystemRouteOpts {
  systemService: SystemService;
}

export async function systemRoutes(
  fastify: FastifyInstance,
  opts: SystemRouteOpts,
): Promise<void> {
  const { systemService } = opts;

  // ── GET /api/servers/:id/system — full dashboard ──────

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/system',
    async (req, reply) => {
      const r = await systemService.getDashboard(req.params.id);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, ...r.data };
    },
  );

  // ── GET /api/servers/:id/system/disk — disk only ──────

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/system/disk',
    async (req, reply) => {
      const r = await systemService.getDisk(req.params.id);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, ...r.data };
    },
  );

  // ── GET /api/servers/:id/system/memory — memory only ──

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/system/memory',
    async (req, reply) => {
      const r = await systemService.getMemory(req.params.id);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, ...r.data };
    },
  );
}
