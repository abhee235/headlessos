// EX2.2: sftp_write tool (WRITE tier)
// @see docs/phases/phase-ex2.md — EX2.2

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';
import { isWritePathAllowed } from '../command-allowlist.js';

const SftpWriteParams = z.object({
  path: z.string().describe('Absolute path to write the file to (must be in write-allowed paths)'),
  content: z.string().describe('The content to write to the file'),
  mode: z.enum(['overwrite', 'append']).optional()
    .describe('Write mode: overwrite (default) or append'),
});

export const sftpWriteTool: AgentTool = {
  name: 'sftp_write',
  description: 'Write content to a file on the server via SFTP. Path must be in write-allowed directories (user home, /tmp, /var/www, /etc/nginx/sites-*, /opt). Requires write-tier security approval.',
  parameters: SftpWriteParams,
  securityTier: 'write',

  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const args = SftpWriteParams.parse(rawArgs);
      const { path, content, mode = 'overwrite' } = args;

      // Validate path — must be absolute, no traversal
      if (!path.startsWith('/')) {
        return {
          success: false,
          output: '',
          error: 'Path must be absolute (start with /)',
        };
      }
      if (path.includes('..')) {
        return {
          success: false,
          output: '',
          error: 'Path traversal (..) is not allowed',
        };
      }

      // Check write-allowed paths
      if (!isWritePathAllowed(path)) {
        return {
          success: false,
          output: '',
          error: `Path not in write-allowed directories: ${path}`,
        };
      }

      const sftp = await context.ssh.getSftp(context.serverId);

      // Write file via SFTP stream
      await new Promise<void>((resolve, reject) => {
        const flags = mode === 'append' ? 'a' : 'w';
        const stream = sftp.createWriteStream(path, { flags });

        stream.on('close', () => resolve());
        stream.on('error', (err: Error) => reject(err));

        stream.end(content, 'utf-8');
      });

      return {
        success: true,
        output: `File written: ${path} (${content.length} bytes, mode: ${mode})`,
        metadata: {
          path,
          bytes: content.length,
          mode,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `sftp_write failed: ${(err as Error).message}`,
      };
    }
  },
};
