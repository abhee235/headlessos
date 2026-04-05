// M2.3 + M2.5: File Explorer Routes (SFTP-based)
// @see docs/phases/phase-2.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import { posix } from 'path';
import { validatePath } from '../security/validators.js';
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
