// EX1.8: Dynamic UI REST + WebSocket routes
// @see docs/phases/phase-ex1.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import {
  DynamicUIGenerator,
  type GenerateInput,
  type DynamicUIMessage,
} from '../dynamic-ui/generator.js';
import type { DynamicUIDiskCache } from '../cache/dynamic-ui-cache.js';
import { validateCommand, shellEscape, SecurityError } from '../security/validators.js';
import { WriteBackRequestSchema, executeWriteBack } from '../agent/writeback.js';

interface DynamicUIRouteDeps {
  connectionManager: ConnectionManager;
  generator: DynamicUIGenerator;
  diskCache?: DynamicUIDiskCache;
}

export async function dynamicUIRoutes(
  fastify: FastifyInstance,
  opts: DynamicUIRouteDeps,
): Promise<void> {
  const { connectionManager, generator, diskCache } = opts;
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
    Body: { tool: string; command: string; rawOutput: string; bypassCache?: boolean };
  }>('/api/servers/:serverId/dynamic-ui/generate', async (req, reply) => {
    const { serverId } = req.params;
    requireConnected(serverId);

    const { tool, command, rawOutput, bypassCache } = req.body;
    if (!tool || !command || !rawOutput) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: tool, command, rawOutput',
      });
    }

    try {
      const result = await generator.generate({
        tool, command, rawOutput, serverId,
        bypassCache: bypassCache ?? false,
      });
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

  // ── REST: Widget data refresh (EX1.12) ─────────────────────────

  fastify.post<{
    Params: { serverId: string };
    Body: { command: string; parseMode?: 'json' | 'text' };
  }>('/api/servers/:serverId/dynamic-ui/refresh', async (req, reply) => {
    const { serverId } = req.params;
    const { command, parseMode } = req.body;

    if (!command) {
      return reply.status(400).send({ error: 'Missing field: command' });
    }

    requireConnected(serverId);

    try {
      // SECURITY: widget refresh must only run allowlisted (read-only) commands.
      // Without this, the raw body `command` was passed straight to exec() — RCE.
      validateCommand(command);

      const result = await connectionManager.exec(serverId, command, 10000);
      const rawOutput = result.stdout || result.stderr;

      // Parse based on mode
      let data: unknown;
      if (parseMode === 'json') {
        try {
          data = JSON.parse(rawOutput.trim());
        } catch {
          data = rawOutput;
        }
      } else {
        data = rawOutput;
      }

      return reply.send({ success: true, data, rawOutput });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run refresh command';
      return reply.status(err instanceof SecurityError ? 403 : 500).send({ success: false, error: message });
    }
  });

  // ── REST: Action execution (EX1.14) ────────────────────────────

  fastify.post<{
    Params: { serverId: string };
    Body: { command: string; params?: Record<string, string> };
  }>('/api/servers/:serverId/dynamic-ui/execute-action', async (req, reply) => {
    const { serverId } = req.params;
    const { command, params } = req.body;

    if (!command) {
      return reply.status(400).send({ error: 'Missing field: command' });
    }

    requireConnected(serverId);

    try {
      // Substitute {placeholder} values with shell-escaped params
      let resolvedCommand = command;
      if (params && typeof params === 'object') {
        for (const [key, value] of Object.entries(params)) {
          const placeholder = `{${key}}`;
          if (resolvedCommand.includes(placeholder)) {
            resolvedCommand = resolvedCommand.replaceAll(placeholder, shellEscape(String(value)));
          }
        }
      }

      // Validate the resolved command against the allowlist
      const rule = validateCommand(resolvedCommand);

      // EX9.2 (ADR-024): a button carrying free-form command text may only read.
      // Changes go through catalog actions and the owner's approval (/actions/preview).
      if (rule.risk === 'medium' || rule.risk === 'high') {
        return reply.status(403).send({
          success: false,
          error: 'This button was generated before actions existed and would change the server. Regenerate the view to get an approvable action.',
        });
      }

      // Execute the command (15s timeout for actions)
      const result = await connectionManager.exec(serverId, resolvedCommand, 15000);

      if (result.exitCode !== 0 && result.stderr) {
        return reply.status(500).send({
          success: false,
          error: `Command failed (exit ${result.exitCode}): ${result.stderr.substring(0, 200)}`,
        });
      }

      return reply.send({
        success: true,
        output: result.stdout || result.stderr,
        command: resolvedCommand,
        risk: rule.risk,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action execution failed';
      return reply.status(err instanceof SecurityError ? 403 : 500).send({
        success: false,
        error: message,
      });
    }
  });

  // ── REST: Write-back (EX2.9) ───────────────────────────────────

  fastify.post<{
    Params: { serverId: string };
    Body: Record<string, unknown>;
  }>('/api/servers/:serverId/dynamic-ui/write-back', async (req, reply) => {
    const { serverId } = req.params;
    requireConnected(serverId);

    const parsed = WriteBackRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid write-back request',
        details: parsed.error.issues,
      });
    }

    try {
      const result = await executeWriteBack(serverId, parsed.data, connectionManager);
      return reply.send(result);
    } catch (err) {
      if (err instanceof SecurityError) {
        return reply.status(403).send({
          success: false,
          error: err.message,
        });
      }
      const message = err instanceof Error ? err.message : 'Write-back failed';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

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

  // ── Favorites ──────────────────────────────────────────────────

  fastify.get('/api/dynamic-ui/favorites', async (_req, reply) => {
    if (!diskCache) {
      return reply.status(501).send({ error: 'Disk cache not available' });
    }
    const favorites = await diskCache.getFavorites();
    return reply.send({ favorites });
  });

  fastify.post<{
    Body: { tool: string; command: string; view: Record<string, unknown>; label?: string };
  }>('/api/dynamic-ui/favorites', async (req, reply) => {
    if (!diskCache) {
      return reply.status(501).send({ error: 'Disk cache not available' });
    }
    const { tool, command, view, label } = req.body;
    if (!tool || !command || !view) {
      return reply.status(400).send({ error: 'Missing fields: tool, command, view' });
    }
    const parsed = DynamicViewSchema.safeParse(view);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid view schema', details: parsed.error.issues });
    }
    const favorite = await diskCache.addFavorite(tool, command, parsed.data, label ?? tool);
    return reply.status(201).send({ favorite });
  });

  fastify.delete<{ Params: { id: string } }>(
    '/api/dynamic-ui/favorites/:id',
    async (req, reply) => {
      if (!diskCache) {
        return reply.status(501).send({ error: 'Disk cache not available' });
      }
      const removed = await diskCache.removeFavorite(req.params.id);
      if (!removed) {
        return reply.status(404).send({ error: 'Favorite not found' });
      }
      return reply.status(204).send();
    },
  );

  // ── Cache Stats ────────────────────────────────────────────────

  fastify.get('/api/dynamic-ui/cache/stats', async (_req, reply) => {
    if (!diskCache) {
      return reply.status(501).send({ error: 'Disk cache not available' });
    }
    const stats = await diskCache.getStats();
    return reply.send({ stats });
  });
}

// ── Helpers ────────────────────────────────────────────────────────

function templateSummary(t: { id: string; name: string; description: string; tags: string[] }) {
  return { id: t.id, name: t.name, description: t.description, tags: t.tags };
}
