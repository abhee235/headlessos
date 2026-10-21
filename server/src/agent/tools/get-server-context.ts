// EX2.2: get_server_context tool (READ tier)
// @see docs/phases/phase-ex2.md — EX2.2
//
// Returns cached server metadata (OS, architecture, installed tools, etc.)
// EX9.1: gathered through catalog actions, so it goes through the ActionRunner.

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';
import { ActionRunner } from '../actions/runner.js';

const GetServerContextParams = z.object({
  refresh: z.boolean().optional()
    .describe('Force refresh of server context (default: false, uses cached data)'),
});

// Catalog actions that describe the server — all read-only
const CONTEXT_ACTIONS: Array<{ key: string; action: string; params?: Record<string, unknown>; description: string }> = [
  { key: 'os', action: 'os_release', description: 'OS release info' },
  { key: 'kernel', action: 'kernel_info', description: 'Kernel, host name and architecture' },
  { key: 'uptime', action: 'uptime', description: 'System uptime' },
  { key: 'memory', action: 'memory_usage', description: 'Memory usage (MiB)' },
  { key: 'disk', action: 'disk_usage', description: 'Disk usage' },
  { key: 'docker', action: 'cli_locate', params: { program: 'docker' }, description: 'Docker (path if installed)' },
  { key: 'nginx', action: 'cli_locate', params: { program: 'nginx' }, description: 'Nginx (path if installed)' },
];

// Cache: serverId → context string
const contextCache = new Map<string, { data: string; timestamp: number }>();
const CACHE_TTL_MS = 300_000; // 5 minutes

export const getServerContextTool: AgentTool = {
  name: 'get_server_context',
  description: 'Get server metadata: OS, architecture, hostname, kernel, uptime, memory, disk, and installed tools (Docker, Nginx). Cached for 5 minutes. Use this at the start to understand the server environment before generating a UI schema.',
  parameters: GetServerContextParams,
  securityTier: 'read',

  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const args = GetServerContextParams.parse(rawArgs);
      const { refresh = false } = args;

      // Check cache
      const cached = contextCache.get(context.serverId);
      if (!refresh && cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        return {
          success: true,
          output: cached.data,
          metadata: { cached: true },
        };
      }

      // Gather context in parallel
      const runner = context.actions ?? new ActionRunner({ ssh: context.ssh });
      const results = await Promise.allSettled(
        CONTEXT_ACTIONS.map(async ({ key, action, params, description }) => {
          const result = await runner.run(context.serverId, action, params ?? {}, { runId: context.runId });
          return {
            key,
            description,
            value: result.ok && result.exitCode === 0 && result.stdout.trim()
              ? result.stdout.trim()
              : `(unavailable: ${result.stderr.trim() || result.error || 'not found'})`,
          };
        })
      );

      const lines: string[] = ['Server Context:'];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          lines.push(`  ${r.value.description} (${r.value.key}):`);
          // Indent multi-line output
          const valueLines = r.value.value.split('\n');
          for (const vl of valueLines) {
            lines.push(`    ${vl}`);
          }
        }
      }

      const data = lines.join('\n');

      // Update cache
      contextCache.set(context.serverId, { data, timestamp: Date.now() });

      return {
        success: true,
        output: data,
        metadata: { cached: false },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `get_server_context failed: ${(err as Error).message}`,
      };
    }
  },
};

/**
 * Clear server context cache (for testing).
 */
export function clearServerContextCache(): void {
  contextCache.clear();
}
