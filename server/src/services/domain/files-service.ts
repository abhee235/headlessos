// M12.8 / M2.3: FilesService — domain layer for SFTP file operations
// @see docs/phases/phase-12.md, docs/phases/phase-2.md
//
// SFTP operations bypass CommandPolicy by design (ADR-007) — file primitives
// are constrained by their own API. validatePath() is called at every entry point.
//
// Owns: SFTP lifecycle, path validation, all file ops, trash, copy/search via exec.
// Routes (routes/files.ts) keep only multipart upload and download stream wiring.

import { posix } from 'path';
import { DomainService, ok, fail, type ServiceResult } from './base.js';
import { validatePath, shellEscape } from '../../security/validators.js';
import type { FileEntry, FileStatInfo } from 'headlessos-shared';
import type { SFTPWrapper } from 'ssh2';

const TRASH_DIR = '/tmp/.headlessos-trash';

export class FilesService extends DomainService {
  protected async _construct(): Promise<void> {}

  // ── SFTP helpers ─────────────────────────────────────

  private async sftp(serverId: string): Promise<SFTPWrapper> {
    const state = this.ssh.getState(serverId);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${serverId}" is not connected`), { statusCode: 400 });
    }
    return this.ssh.getSftp(serverId);
  }

  private validPath(path: string | undefined, field = 'path'): string {
    if (!path || !validatePath(path)) {
      throw Object.assign(
        new Error(`Invalid ${field}: must be an absolute path without traversal`),
        { statusCode: 400 },
      );
    }
    return path;
  }

  // ── List directory ────────────────────────────────────

  async listDirectory(serverId: string, dirPath: string): Promise<ServiceResult<FileEntry[]>> {
    try {
      const safePath = this.validPath(dirPath);
      const sftp = await this.sftp(serverId);

      const entries = await new Promise<FileEntry[]>((resolve, reject) => {
        sftp.readdir(safePath, (err, list) => {
          if (err) {
            const code = err.message.includes('No such file') ? 404 : 500;
            return reject(Object.assign(new Error(`Failed to read directory: ${err.message}`), { statusCode: code }));
          }
          const items: FileEntry[] = list.map((item) => {
            const attrs = item.attrs;
            let type: FileEntry['type'] = 'file';
            if (attrs.isDirectory()) type = 'directory';
            else if (attrs.isSymbolicLink()) type = 'symlink';
            else if (!attrs.isFile()) type = 'other';
            return {
              name: item.filename,
              type,
              permissions: formatPermissions(attrs.mode),
              owner: String(attrs.uid),
              group: String(attrs.gid),
              size: attrs.size,
              modified: new Date(attrs.mtime * 1000).toISOString(),
            };
          });
          items.sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
          });
          resolve(items);
        });
      });

      return ok(entries);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to list directory', e.statusCode ?? 500);
    }
  }

  // ── Read file ─────────────────────────────────────────

  async readFile(
    serverId: string,
    filePath: string,
  ): Promise<ServiceResult<{ content: string; size: number; encoding: string }>> {
    try {
      const safePath = this.validPath(filePath);
      const sftp = await this.sftp(serverId);

      const MAX_SIZE = 2 * 1024 * 1024;
      const { size } = await new Promise<{ size: number }>((resolve, reject) => {
        sftp.stat(safePath, (err, attrs) => {
          if (err) return reject(new Error(`File not found: ${err.message}`));
          resolve({ size: attrs.size });
        });
      });

      if (size > MAX_SIZE) {
        return fail(`File too large (${size} bytes). Max: ${MAX_SIZE} bytes.`, 413);
      }

      const { content, length } = await new Promise<{ content: string; length: number }>((resolve, reject) => {
        const stream = sftp.createReadStream(safePath);
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ content: buf.toString('utf-8'), length: buf.length });
        });
        stream.on('error', (e: Error) => reject(new Error(`Failed to read file: ${e.message}`)));
      });

      return ok({ content, size: length, encoding: 'utf-8' });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to read file', e.statusCode ?? 500);
    }
  }

  // ── Write file ────────────────────────────────────────

  async writeFile(
    serverId: string,
    filePath: string,
    content: string,
  ): Promise<ServiceResult<{ size: number }>> {
    try {
      const safePath = this.validPath(filePath);
      const sftp = await this.sftp(serverId);

      const size = await new Promise<number>((resolve, reject) => {
        const stream = sftp.createWriteStream(safePath);
        stream.on('close', () => resolve(Buffer.byteLength(content, 'utf-8')));
        stream.on('error', (e: Error) => {
          const isPermission = /permission denied|access denied/i.test(e.message);
          reject(Object.assign(new Error(`Failed to write file: ${e.message}`), { statusCode: isPermission ? 403 : 500 }));
        });
        stream.end(Buffer.from(content, 'utf-8'));
      });

      return ok({ size });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to write file', e.statusCode ?? 500);
    }
  }

  // ── Mkdir ─────────────────────────────────────────────

  async mkdir(serverId: string, dirPath: string): Promise<ServiceResult<void>> {
    try {
      const safePath = this.validPath(dirPath);
      const sftp = await this.sftp(serverId);

      await new Promise<void>((resolve, reject) => {
        sftp.mkdir(safePath, (err) => {
          if (err) {
            const isPermission = /permission denied|access denied/i.test(err.message);
            return reject(Object.assign(
              new Error(`Failed to create directory: ${err.message}`),
              { statusCode: isPermission ? 403 : 500 },
            ));
          }
          resolve();
        });
      });

      return ok(undefined);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to create directory', e.statusCode ?? 500);
    }
  }

  // ── Rename ────────────────────────────────────────────

  async rename(
    serverId: string,
    oldPath: string,
    newPath: string,
  ): Promise<ServiceResult<void>> {
    try {
      const safeSrc = this.validPath(oldPath, 'oldPath');
      const safeDst = this.validPath(newPath, 'newPath');
      const sftp = await this.sftp(serverId);

      await new Promise<void>((resolve, reject) => {
        sftp.rename(safeSrc, safeDst, (err) => {
          if (err) return reject(new Error(`Failed to rename: ${err.message}`));
          resolve();
        });
      });

      return ok(undefined);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to rename', e.statusCode ?? 500);
    }
  }

  // ── Delete ────────────────────────────────────────────

  async delete(serverId: string, targetPath: string): Promise<ServiceResult<void>> {
    try {
      const safePath = this.validPath(targetPath);
      const sftp = await this.sftp(serverId);

      const isDir = await new Promise<boolean>((resolve, reject) => {
        sftp.stat(safePath, (err, attrs) => {
          if (err) return reject(new Error(`Not found: ${err.message}`));
          resolve(attrs.isDirectory());
        });
      });

      await new Promise<void>((resolve, reject) => {
        if (isDir) {
          sftp.rmdir(safePath, (err) => {
            if (err) return reject(new Error(`Failed to delete directory (must be empty): ${err.message}`));
            resolve();
          });
        } else {
          sftp.unlink(safePath, (err) => {
            if (err) return reject(new Error(`Failed to delete file: ${err.message}`));
            resolve();
          });
        }
      });

      return ok(undefined);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to delete', e.statusCode ?? 500);
    }
  }

  // ── Stat ──────────────────────────────────────────────

  async stat(serverId: string, filePath: string): Promise<ServiceResult<FileStatInfo>> {
    try {
      const safePath = this.validPath(filePath);
      const sftp = await this.sftp(serverId);
      const filename = posix.basename(safePath);

      const info = await new Promise<FileStatInfo>((resolve, reject) => {
        sftp.stat(safePath, (err, attrs) => {
          if (err) {
            const code = err.message.includes('No such file') ? 404 : 500;
            return reject(Object.assign(new Error(`Failed to stat file: ${err.message}`), { statusCode: code }));
          }

          let type: FileStatInfo['type'] = 'file';
          if (attrs.isDirectory()) type = 'directory';
          else if (attrs.isSymbolicLink()) type = 'symlink';
          else if (!attrs.isFile()) type = 'other';

          const stat: FileStatInfo = {
            name: filename,
            path: safePath,
            type,
            permissions: formatPermissions(attrs.mode),
            mode: attrs.mode & 0o7777,
            owner: String(attrs.uid),
            group: String(attrs.gid),
            size: attrs.size,
            modified: new Date(attrs.mtime * 1000).toISOString(),
            accessed: new Date(attrs.atime * 1000).toISOString(),
          };

          if (type === 'symlink') {
            sftp.readlink(safePath, (linkErr, target) => {
              if (!linkErr) stat.symlinkTarget = target;
              resolve(stat);
            });
          } else {
            resolve(stat);
          }
        });
      });

      return ok(info);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to stat', e.statusCode ?? 500);
    }
  }

  /** Returns the SFTP read stream for a download — route handles HTTP headers. */
  async getReadStream(
    serverId: string,
    filePath: string,
  ): Promise<ServiceResult<{ stream: ReturnType<SFTPWrapper['createReadStream']>; filename: string }>> {
    try {
      const safePath = this.validPath(filePath);
      const sftp = await this.sftp(serverId);
      const filename = posix.basename(safePath);
      const stream = sftp.createReadStream(safePath);
      return ok({ stream, filename });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to open file', e.statusCode ?? 500);
    }
  }

  /** Returns an SFTP write stream for uploading — route handles multipart. */
  async getWriteStream(
    serverId: string,
    remotePath: string,
  ): Promise<ServiceResult<ReturnType<SFTPWrapper['createWriteStream']>>> {
    try {
      const safePath = this.validPath(remotePath);
      if (!validatePath(safePath)) {
        return fail('Invalid remote path', 400);
      }
      const sftp = await this.sftp(serverId);
      return ok(sftp.createWriteStream(safePath));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to open write stream', e.statusCode ?? 500);
    }
  }

  // ── Copy (exec cp -r) ─────────────────────────────────

  async copy(serverId: string, sourcePath: string, destPath: string): Promise<ServiceResult<void>> {
    try {
      this.validPath(sourcePath, 'sourcePath');
      this.validPath(destPath, 'destPath');
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Invalid path', e.statusCode ?? 400);
    }

    const result = await this.exec(
      serverId,
      `cp -r ${shellEscape(sourcePath)} ${shellEscape(destPath)}`,
      60_000,
    );

    if (result.exitCode !== 0) {
      return fail(`Copy failed: ${result.stderr.trim() || 'exit code ' + result.exitCode}`, 500);
    }
    return ok(undefined);
  }

  // ── Move (SFTP rename) ────────────────────────────────

  async move(serverId: string, sourcePath: string, destPath: string): Promise<ServiceResult<void>> {
    return this.rename(serverId, sourcePath, destPath);
  }

  // ── Search (exec find) ───────────────────────────────

  async search(
    serverId: string,
    basePath: string,
    query: string,
    maxDepthParam: string | number,
  ): Promise<ServiceResult<{ results: Array<{ name: string; path: string; type: 'file' | 'directory' | 'other' }>; basePath: string; query: string; truncated: boolean }>> {
    try {
      this.requireConnected(serverId);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }

    let safePath: string;
    try {
      safePath = this.validPath(basePath);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Invalid path', e.statusCode ?? 400);
    }

    if (!query || query.trim().length === 0) {
      return fail('query parameter is required', 400);
    }
    if (!/^[\w.*?\[\]\-_ ]+$/.test(query)) {
      return fail('Invalid search query — only letters, numbers, wildcards (*, ?) and basic characters allowed', 400);
    }

    const maxDepth = Math.min(Math.max(parseInt(String(maxDepthParam), 10) || 5, 1), 10);
    const searchPattern = query.includes('*') || query.includes('?') ? query : `*${query}*`;
    const command = `find ${shellEscape(safePath)} -maxdepth ${maxDepth} -iname ${shellEscape(searchPattern)} -not -path '*/\\.*' 2>/dev/null | head -200`;

    const result = await this.exec(serverId, command, 15_000);

    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const results = lines
      .map((line) => line.trim())
      .filter((p) => p.startsWith('/'))
      .map((fullPath) => ({
        name: posix.basename(fullPath),
        path: fullPath.replace(/\/$/, ''),
        type: (fullPath.endsWith('/') ? 'directory' : 'file') as 'file' | 'directory' | 'other',
      }));

    return ok({ results, basePath: safePath, query, truncated: lines.length >= 200 });
  }

  // ── Trash: move to trash ──────────────────────────────

  async moveToTrash(
    serverId: string,
    targetPath: string,
  ): Promise<ServiceResult<{ trashPath: string; originalPath: string }>> {
    try {
      const safePath = this.validPath(targetPath);
      const sftp = await this.sftp(serverId);

      const timestamp = Date.now();
      const baseName = posix.basename(safePath);
      const trashPath = posix.join(TRASH_DIR, `${timestamp}_${baseName}`);

      // Best-effort mkdir
      await new Promise<void>((resolve) => { sftp.mkdir(TRASH_DIR, () => resolve()); });

      await new Promise<void>((resolve, reject) => {
        sftp.rename(safePath, trashPath, (err) => {
          if (err) return reject(new Error(`Failed to move to trash: ${err.message}`));
          resolve();
        });
      });

      return ok({ trashPath, originalPath: safePath });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to move to trash', e.statusCode ?? 500);
    }
  }

  // ── Trash: list ───────────────────────────────────────

  async listTrash(
    serverId: string,
  ): Promise<ServiceResult<Array<{ name: string; originalName: string; trashedAt: string; path: string; size: number; isDirectory: boolean }>>> {
    try {
      const sftp = await this.sftp(serverId);

      const items = await new Promise<Array<{ name: string; originalName: string; trashedAt: string; path: string; size: number; isDirectory: boolean }>>(
        (resolve, reject) => {
          sftp.readdir(TRASH_DIR, (err, list) => {
            if (err) {
              if (err.message.includes('No such file')) return resolve([]);
              return reject(new Error(`Failed to read trash: ${err.message}`));
            }

            const parsed = list.map((item) => {
              const name = item.filename;
              const underscoreIdx = name.indexOf('_');
              const timestamp = underscoreIdx > 0 ? parseInt(name.substring(0, underscoreIdx), 10) : 0;
              const originalName = underscoreIdx > 0 ? name.substring(underscoreIdx + 1) : name;
              return {
                name,
                originalName,
                trashedAt: timestamp > 0
                  ? new Date(timestamp).toISOString()
                  : new Date(item.attrs.mtime * 1000).toISOString(),
                path: posix.join(TRASH_DIR, name),
                size: item.attrs.size,
                isDirectory: item.attrs.isDirectory(),
              };
            });

            parsed.sort((a, b) => new Date(b.trashedAt).getTime() - new Date(a.trashedAt).getTime());
            resolve(parsed);
          });
        },
      );

      return ok(items);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to list trash', e.statusCode ?? 500);
    }
  }

  // ── Trash: restore ────────────────────────────────────

  async restoreFromTrash(
    serverId: string,
    trashName: string,
    restorePath: string,
  ): Promise<ServiceResult<void>> {
    if (!trashName || typeof trashName !== 'string') {
      return fail('trashName is required', 400);
    }
    if (trashName.includes('/') || trashName.includes('..')) {
      return fail('Invalid trash name', 400);
    }

    const destination = this.validPath(restorePath);
    const trashPath = posix.join(TRASH_DIR, trashName);

    try {
      const sftp = await this.sftp(serverId);
      await new Promise<void>((resolve, reject) => {
        sftp.rename(trashPath, destination, (err) => {
          if (err) return reject(new Error(`Failed to restore: ${err.message}`));
          resolve();
        });
      });
      return ok(undefined);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to restore from trash', e.statusCode ?? 500);
    }
  }

  // ── Trash: empty (exec rm -rf) ───────────────────────

  async emptyTrash(serverId: string, specificName?: string): Promise<ServiceResult<void>> {
    try {
      this.requireConnected(serverId);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }

    if (specificName) {
      if (specificName.includes('/') || specificName.includes('..')) {
        return fail('Invalid trash name', 400);
      }
      const itemPath = posix.join(TRASH_DIR, specificName);
      const result = await this.exec(serverId, `rm -rf ${shellEscape(itemPath)}`, 30_000);
      if (result.exitCode !== 0) {
        return fail(`Failed to delete from trash: ${result.stderr}`, 500);
      }
    } else {
      const command = `rm -rf ${shellEscape(TRASH_DIR)} && mkdir -p ${shellEscape(TRASH_DIR)}`;
      const result = await this.exec(serverId, command, 30_000);
      if (result.exitCode !== 0) {
        return fail(`Failed to empty trash: ${result.stderr}`, 500);
      }
    }

    return ok(undefined);
  }
}

// ── Shared helper ────────────────────────────────────────

export function formatPermissions(mode: number): string {
  const rwx = (bits: number) =>
    (bits & 4 ? 'r' : '-') + (bits & 2 ? 'w' : '-') + (bits & 1 ? 'x' : '-');
  const octal = (mode & 0o7777).toString(8).padStart(4, '0');
  const owner = (mode >> 6) & 7;
  const group = (mode >> 3) & 7;
  const other = mode & 7;
  const typeChar =
    mode & 0o40000 ? 'd' : (mode & 0o120000) === 0o120000 ? 'l' : '-';
  return `${typeChar}${rwx(owner)}${rwx(group)}${rwx(other)} (${octal})`;
}
