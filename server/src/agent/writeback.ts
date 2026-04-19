// EX2.9: Write-Back Service
// @see docs/phases/phase-ex2.md — EX2.9
//
// Handles writing form data back to the server via SFTP and SSH.
// Safety features: path validation, automatic backup, validation command,
// rollback on validation failure, reload command.

import { z } from 'zod';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import { shellEscape, SecurityError } from '../security/validators.js';
import { isWritePathAllowed, isWriteCommandAllowed } from './command-allowlist.js';

// ── Schemas ──

export const WriteBackConfigSchema = z.object({
  type: z.enum(['config-file', 'command', 'sftp-write']),
  /** File path for config-file / sftp-write types */
  path: z.string().nullable().optional(),
  /** Format for config file generation */
  format: z.enum(['key-value', 'json', 'yaml', 'ini', 'nginx', 'custom', 'raw']).nullable().optional(),
  /** Command to validate before saving, e.g., "nginx -t" */
  validateCommand: z.string().nullable().optional(),
  /** Command to run after saving, e.g., "systemctl reload nginx" */
  reloadCommand: z.string().nullable().optional(),
  /** Template string for custom format */
  customWriteTemplate: z.string().nullable().optional(),
  /** Key-value separator for key-value format (default: " = ") */
  kvSeparator: z.string().nullable().optional(),
  /** Comment prefix for key-value format (default: "# ") */
  commentPrefix: z.string().nullable().optional(),
});

export type WriteBackConfig = z.infer<typeof WriteBackConfigSchema>;

export const WriteBackRequestSchema = z.object({
  writeBack: WriteBackConfigSchema,
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  originalValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable().optional(),
});

export type WriteBackRequest = z.infer<typeof WriteBackRequestSchema>;

export interface WriteBackResult {
  success: boolean;
  validationOutput?: string;
  reloadOutput?: string;
  backupPath?: string;
  error?: string;
}

// ── Content Generators ──

/**
 * Generate file content from form values based on the specified format.
 */
export function generateFileContent(
  format: NonNullable<WriteBackConfig['format']>,
  values: Record<string, string | number | boolean>,
  options?: { kvSeparator?: string; commentPrefix?: string; customTemplate?: string },
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(values, null, 2) + '\n';

    case 'key-value': {
      const sep = options?.kvSeparator ?? ' = ';
      return Object.entries(values)
        .map(([k, v]) => `${k}${sep}${String(v)}`)
        .join('\n') + '\n';
    }

    case 'ini': {
      // Simple INI: key=value pairs
      return Object.entries(values)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join('\n') + '\n';
    }

    case 'yaml': {
      // Simple flat YAML
      return Object.entries(values)
        .map(([k, v]) => {
          if (typeof v === 'string') return `${k}: "${v.replace(/"/g, '\\"')}"`;
          return `${k}: ${String(v)}`;
        })
        .join('\n') + '\n';
    }

    case 'custom': {
      if (!options?.customTemplate) {
        throw new Error('customWriteTemplate is required for custom format');
      }
      // Replace {{key}} placeholders with values
      let content = options.customTemplate;
      for (const [k, v] of Object.entries(values)) {
        content = content.replaceAll(`{{${k}}}`, String(v));
      }
      return content;
    }

    case 'raw': {
      // Concatenate all values (for single-field forms)
      return Object.values(values).map(String).join('\n') + '\n';
    }

    case 'nginx':
      // Nginx-style: key value; pairs
      return Object.entries(values)
        .map(([k, v]) => `    ${k} ${String(v)};`)
        .join('\n') + '\n';

    default:
      throw new Error(`Unsupported format: ${format as string}`);
  }
}

// ── Write-Back Handler ──

/**
 * Execute a write-back operation: backup → write → validate → rollback/reload.
 *
 * Safety:
 * 1. Path validated against WRITE_ALLOWED_PATHS
 * 2. Original file backed up before write (.bak)
 * 3. Validation command runs BEFORE the service reloads
 * 4. If validation fails → automatic rollback to backup
 * 5. All commands go through guardrails
 */
