// M11.1 / M12.8: Fleet Routes — thin HTTP wrappers around FleetService
// @see docs/PROGRESS.md, docs/phases/phase-12.md

import type { FastifyInstance } from 'fastify';
import type { FleetService } from '../services/domain/fleet-service.js';

// Re-export these types so the client can still import from this module if needed
export type { FleetServerSummary, FleetOverview } from '../services/domain/fleet-service.js';

interface FleetRouteOpts {
  fleetService: FleetService;
}

export async function fleetRoutes(
  fastify: FastifyInstance,
  opts: FleetRouteOpts,
): Promise<void> {
  const { fleetService } = opts;

  // ── GET /api/fleet/overview ───────────────────────────

  fastify.get('/api/fleet/overview', async (_req, reply) => {
    const r = await fleetService.getOverview();
    if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
    return { success: true, data: r.data };
  });

  // ── PUT /api/servers/:id/tags ─────────────────────────

  fastify.put<{ Params: { id: string }; Body: { tags: string[] } }>(
    '/api/servers/:id/tags',
    async (req, reply) => {
      const { tags } = req.body ?? {};
      const r = await fleetService.setTags(req.params.id, tags);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, data: r.data };
    },
  );
}
