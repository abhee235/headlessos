// EX6-A.5: Session API Routes
// @see docs/phases/phase-ex6.md
// @see docs/DECISIONS.md (ADR-021)
//
// REST CRUD for per-server desktop sessions. Used by useSessionsStore
// on the client to load / persist / hibernate / wake sessions.

import type { FastifyInstance } from 'fastify';
import type { SessionStore } from '../config/session-store.js';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import {
  SessionStateSchema,
  type SessionState,
} from 'headlessos-shared/schemas/session';

export async function sessionRoutes(
  fastify: FastifyInstance,
  opts: { sessionStore: SessionStore; connectionManager: ConnectionManager },
): Promise<void> {
  const { sessionStore, connectionManager } = opts;

  // ── GET /api/sessions — list summaries ────────────────

  fastify.get('/api/sessions', async () => {
    return sessionStore.listSessions();
  });

  // ── GET /api/sessions/:serverId — full state ──────────

  fastify.get<{ Params: { serverId: string } }>(
    '/api/sessions/:serverId',
    async (req, reply) => {
      const state = await sessionStore.getSession(req.params.serverId);
      if (!state) {
        reply.code(404);
        return { error: 'Session not found' };
      }
      return state;
    },
  );

  // ── PUT /api/sessions/:serverId — upsert full state ───

  fastify.put<{
    Params: { serverId: string };
    Body: SessionState;
  }>('/api/sessions/:serverId', async (req, reply) => {
    // Validate body matches schema; reject mismatch between path id and body id
    const parsed = SessionStateSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid session state', details: parsed.error.flatten() };
    }
    if (parsed.data.serverId !== req.params.serverId) {
      reply.code(400);
      return { error: 'serverId in body does not match path' };
    }
    await sessionStore.saveSession(parsed.data);
    reply.code(204);
  });

  // ── DELETE /api/sessions/:serverId ────────────────────

  fastify.delete<{ Params: { serverId: string } }>(
    '/api/sessions/:serverId',
    async (req, reply) => {
      await sessionStore.deleteSession(req.params.serverId);
      reply.code(204);
    },
  );

  // ── POST /api/sessions/:serverId/hibernate ────────────
  //
  // Marks the persisted session as hibernated AND drops the SSH
  // connection. Client should PUT the latest state first, then call this.

  fastify.post<{ Params: { serverId: string } }>(
    '/api/sessions/:serverId/hibernate',
    async (req, reply) => {
      const { serverId } = req.params;
      await sessionStore.markHibernated(serverId);
      try {
        await connectionManager.disconnect(serverId);
      } catch {
        // Already disconnected — fine
      }
      reply.code(204);
    },
  );
}
