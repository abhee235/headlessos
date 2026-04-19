// M2.3 + M2.5: File Explorer Routes (SFTP-based)
// @see docs/phases/phase-2.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import { posix } from 'path';
import { validatePath, validateAndSanitizePath } from '../security/validators.js';
import type { FileEntry, FileStatInfo } from 'headlessos-shared';

interface FileRouteOpts {
  connectionManager: ConnectionManager;
}

export async function fileRoutes(
  fastify: FastifyInstance,
  opts: FileRouteOpts,
): Promise<void> {
  const { connectionManager } = opts;

  // ── Helper: ensure connected + get SFTP ───────────────

  async function requireSftp(serverId: string) {
    const state = connectionManager.getState(serverId);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${serverId}" is not connected`), {
        statusCode: 400,
      });
    }
    return connectionManager.getSftp(serverId);
  }

  function requireValidPath(path: string | undefined, field = 'path'): string {
    if (!path || !validatePath(path)) {
      throw Object.assign(
        new Error(`Invalid ${field}: must be an absolute path without traversal`),
        { statusCode: 400 },
      );
    }
    return path;
  }

  // ── GET /api/servers/:id/files?path=/ — list directory ──

  fastify.get<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/api/servers/:id/files', async (req, reply) => {
    const { id } = req.params;
    const dirPath = requireValidPath(req.query.path ?? '/');
    const sftp = await requireSftp(id);

    return new Promise<FileEntry[]>((resolve, reject) => {
      sftp.readdir(dirPath, (err, list) => {
        if (err) {
          reply.code(err.message.includes('No such file') ? 404 : 500);
          return reject(new Error(`Failed to read directory: ${err.message}`));
        }

        const entries: FileEntry[] = list.map(item => {
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

        // Sort: directories first, then alphabetical
        entries.sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });

        resolve(entries);
      });
    });
  });

  // ── GET /api/servers/:id/files/read?path=... — read file ──

  fastify.get<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/api/servers/:id/files/read', async (req, reply) => {
    const { id } = req.params;
    const filePath = requireValidPath(req.query.path);
    const sftp = await requireSftp(id);

    // Check file size first (don't load huge files)
    const stats = await new Promise<{ size: number }>((resolve, reject) => {
      sftp.stat(filePath, (err, attrs) => {
        if (err) return reject(new Error(`File not found: ${err.message}`));
        resolve({ size: attrs.size });
      });
    });

    const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
    if (stats.size > MAX_SIZE) {
      reply.code(413);
      return { error: `File too large (${stats.size} bytes). Max: ${MAX_SIZE} bytes.` };
    }

    // Read via stream
    return new Promise<{ content: string; size: number; encoding: string }>((resolve, reject) => {
      const stream = sftp.createReadStream(filePath);
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          content: buffer.toString('utf-8'),
          size: buffer.length,
          encoding: 'utf-8',
        });
      });
      stream.on('error', (err: Error) => {
        reject(new Error(`Failed to read file: ${err.message}`));
      });
    });
  });

  // ── POST /api/servers/:id/files/write — write file content ──

  fastify.post<{
    Params: { id: string };
    Body: { path: string; content: string };
  }>('/api/servers/:id/files/write', async (req) => {
    const { id } = req.params;
    const filePath = requireValidPath(req.body.path);
    const sftp = await requireSftp(id);

    return new Promise<{ success: boolean; size: number }>((resolve, reject) => {
      const stream = sftp.createWriteStream(filePath);
      stream.on('close', () => resolve({ success: true, size: Buffer.byteLength(req.body.content, 'utf-8') }));
      stream.on('error', (err: Error) => {
        const isPermission = /permission denied|access denied/i.test(err.message);
        reject(Object.assign(
          new Error(`Failed to write file: ${err.message}`),
          { statusCode: isPermission ? 403 : 500 },
        ));
      });
      stream.end(Buffer.from(req.body.content, 'utf-8'));
    });
  });

  // ── POST /api/servers/:id/files/mkdir — create directory ──

  fastify.post<{
    Params: { id: string };
    Body: { path: string };
  }>('/api/servers/:id/files/mkdir', async (req) => {
    const { id } = req.params;
    const dirPath = requireValidPath(req.body.path);
    const sftp = await requireSftp(id);

    return new Promise<{ success: boolean }>((resolve, reject) => {
      sftp.mkdir(dirPath, (err) => {
        if (err) {
          const isPermission = /permission denied|access denied/i.test(err.message);
          const error = Object.assign(
            new Error(`Failed to create directory: ${err.message}`),
            { statusCode: isPermission ? 403 : 500 },
          );
          return reject(error);
        }
        resolve({ success: true });
      });
    });
  });

  // ── POST /api/servers/:id/files/rename — rename file/dir ──

  fastify.post<{
    Params: { id: string };
    Body: { oldPath: string; newPath: string };
  }>('/api/servers/:id/files/rename', async (req) => {
    const { id } = req.params;
    const oldPath = requireValidPath(req.body.oldPath, 'oldPath');
    const newPath = requireValidPath(req.body.newPath, 'newPath');
    const sftp = await requireSftp(id);

    return new Promise<{ success: boolean }>((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err) => {
        if (err) return reject(new Error(`Failed to rename: ${err.message}`));
        resolve({ success: true });
      });
    });
  });

  // ── DELETE /api/servers/:id/files?path=... — delete file/dir ──

  fastify.delete<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/api/servers/:id/files', async (req, reply) => {
    const { id } = req.params;
    const targetPath = requireValidPath(req.query.path);
    const sftp = await requireSftp(id);

    // Check if it's a directory or file
    const isDir = await new Promise<boolean>((resolve, reject) => {
      sftp.stat(targetPath, (err, attrs) => {
        if (err) return reject(new Error(`Not found: ${err.message}`));
        resolve(attrs.isDirectory());
      });
    });

    if (isDir) {
      // rmdir only works on empty dirs — for non-empty, we need recursive delete
      return new Promise<{ success: boolean }>((resolve, reject) => {
        sftp.rmdir(targetPath, (err) => {
          if (err) return reject(new Error(`Failed to delete directory (must be empty): ${err.message}`));
          resolve({ success: true });
        });
      });
    } else {
      return new Promise<{ success: boolean }>((resolve, reject) => {
        sftp.unlink(targetPath, (err) => {
          if (err) return reject(new Error(`Failed to delete file: ${err.message}`));
          resolve({ success: true });
        });
      });
    }
  });

  // ── GET /api/servers/:id/files/stat?path=... — file properties ──

  fastify.get<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/api/servers/:id/files/stat', async (req, reply) => {
    const { id } = req.params;
    const filePath = requireValidPath(req.query.path);
    const sftp = await requireSftp(id);
    const filename = posix.basename(filePath);

    return new Promise<FileStatInfo>((resolve, reject) => {
      sftp.stat(filePath, (err, attrs) => {
        if (err) {
          reply.code(err.message.includes('No such file') ? 404 : 500);
          return reject(new Error(`Failed to stat file: ${err.message}`));
        }

        let type: FileStatInfo['type'] = 'file';
        if (attrs.isDirectory()) type = 'directory';
        else if (attrs.isSymbolicLink()) type = 'symlink';
        else if (!attrs.isFile()) type = 'other';

        const stat: FileStatInfo = {
          name: filename,
          path: filePath,
          type,
          permissions: formatPermissions(attrs.mode),
          mode: attrs.mode & 0o7777,
          owner: String(attrs.uid),
          group: String(attrs.gid),
          size: attrs.size,
          modified: new Date(attrs.mtime * 1000).toISOString(),
          accessed: new Date(attrs.atime * 1000).toISOString(),
        };

        // If symlink, also read target
        if (type === 'symlink') {
          sftp.readlink(filePath, (linkErr, target) => {
            if (!linkErr) stat.symlinkTarget = target;
            resolve(stat);
          });
        } else {
          resolve(stat);
        }
      });
    });
  });

  // ── GET /api/servers/:id/files/download?path=... — download ──

  fastify.get<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/api/servers/:id/files/download', async (req, reply) => {
    const { id } = req.params;
    const filePath = requireValidPath(req.query.path);
    const sftp = await requireSftp(id);
    const filename = posix.basename(filePath);

    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Type', 'application/octet-stream');

    const stream = sftp.createReadStream(filePath);
    return reply.send(stream);
  });

  // ── POST /api/servers/:id/files/upload — upload file via multipart ──

  fastify.post<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/api/servers/:id/files/upload', async (req, reply) => {
    const { id } = req.params;
    const destDir = requireValidPath(req.query.path ?? '/');
    const sftp = await requireSftp(id);

    const parts = req.parts();
    const results: Array<{ name: string; size: number; success: boolean }> = [];

    for await (const part of parts) {
      if (part.type !== 'file') continue;

      const filename = part.filename;
      if (!filename) continue;

      // Sanitize filename — strip path separators and dangerous chars
      const safeName = filename.replace(/[/\\]/g, '_').replace(/\.\./g, '_');
      const remotePath = posix.join(destDir, safeName);

      // Validate resulting path
      if (!validatePath(remotePath)) {
        results.push({ name: safeName, size: 0, success: false });
        continue;
      }

      // Stream to SFTP
      const size = await new Promise<number>((resolve, reject) => {
        const writeStream = sftp.createWriteStream(remotePath);
        let totalBytes = 0;

        part.file.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
        });

        part.file.pipe(writeStream);

        writeStream.on('close', () => resolve(totalBytes));
        writeStream.on('error', (err: Error) => reject(new Error(`Upload failed for ${safeName}: ${err.message}`)));
        part.file.on('error', (err: Error) => reject(new Error(`Upload stream error for ${safeName}: ${err.message}`)));
      });

      results.push({ name: safeName, size, success: true });
    }

    return { success: true, files: results };
  });

  // ── POST /api/servers/:id/files/copy — copy file/dir (exec cp) ──

  fastify.post<{
    Params: { id: string };
    Body: { sourcePath: string; destPath: string };
  }>('/api/servers/:id/files/copy', async (req) => {
    const { id } = req.params;
    const source = requireValidPath(req.body.sourcePath, 'sourcePath');
    const dest = requireValidPath(req.body.destPath, 'destPath');

    const command = `cp -r ${shellEscapeForCopy(source)} ${shellEscapeForCopy(dest)}`;
    const result = await connectionManager.exec(id, command, 60_000);
    if (result.exitCode !== 0) {
      throw Object.assign(
        new Error(`Copy failed: ${result.stderr.trim() || 'exit code ' + result.exitCode}`),
        { statusCode: 500 },
      );
    }
    return { success: true };
  });

  // ── POST /api/servers/:id/files/move — move/rename file/dir ──

  fastify.post<{
    Params: { id: string };
    Body: { sourcePath: string; destPath: string };
  }>('/api/servers/:id/files/move', async (req) => {
    const { id } = req.params;
    const source = requireValidPath(req.body.sourcePath, 'sourcePath');
    const dest = requireValidPath(req.body.destPath, 'destPath');
    const sftp = await requireSftp(id);

    // sftp.rename works for move (same as mv)
    return new Promise<{ success: boolean }>((resolve, reject) => {
      sftp.rename(source, dest, (err) => {
        if (err) return reject(new Error(`Move failed: ${err.message}`));
        resolve({ success: true });
      });
    });
  });

  // ── GET /api/servers/:id/files/search?path=/&query=... — search files ──

  fastify.get<{
    Params: { id: string };
    Querystring: { path?: string; query?: string; maxDepth?: string };
  }>('/api/servers/:id/files/search', async (req, reply) => {
    const { id } = req.params;
    const basePath = requireValidPath(req.query.path ?? '/');
    const query = req.query.query?.trim();

    if (!query || query.length === 0) {
      reply.code(400);
      return { error: 'query parameter is required' };
    }

    // Sanitize search query: only allow safe characters for -iname glob
    if (!/^[\w.*?\[\]\-_ ]+$/.test(query)) {
      reply.code(400);
      return { error: 'Invalid search query — only letters, numbers, wildcards (*, ?) and basic characters allowed' };
    }

    const maxDepth = Math.min(Math.max(parseInt(req.query.maxDepth ?? '5', 10) || 5, 1), 10);

    // Use `find` with -maxdepth to prevent runaway searches
    // -iname for case-insensitive matching, -not -path to skip hidden dirs
    const searchPattern = query.includes('*') || query.includes('?') ? query : `*${query}*`;
    const escapedPath = shellEscapeForCopy(basePath);
    const escapedPattern = shellEscapeForCopy(searchPattern);
    const command = `find ${escapedPath} -maxdepth ${maxDepth} -iname ${escapedPattern} -not -path '*/\.*' 2>/dev/null | head -200`;

    const state = connectionManager.getState(id);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${id}" is not connected`), { statusCode: 400 });
    }

    const result = await connectionManager.exec(id, command, 15_000);

    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const results: Array<{ name: string; path: string; type: 'file' | 'directory' | 'other' }> = [];

    for (const line of lines) {
      const fullPath = line.trim();
      if (!fullPath.startsWith('/')) continue;
      const name = posix.basename(fullPath);
      // Simple heuristic: if it has an extension, it's likely a file; otherwise check with stat
      // For speed, we use a filename-based heuristic (no trailing slash = file)
      const isDir = fullPath.endsWith('/');
      results.push({
        name,
        path: fullPath.replace(/\/$/, ''),
        type: isDir ? 'directory' : 'file',
      });
    }

    return { results, basePath, query, truncated: lines.length >= 200 };
  });

  // ── POST /api/servers/:id/files/trash — move to trash instead of delete ──

  fastify.post<{
    Params: { id: string };
    Body: { path: string };
  }>('/api/servers/:id/files/trash', async (req) => {
    const { id } = req.params;
    const targetPath = requireValidPath(req.body.path);
    const sftp = await requireSftp(id);

    // Trash directory: ~/.headlessos-trash/
    const trashDir = '/tmp/.headlessos-trash';
    const timestamp = Date.now();
    const baseName = posix.basename(targetPath);
    const trashName = `${timestamp}_${baseName}`;
    const trashPath = posix.join(trashDir, trashName);

    // Ensure trash directory exists
    await new Promise<void>((resolve) => {
      sftp.mkdir(trashDir, (err) => {
        // Ignore "already exists" errors
        resolve();
      });
    });

    // Move file/dir to trash
    return new Promise<{ success: boolean; trashPath: string; originalPath: string }>((resolve, reject) => {
      sftp.rename(targetPath, trashPath, (err) => {
        if (err) return reject(new Error(`Failed to move to trash: ${err.message}`));
        resolve({ success: true, trashPath, originalPath: targetPath });
      });
    });
  });

  // ── GET /api/servers/:id/files/trash — list trash contents ──

  fastify.get<{
    Params: { id: string };
  }>('/api/servers/:id/files/trash', async (req, reply) => {
    const { id } = req.params;
    const sftp = await requireSftp(id);
    const trashDir = '/tmp/.headlessos-trash';

    return new Promise<Array<{ name: string; originalName: string; trashedAt: string; path: string }>>(
      (resolve, reject) => {
        sftp.readdir(trashDir, (err, list) => {
          if (err) {
            // If trash dir doesn't exist, return empty
            if (err.message.includes('No such file')) return resolve([]);
            return reject(new Error(`Failed to read trash: ${err.message}`));
          }

          const items = list.map(item => {
            const name = item.filename;
            // Parse timestamp_originalname format
            const underscoreIdx = name.indexOf('_');
            const timestamp = underscoreIdx > 0 ? parseInt(name.substring(0, underscoreIdx), 10) : 0;
            const originalName = underscoreIdx > 0 ? name.substring(underscoreIdx + 1) : name;

            return {
              name,
              originalName,
              trashedAt: timestamp > 0 ? new Date(timestamp).toISOString() : new Date(item.attrs.mtime * 1000).toISOString(),
              path: posix.join(trashDir, name),
              size: item.attrs.size,
              isDirectory: item.attrs.isDirectory(),
            };
          });

          // Sort by most recently trashed first
          items.sort((a, b) => new Date(b.trashedAt).getTime() - new Date(a.trashedAt).getTime());
          resolve(items);
        });
      },
    );
  });

  // ── POST /api/servers/:id/files/trash/restore — restore from trash ──

  fastify.post<{
    Params: { id: string };
    Body: { trashName: string; restorePath: string };
  }>('/api/servers/:id/files/trash/restore', async (req) => {
    const { id } = req.params;
    const { trashName, restorePath } = req.body;

    if (!trashName || typeof trashName !== 'string') {
      throw Object.assign(new Error('trashName is required'), { statusCode: 400 });
    }
    // Validate trash name — must not contain path separators
    if (trashName.includes('/') || trashName.includes('..')) {
      throw Object.assign(new Error('Invalid trash name'), { statusCode: 400 });
    }

    const destination = requireValidPath(restorePath);
    const sftp = await requireSftp(id);
    const trashDir = '/tmp/.headlessos-trash';
    const trashPath = posix.join(trashDir, trashName);

    return new Promise<{ success: boolean }>((resolve, reject) => {
      sftp.rename(trashPath, destination, (err) => {
        if (err) return reject(new Error(`Failed to restore: ${err.message}`));
        resolve({ success: true });
      });
    });
  });

  // ── DELETE /api/servers/:id/files/trash — empty trash permanently ──

  fastify.delete<{
    Params: { id: string };
    Querystring: { name?: string };
  }>('/api/servers/:id/files/trash', async (req) => {
    const { id } = req.params;
    const specificName = req.query.name;
    const trashDir = '/tmp/.headlessos-trash';

    const state = connectionManager.getState(id);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${id}" is not connected`), { statusCode: 400 });
    }

    if (specificName) {
      // Delete a specific item from trash
      if (specificName.includes('/') || specificName.includes('..')) {
        throw Object.assign(new Error('Invalid trash name'), { statusCode: 400 });
      }
      const itemPath = posix.join(trashDir, specificName);
      const command = `rm -rf ${shellEscapeForCopy(itemPath)}`;
      const result = await connectionManager.exec(id, command, 30_000);
      if (result.exitCode !== 0) {
        throw Object.assign(new Error(`Failed to delete from trash: ${result.stderr}`), { statusCode: 500 });
      }
      return { success: true };
    } else {
      // Empty entire trash
      const command = `rm -rf ${shellEscapeForCopy(trashDir)} && mkdir -p ${shellEscapeForCopy(trashDir)}`;
      const result = await connectionManager.exec(id, command, 30_000);
      if (result.exitCode !== 0) {
        throw Object.assign(new Error(`Failed to empty trash: ${result.stderr}`), { statusCode: 500 });
      }
      return { success: true };
    }
  });
}

// ── Helpers ─────────────────────────────────────────────

/** Escape a validated absolute path for use in shell commands (copy only) */
function shellEscapeForCopy(path: string): string {
  // Path has already been validated by requireValidPath, so it's a clean absolute path
  // Wrap in single quotes and escape any single quotes within
  return "'" + path.replace(/'/g, "'\\''") + "'";
}

// ── Helpers ─────────────────────────────────────────────

function formatPermissions(mode: number): string {
  const octal = (mode & 0o7777).toString(8).padStart(4, '0');

  const rwx = (bits: number): string => {
    return (
      (bits & 4 ? 'r' : '-') +
      (bits & 2 ? 'w' : '-') +
      (bits & 1 ? 'x' : '-')
    );
  };

  const owner = (mode >> 6) & 7;
  const group = (mode >> 3) & 7;
  const other = mode & 7;

  const typeChar = (mode & 0o40000) ? 'd' : (mode & 0o120000) === 0o120000 ? 'l' : '-';

  return `${typeChar}${rwx(owner)}${rwx(group)}${rwx(other)} (${octal})`;
}
