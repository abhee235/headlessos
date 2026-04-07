// EX2.2: exec_command tool (READ tier)
// @see docs/phases/phase-ex2.md — EX2.2

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';
import { isReadCommandAllowed } from '../command-allowlist.js';

const ExecCommandParams = z.object({
  command: z.string().describe('The Linux command to execute (must be in read-only allowlist)'),
  timeout: z.number().int().positive().max(30000).optional()
    .describe('Command timeout in ms (default: 15000, max: 30000)'),
});

export const execCommandTool: AgentTool = {
  name: 'exec_command',
  description: 'Execute a read-only Linux command on the server. The command must be in the read-only allowlist (system info, logs, docker ps, systemctl status, etc.). Use this to gather information about the server state.',
  parameters: ExecCommandParams,
  securityTier: 'read',

  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const args = ExecCommandParams.parse(rawArgs);
      const { command, timeout = 15_000 } = args;

      // Validate against read-only allowlist
      if (!isReadCommandAllowed(command)) {
        return {
          success: false,
          output: '',
          error: `Command not in read-only allowlist: ${command}`,
        };
      }

      const result = await context.ssh.exec(context.serverId, command, timeout);

      // Cache the output for grep_output tool
      context.previousOutputs.set(command, result.stdout);

      return {
        success: result.exitCode === 0,
        output: result.stdout || result.stderr,
        metadata: {
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          command,
        },
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `exec_command failed: ${(err as Error).message}`,
      };
    }
  },
};
