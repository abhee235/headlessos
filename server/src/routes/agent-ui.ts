// EX2.12: WebSocket Protocol for UI Agent
// @see docs/phases/phase-ex2.md — EX2.12
//
// WebSocket endpoint that connects the AgentPanel (frontend) with the UIAgent
// (backend). Supports concurrent sessions via requestId multiplexing.
// Messages: generate, abort, write_back (client→server) and all AgentEvent
// subtypes (server→client).

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { ModelRouter } from '../llm/model-router.js';
import type { TemplateRegistry } from '../dynamic-ui/template-registry.js';
import { UIAgent, type UIAgentEvent } from '../agent/ui-agent.js';
import { Planner } from '../agent/planner.js';
import { ReactiveExecutor } from '../agent/executor.js';
import { PostGenerationReflector } from '../agent/reflector.js';
import { ToolRegistry } from '../agent/tools/tool-registry.js';
import { WriteBackRequestSchema, executeWriteBack } from '../agent/writeback.js';
import { SecurityError } from '../security/validators.js';

// ── Types ──

/** Client → Server message */
interface ClientMessage {
  type: 'generate' | 'abort' | 'write_back';
  requestId: string;
  prompt?: string;
  writeBack?: unknown;
  values?: Record<string, unknown>;
}

/** Server → Client message (all events include requestId) */
interface ServerMessage {
  type: string;
  requestId: string;
  [key: string]: unknown;
}

// ── Route Deps ──

export interface AgentUIRouteDeps {
  connectionManager: ConnectionManager;
  modelRouter: ModelRouter;
  templateRegistry: TemplateRegistry;
}

// ── Active session tracking ──

interface ActiveSession {
  abortController: AbortController;
  running: boolean;
}

// ── Route Registration ──

export async function agentUIRoutes(
  fastify: FastifyInstance,
  opts: AgentUIRouteDeps,
): Promise<void> {
  const { connectionManager, modelRouter, templateRegistry } = opts;

  // ── WebSocket: /ws/ui-agent/:serverId ──

  fastify.get<{ Params: { serverId: string } }>(
    '/ws/ui-agent/:serverId',
    { websocket: true },
    (socket, req) => {
      const { serverId } = req.params;
      const sessions = new Map<string, ActiveSession>();

      // Build agent per connection (cheap — just wiring refs)
      const toolRegistry = new ToolRegistry();
      const planner = new Planner(modelRouter);
      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const reflector = new PostGenerationReflector(modelRouter);

      const agent = new UIAgent({
        modelRouter,
        planner,
        executor,
        reflector,
        ssh: connectionManager,
        templateRegistry,
      });

      // ── Helpers ──

      function send(msg: ServerMessage): void {
        try {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify(msg));
          }
        } catch {
          // Socket may have closed
        }
      }

      function sendError(requestId: string, message: string): void {
        send({ type: 'error', requestId, message });
      }

      // ── Handle incoming messages ──

      socket.on('message', (data: Buffer | string) => {
        const raw = typeof data === 'string' ? data : data.toString();

        let msg: ClientMessage;
        try {
          msg = JSON.parse(raw) as ClientMessage;
        } catch {
          send({ type: 'error', requestId: 'unknown', message: 'Invalid JSON' });
          return;
        }

        if (!msg.type || !msg.requestId) {
          send({ type: 'error', requestId: msg.requestId ?? 'unknown', message: 'Missing type or requestId' });
          return;
        }

        switch (msg.type) {
          case 'generate':
            handleGenerate(msg);
            break;
          case 'abort':
            handleAbort(msg);
            break;
          case 'write_back':
            handleWriteBack(msg);
            break;
          default:
            sendError(msg.requestId, `Unknown message type: ${msg.type}`);
        }
      });

      // ── generate ──

      function handleGenerate(msg: ClientMessage): void {
        if (!msg.prompt) {
          sendError(msg.requestId, 'Missing prompt');
          return;
        }

        // Check server connected
        const state = connectionManager.getState(serverId);
        if (state.status !== 'connected') {
          sendError(msg.requestId, `Server "${serverId}" is not connected`);
          return;
        }

        // Prevent duplicate sessions
        if (sessions.has(msg.requestId)) {
          sendError(msg.requestId, 'Session already exists for this requestId');
          return;
        }

        const abortController = new AbortController();
        sessions.set(msg.requestId, { abortController, running: true });

        // Run agent in background (async generator)
        void runAgent(msg.requestId, msg.prompt, abortController.signal);
      }

      async function runAgent(requestId: string, prompt: string, signal: AbortSignal): Promise<void> {
        try {
          for await (const event of agent.generate(serverId, prompt, { signal })) {
            sendAgentEvent(requestId, event);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Agent error';
          sendError(requestId, message);
        } finally {
          const session = sessions.get(requestId);
          if (session) {
            session.running = false;
          }
        }
      }

      function sendAgentEvent(requestId: string, event: UIAgentEvent): void {
        // Spread event into server message with requestId
        send({ ...event, requestId } as ServerMessage);
      }

      // ── abort ──

      function handleAbort(msg: ClientMessage): void {
        const session = sessions.get(msg.requestId);
        if (!session) {
          sendError(msg.requestId, 'No active session for this requestId');
          return;
        }

        session.abortController.abort();
        sessions.delete(msg.requestId);
        send({ type: 'aborted', requestId: msg.requestId });
      }

      // ── write_back ──

      function handleWriteBack(msg: ClientMessage): void {
        if (!msg.writeBack || !msg.values) {
          sendError(msg.requestId, 'Missing writeBack or values');
          return;
        }

        const parsed = WriteBackRequestSchema.safeParse({
          writeBack: msg.writeBack,
          values: msg.values,
        });

        if (!parsed.success) {
          send({
            type: 'write_back_result',
            requestId: msg.requestId,
            success: false,
            error: 'Invalid write-back request',
          });
          return;
        }

        // Run async
        void executeWriteBackAsync(msg.requestId, parsed.data);
      }

      async function executeWriteBackAsync(
        requestId: string,
        request: { writeBack: Record<string, unknown>; values: Record<string, unknown> },
      ): Promise<void> {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await executeWriteBack(serverId, request as any, connectionManager);
          send({
            type: 'write_back_result',
            requestId,
            ...result,
          });
        } catch (err) {
          const isSecurityError = err instanceof SecurityError;
          send({
            type: 'write_back_result',
            requestId,
            success: false,
            error: isSecurityError
              ? `Security: ${(err as Error).message}`
              : (err instanceof Error ? err.message : 'Write-back failed'),
          });
        }
      }

      // ── Cleanup on socket close ──

      socket.on('close', () => {
        // Abort all running sessions
        for (const [, session] of sessions) {
          if (session.running) {
            session.abortController.abort();
          }
        }
        sessions.clear();
      });

      socket.on('error', () => {
        // Ignore socket errors — will be cleaned up on close
      });
    },
  );
}
