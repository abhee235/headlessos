// M11.5: Agent Routes — ReAct investigation agent endpoints
// @see docs/DECISIONS.md (ADR-013, ADR-014)

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { InvestigationAgent } from '../agent/investigation-agent.js';
import type { ApprovalGate } from '../agent/actions/approvals.js';

interface AgentRouteOpts {
  connectionManager: ConnectionManager;
  agent: InvestigationAgent;
  /** EX9.2: the owner answers approval cards here */
  approvals?: ApprovalGate;
}

export async function agentRoutes(
  fastify: FastifyInstance,
  opts: AgentRouteOpts,
): Promise<void> {
  const { connectionManager, agent, approvals } = opts;

  function requireConnected(serverId: string): void {
    const state = connectionManager.getState(serverId);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${serverId}" is not connected`), {
        statusCode: 400,
      });
    }
  }

  // ── POST /api/servers/:id/agent/investigate ───────────

  fastify.post<{
    Params: { id: string };
    Body: { question: string; maxSteps?: number; readOnly?: boolean; sessionId?: string };
  }>(
    '/api/servers/:id/agent/investigate',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const { question, maxSteps, readOnly, sessionId } = req.body ?? {};

      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        reply.code(400);
        return { success: false, error: 'question is required' };
      }

      if (question.length > 2000) {
        reply.code(400);
        return { success: false, error: 'question must be under 2000 characters' };
      }

      try {
        const result = await agent.investigate(id, question.trim(), {
          maxSteps: Math.min(maxSteps ?? 10, 15),
          // EX9.2: only an explicit false offers change actions (each asks the owner first)
          readOnly: readOnly !== false,
          // EX8.24: lets the client watch /ws/agent/:id/:sessionId while it runs
          ...(typeof sessionId === 'string' ? { sessionId } : {}),
        });

        return { success: true, data: result };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Agent investigation failed',
        };
      }
    },
  );

  // ── POST /api/servers/:id/agent/:sessionId/abort ──────

  fastify.post<{
    Params: { id: string; sessionId: string };
  }>(
    '/api/servers/:id/agent/:sessionId/abort',
    async (req) => {
      const { sessionId } = req.params;
      agent.abort(sessionId);
      return { success: true };
    },
  );

  // ── POST /api/servers/:id/agent/approvals/:approvalId (EX9.2) ──

  fastify.post<{
    Params: { id: string; approvalId: string };
    Body: { decision?: unknown };
  }>(
    '/api/servers/:id/agent/approvals/:approvalId',
    async (req, reply) => {
      const decision = req.body?.decision;
      if (decision !== 'allow' && decision !== 'deny') {
        reply.code(400);
        return { success: false, error: 'decision must be "allow" or "deny"' };
      }
      const outcome = approvals?.resolve(req.params.approvalId, decision, req.params.id) ?? null;
      if (!outcome) {
        reply.code(404);
        return { success: false, error: 'No such pending approval (it may have expired or been answered)' };
      }
      return { success: true, ...outcome };
    },
  );

  // ── WebSocket for real-time agent progress (M11.6) ────

  fastify.get<{
    Params: { id: string; sessionId: string };
  }>(
    '/ws/agent/:id/:sessionId',
    { websocket: true },
    (socket, req) => {
      const { sessionId } = req.params;

      const handler = (data: Record<string, unknown>) => {
        try {
          socket.send(JSON.stringify(data));
        } catch {
          // Socket may have closed
        }
      };

      agent.events.on(`step:${sessionId}`, handler);

      socket.on('message', (msg: Buffer) => {
        const text = msg.toString();
        if (text === 'abort') {
          agent.abort(sessionId);
        }
      });

      socket.on('close', () => {
        agent.events.off(`step:${sessionId}`, handler);
      });
    },
  );
}
