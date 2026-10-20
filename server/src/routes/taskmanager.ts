// M7.1 / M12.8: Task Manager Routes — thin HTTP wrappers around TaskManagerService
// @see docs/phases/phase-7.md, docs/phases/phase-12.md

import type { FastifyInstance } from 'fastify';
import type { TaskManagerService } from '../services/domain/taskmanager-service.js';

interface TaskManagerRouteOpts {
  taskManagerService: TaskManagerService;
}

export async function taskManagerRoutes(
  fastify: FastifyInstance,
  opts: TaskManagerRouteOpts,
): Promise<void> {
  const { taskManagerService } = opts;

  // ── GET /api/servers/:id/taskmanager — full snapshot ──

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/taskmanager',
    async (req, reply) => {
      const r = await taskManagerService.getSnapshot(req.params.id);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, ...r.data };
    },
  );

  // ── GET /api/servers/:id/taskmanager/process/:pid — detail card (EX8.6) ──

  fastify.get<{ Params: { id: string; pid: string } }>(
    '/api/servers/:id/taskmanager/process/:pid',
    async (req, reply) => {
      const r = await taskManagerService.getProcessDetail(req.params.id, req.params.pid);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, data: r.data };
    },
  );

  // ── POST /api/servers/:id/taskmanager/kill ─────────────

  fastify.post<{ Params: { id: string }; Body: { pid: number; signal?: number } }>(
    '/api/servers/:id/taskmanager/kill',
    async (req, reply) => {
      const { pid, signal = 15 } = req.body ?? {};
      const r = await taskManagerService.killProcess(req.params.id, pid, signal);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true };
    },
  );
}