export async function executeWriteBack(
  serverId: string,
  request: WriteBackRequest,
  ssh: ConnectionManager,
): Promise<WriteBackResult> {
  const { writeBack, values } = request;

  // ── Validate path ──
  if (writeBack.type !== 'command' && writeBack.path) {
    if (!isWritePathAllowed(writeBack.path)) {
      throw new SecurityError(`Write to "${writeBack.path}" is not allowed by path allowlist`);
    }
  }

  // ── Validate commands ──
  if (writeBack.validateCommand) {
    if (!isWriteCommandAllowed(writeBack.validateCommand)) {
      throw new SecurityError(`Validation command not allowed: ${writeBack.validateCommand}`);
    }
  }
  if (writeBack.reloadCommand) {
    if (!isWriteCommandAllowed(writeBack.reloadCommand)) {
      throw new SecurityError(`Reload command not allowed: ${writeBack.reloadCommand}`);
    }
  }

  // ── Command type: just exec the command ──
  if (writeBack.type === 'command') {
    if (!writeBack.reloadCommand) {
      throw new Error('writeBack.type "command" requires a reloadCommand');
    }
    const result = await ssh.exec(serverId, writeBack.reloadCommand, 15000);
    return {
      success: result.exitCode === 0,
      reloadOutput: result.stdout || result.stderr,
      error: result.exitCode !== 0 ? `Command failed (exit ${result.exitCode}): ${result.stderr}` : undefined,
    };
  }

  // ── File write types: config-file, sftp-write ──
  const path = writeBack.path;
  if (!path) {
    throw new Error('writeBack.path is required for config-file and sftp-write types');
  }

  const format = writeBack.format ?? 'key-value';
  const content = generateFileContent(format, values, {
    kvSeparator: writeBack.kvSeparator ?? undefined,
    commentPrefix: writeBack.commentPrefix ?? undefined,
    customTemplate: writeBack.customWriteTemplate ?? undefined,
  });

  const backupPath = `${path}.bak`;
  const sftp = await ssh.getSftp(serverId);

  // 1. Backup original file (ignore error if file doesn't exist yet)
  try {
    await sftpCopy(sftp, path, backupPath);
  } catch {
    // File may not exist yet — that's OK for new files
  }

  // 2. Write new content via SFTP
  await sftpWriteFile(sftp, path, content);

  // 3. Run validation command (if configured)
  if (writeBack.validateCommand) {
    const validation = await ssh.exec(serverId, writeBack.validateCommand, 15000);
    if (validation.exitCode !== 0) {
      // Validation failed → restore backup
      try {
        await sftpCopy(sftp, backupPath, path);
      } catch {
        // Best effort rollback
      }
      return {
        success: false,
        validationOutput: validation.stdout || validation.stderr,
        backupPath,
        error: `Validation failed: ${validation.stderr || validation.stdout}`,
      };
    }
  }

  // 4. Run reload command (if configured)
  let reloadOutput: string | undefined;
  if (writeBack.reloadCommand) {
    const reload = await ssh.exec(serverId, writeBack.reloadCommand, 15000);
    reloadOutput = reload.stdout || reload.stderr;
    if (reload.exitCode !== 0) {
      // Reload failed — try to restore backup
      try {
        await sftpCopy(sftp, backupPath, path);
      } catch {
        // Best effort rollback
      }
      return {
        success: false,
        reloadOutput,
        backupPath,
        error: `Reload failed (exit ${reload.exitCode}): ${reload.stderr || reload.stdout}`,
      };
    }
  }

  return {
    success: true,
    validationOutput: undefined,
    reloadOutput,
    backupPath,
  };
}

// ── SFTP Helpers ──

/**
 * Copy a file on the remote server via SFTP (read + write).
 */
async function sftpCopy(
  sftp: Awaited<ReturnType<ConnectionManager['getSftp']>>,
  src: string,
  dest: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = sftp.createReadStream(src);
    const writeStream = sftp.createWriteStream(dest);

    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('close', () => resolve());

    readStream.pipe(writeStream);
  });
}

/**
 * Write string content to a file via SFTP.
 */
async function sftpWriteFile(
  sftp: Awaited<ReturnType<ConnectionManager['getSftp']>>,
  path: string,
  content: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const writeStream = sftp.createWriteStream(path);
    writeStream.on('error', reject);
    writeStream.on('close', () => resolve());
    writeStream.end(content);
  });
}
