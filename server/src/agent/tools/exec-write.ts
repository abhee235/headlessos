// EX2.2: exec_write_command tool (WRITE tier)
// @see docs/phases/phase-ex2.md — EX2.2

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';
import { isWriteCommandAllowed } from '../command-allowlist.js';

const ExecWriteCommandParams = z.object({
  command: z.string().describe('The Linux command to execute (must be in write allowlist, e.g. docker start/stop, systemctl restart)'),
  timeout: z.number().int().min(1).max(60000).optional()
    .describe('Command timeout in ms (default: 30000, max: 60000)'),
});

export const execWriteCommandTool: AgentTool = {
  name: 'exec_write_command',
  description: 'Execute a write command on the server. Only allowed commands: docker start/stop/restart, systemctl start/stop/restart, nginx reload, package install/update. Requires write-tier security approval.',
  parameters: ExecWriteCommandParams,
  securityTier: 'write',

  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const args = ExecWriteCommandParams.parse(rawArgs);
      const { command, timeout = 30_000 } = args;

      // Validate against write allowlist
      if (!isWriteCommandAllowed(command)) {
        return {
          success: false,
          output: '',
          error: `Command not in write allowlist: ${command}`,
        };
      }

      const result = await context.ssh.exec(context.serverId, command, timeout);

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
        error: `exec_write_command failed: ${(err as Error).message}`,
      };
    }
  },
};
