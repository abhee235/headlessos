// EX1.8: Dynamic UI REST + WebSocket routes
// @see docs/phases/phase-ex1.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import {
  DynamicUIGenerator,
  type GenerateInput,
  type DynamicUIMessage,
} from '../dynamic-ui/generator.js';

interface DynamicUIRouteDeps {
  connectionManager: ConnectionManager;
  generator: DynamicUIGenerator;
}

export async function dynamicUIRoutes(
  fastify: FastifyInstance,
  opts: DynamicUIRouteDeps,
): Promise<void> {
  const { connectionManager, generator } = opts;
  const registry = generator.getRegistry();

  // ── Helpers ────────────────────────────────────────────────────

  function requireConnected(serverId: string): void {
    const state = connectionManager.getState(serverId);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${serverId}" is not connected`), {
        statusCode: 400,
      });
    }
  }

  // ── REST: Generate DynamicView ─────────────────────────────────

  fastify.post<{
    Params: { serverId: string };
    Body: { tool: string; command: string; rawOutput: string };
  }>('/api/servers/:serverId/dynamic-ui/generate', async (req, reply) => {
    const { serverId } = req.params;
    requireConnected(serverId);

    const { tool, command, rawOutput } = req.body;
    if (!tool || !command || !rawOutput) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: tool, command, rawOutput',
      });
    }

    try {
      const result = await generator.generate({ tool, command, rawOutput, serverId });
      return {
        success: true,
        data: {
          view: result.view,
          source: result.source,
          templateId: result.templateId,
          llmStats: result.llmStats,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error generating dynamic UI';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  // ── REST: List templates ───────────────────────────────────────

  fastify.get('/api/dynamic-ui/templates', async () => {
    const templates = registry.listAll();
    return {
      success: true,
      data: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        tags: t.tags,
        matchPatterns: t.matchPatterns,
      })),
    };
  });

  // ── REST: Get single template ──────────────────────────────────

  fastify.get<{ Params: { templateId: string } }>(
    '/api/dynamic-ui/templates/:templateId',
    async (req, reply) => {
      const { templateId } = req.params;
      const template = registry.getById(templateId);
      if (!template) {
        return reply.status(404).send({
          success: false,
          error: `Template "${templateId}" not found`,
        });
      }
      return { success: true, data: template };
    },
  );

  // ── REST: Search templates ─────────────────────────────────────

  fastify.get<{ Querystring: { q?: string; tag?: string; command?: string } }>(
    '/api/dynamic-ui/templates/search',
    async (req) => {
      const { q, tag, command } = req.query;

      if (command) {
        const matches = registry.matchCommand(command);
        return {
          success: true,
          data: matches.map((m) => ({
            templateId: m.template.id,
            name: m.template.name,
            matchedPattern: m.matchedPattern,
            confidence: m.confidence,
          })),
        };
      }

      if (tag) {
        return { success: true, data: registry.searchByTag(tag).map(templateSummary) };
      }

      if (q) {
        return { success: true, data: registry.search(q).map(templateSummary) };
      }

      return { success: true, data: registry.listAll().map(templateSummary) };
    },
  );

  // ── WebSocket: Streaming generation ────────────────────────────

  fastify.get(
    '/ws/dynamic-ui/:serverId',
    { websocket: true },
    (socket, req) => {
      const { serverId } = req.params as { serverId: string };

      socket.on('message', (data: Buffer | string) => {
        const raw = typeof data === 'string' ? data : data.toString();
        let msg: { tool?: string; command?: string; rawOutput?: string };
        try {
          msg = JSON.parse(raw);
        } catch {
          sendMsg({ type: 'error', message: 'Invalid JSON' });
          return;
        }

        if (!msg.tool || !msg.command || !msg.rawOutput) {
          sendMsg({ type: 'error', message: 'Missing fields: tool, command, rawOutput' });
          return;
        }

        // Check connection
        const state = connectionManager.getState(serverId);
        if (state.status !== 'connected') {
          sendMsg({ type: 'error', message: `Server "${serverId}" is not connected` });
          return;
        }

        const input: GenerateInput = {
          tool: msg.tool,
          command: msg.command,
          rawOutput: msg.rawOutput,
          serverId,
        };

        // Find template for progress message
        const matches = generator.getRegistry().matchCommand(msg.command);
        const templateId = matches[0]?.template.id;

        sendMsg({ type: 'generating', tool: msg.tool, templateId });

        generator
          .generate(input)
          .then((result) => {
            sendMsg({
              type: 'complete',
              view: result.view,
              source: result.source,
              templateId: result.templateId,
            });
          })
          .catch((err) => {
            const message =
              err instanceof Error ? err.message : 'Unknown error generating dynamic UI';
            sendMsg({ type: 'error', message });
          });
      });

      function sendMsg(msg: DynamicUIMessage): void {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify(msg));
        }
      }

      socket.on('error', () => {
        /* ignore socket errors */
      });
    },
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function templateSummary(t: { id: string; name: string; description: string; tags: string[] }) {
  return { id: t.id, name: t.name, description: t.description, tags: t.tags };
}
