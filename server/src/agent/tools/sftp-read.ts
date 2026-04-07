// EX2.2: sftp_read tool (READ tier)
// @see docs/phases/phase-ex2.md — EX2.2

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';

const SftpReadParams = z.object({
  path: z.string().describe('Absolute path to the file to read'),
  maxBytes: z.number().int().positive().max(1_048_576).optional()
    .describe('Maximum bytes to read (default: 65536, max: 1MB)'),
});

export const sftpReadTool: AgentTool = {
  name: 'sftp_read',
  description: 'Read a file from the server via SFTP. Returns the file content as text. Use this to inspect configuration files, logs, or scripts.',
  parameters: SftpReadParams,
  securityTier: 'read',

  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const args = SftpReadParams.parse(rawArgs);
      const { path, maxBytes = 65_536 } = args;

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

      const sftp = await context.ssh.getSftp(context.serverId);

      // Read file via SFTP stream
      const content = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        const stream = sftp.createReadStream(path, {
          start: 0,
          end: maxBytes - 1,
        });

        stream.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes <= maxBytes) {
            chunks.push(chunk);
          }
        });

        stream.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf-8'));
        });

        stream.on('error', (err: Error) => {
          reject(err);
        });
      });

      const truncated = content.length >= maxBytes;

      return {
        success: true,
        output: content,
        metadata: {
          path,
          bytes: content.length,
          truncated,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `sftp_read failed: ${(err as Error).message}`,
      };
    }
  },
};
