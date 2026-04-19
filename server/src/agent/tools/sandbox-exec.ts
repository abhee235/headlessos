// EX5-B.2: sandbox_exec Agent Tool — Execute commands in isolated sandbox container
// @see docs/phases/phase-ex5.md — EX5-B.2

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';
import { isReadCommandAllowed } from '../command-allowlist.js';

// ── Parameters ──────────────────────────────────────────

const SandboxExecParams = z.object({
  command: z.string().describe(
    'The command to execute inside the sandbox container. Must pass the read-only allowlist (e.g., --help, --version, man, which).',
  ),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(30000)
    .optional()
    .describe('Command timeout in ms (default: 15000, max: 30000)'),
});

// ── Blocked patterns (sandbox-specific) ─────────────────
// These are dangerous even inside a sandbox because they could
// exfiltrate data or modify the sandbox in uncontrolled ways.

const SANDBOX_BLOCKED_PATTERNS: RegExp[] = [
  /\bcurl\b.*\|\s*\bbash\b/i,      // curl | bash (RCE pipe)
  /\bwget\b.*\|\s*\bsh\b/i,        // wget | sh
  /\bapt\s+(install|remove|purge)/i, // Use SandboxManager.install() instead
  /\bapt-get\s+(install|remove|purge)/i,
  /\byum\s+(install|remove|erase)/i,
  /\bdnf\s+(install|remove|erase)/i,
  /\bapk\s+(add|del)/i,
  /\bpacman\s+-[SRU]/i,
  /\bpip\s+install/i,
  /\bnpm\s+install/i,
  /\brm\s+-rf\s+\//,               // rm -rf /
];

function isSandboxBlocked(command: string): string | null {
  for (const pattern of SANDBOX_BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked in sandbox: "${command}" matches restricted pattern. Use SandboxManager.install() for package installation.`;
    }
  }
  return null;
}

// ── Tool Implementation ─────────────────────────────────

export const sandboxExecTool: AgentTool = {
  name: 'sandbox_exec',
  description:
    'Execute a command inside the isolated sandbox container. ' +
    'Use this during CLI discovery (--help, --version, man pages) instead of exec_command for safety. ' +
    'The sandbox has no network access and limited resources. ' +
    'Package installation is NOT allowed here — use the sandbox install mechanism separately.',
  parameters: SandboxExecParams,
  securityTier: 'read',

  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const args = SandboxExecParams.parse(rawArgs);
      const { command, timeout = 15_000 } = args;

      // Verify sandbox is available
      if (!context.sandboxManager) {
        return {
          success: false,
          output: '',
          error: 'Sandbox mode is not enabled. Use exec_command instead, or enable sandbox mode.',
        };
      }

      if (!context.activeSandboxId) {
        return {
          success: false,
          output: '',
          error: 'No active sandbox. Create a sandbox first before running sandbox_exec.',
        };
      }

      // Check read-only allowlist (same guardrails as exec_command)
      if (!isReadCommandAllowed(command)) {
        return {
          success: false,
          output: '',
          error: `Command not in read-only allowlist: ${command}`,
        };
      }

      // Check sandbox-specific blocked patterns
      const blocked = isSandboxBlocked(command);
      if (blocked) {
        return { success: false, output: '', error: blocked };
      }

      // Execute in sandbox
      const output = await context.sandboxManager.exec(
        context.activeSandboxId,
        command,
        timeout,
      );

      // Cache output for grep_output
      context.previousOutputs.set(command, output);

      return {
        success: true,
        output,
        metadata: {
          sandboxId: context.activeSandboxId,
          command,
          environment: 'sandbox',
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `sandbox_exec failed: ${(err as Error).message}`,
      };
    }
  },
};
