// EX2.2: get_server_context tool (READ tier)
// @see docs/phases/phase-ex2.md — EX2.2
//
// Returns cached server metadata (OS, architecture, installed tools, etc.)
// Uses a lightweight exec to gather info if not already cached.

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';

const GetServerContextParams = z.object({
  refresh: z.boolean().optional()
    .describe('Force refresh of server context (default: false, uses cached data)'),
});

// Commands to gather server context — all read-only
const CONTEXT_COMMANDS = [
  { key: 'os', cmd: 'cat /etc/os-release', description: 'OS release info' },
  { key: 'hostname', cmd: 'hostname', description: 'Server hostname' },
  { key: 'arch', cmd: 'uname -m', description: 'Architecture' },
  { key: 'kernel', cmd: 'uname -r', description: 'Kernel version' },
  { key: 'uptime', cmd: 'uptime', description: 'System uptime' },
  { key: 'memory', cmd: 'free -h', description: 'Memory usage' },
  { key: 'disk', cmd: 'df -h', description: 'Disk usage' },
  { key: 'docker', cmd: 'docker --version', description: 'Docker version (if installed)' },
  { key: 'nginx', cmd: 'nginx -v', description: 'Nginx version (if installed)' },
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
      const results = await Promise.allSettled(
        CONTEXT_COMMANDS.map(async ({ key, cmd, description }) => {
          try {
            const result = await context.ssh.exec(context.serverId, cmd, 10_000);
            return {
              key,
              description,
              value: result.exitCode === 0
                ? result.stdout.trim()
                : `(unavailable: ${result.stderr.trim() || 'exit code ' + result.exitCode})`,
            };
          } catch {
            return { key, description, value: '(unavailable: command failed)' };
          }
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
