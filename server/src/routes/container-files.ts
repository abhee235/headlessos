// EX7: Container Target — file CRUD inside a Docker container via `docker exec`.
// @see docs/phases/phase-ex7.md
//
// Unlike routes/files.ts (SFTP against the SSH HOST), these operate INSIDE a
// container's isolated filesystem by shelling `docker exec <id> …` on the host.
// Content transfers use base64 so binary files survive and no raw content is
// interpolated into the command line.
//
// Security: every container id is validated as hex (validateContainerId), every
// path is normalized + checked (validateAndSanitizePath), and all interpolations
// are shellEscaped. Commands are built here (never taken from the client), so they
// do not go through the dynamic-ui/agent allowlist — same model as routes/docker.ts.

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import {
  validateContainerId,
  validateAndSanitizePath,
  shellEscape,
  sanitizeErrorMessage,
} from '../security/validators.js';
import { parseContainerLs } from '../parsers/container-ls.js';
import type { FileEntry } from 'headlessos-shared';

// Cap for reads/writes through the base64-over-exec path (keeps command length
// and memory sane; this feature targets config/app files, not huge blobs).
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

interface ContainerFileOpts {
  connectionManager: ConnectionManager;
}

export async function containerFileRoutes(
  fastify: FastifyInstance,
  opts: ContainerFileOpts,
): Promise<void> {
  const { connectionManager } = opts;

  // ── helpers ─────────────────────────────────────────────

  function requireConnected(serverId: string): void {
    const state = connectionManager.getState(serverId);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${serverId}" is not connected`), { statusCode: 400 });
    }
  }

  function requireContainerId(id: string): string {
    if (!validateContainerId(id)) {
      throw Object.assign(new Error('Invalid container id'), { statusCode: 400 });
    }
    return id;
  }

  function requirePath(path: string | undefined, field = 'path'): string {
    try {
      if (!path) throw new Error('missing');
      return validateAndSanitizePath(path);
    } catch {
      throw Object.assign(new Error(`Invalid ${field}: must be an absolute path without traversal`), { statusCode: 400 });
    }
  }

  /** Run a command inside the container and return stdout, or throw a typed error. */
  async function execInContainer(serverId: string, cid: string, innerArgs: string, timeout = 15000): Promise<string> {
    const cmd = `docker exec ${cid} ${innerArgs}`;
    const res = await connectionManager.exec(serverId, cmd, timeout);
    if (res.exitCode !== 0) {
      const stderr = res.stderr || '';
      const status = /no such file|not found|cannot access|no such container/i.test(stderr) ? 404 : 500;
      throw Object.assign(new Error(sanitizeErrorMessage(stderr || 'Command failed')), { statusCode: status });
    }
    return res.stdout;
  }

  function sendError(reply: import('fastify').FastifyReply, err: unknown) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.code(status);
    return { success: false, error: err instanceof Error ? err.message : 'Operation failed' };
  }

  const base = '/api/servers/:id/docker/containers/:containerId/fs';

  // ── GET …/fs/list?path=/ — list a directory inside the container ──
  fastify.get<{ Params: { id: string; containerId: string }; Querystring: { path?: string } }>(
    `${base}/list`,
    async (req, reply) => {
      try {
        const { id } = req.params;
        requireConnected(id);
        const cid = requireContainerId(req.params.containerId);
        const path = requirePath(req.query.path ?? '/');
        const stdout = await execInContainer(id, cid, `ls -lA ${shellEscape(path)}`);
        const entries: FileEntry[] = parseContainerLs(stdout);
        return { success: true, path, entries };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // ── GET …/fs/read?path=… — read a file's contents (text) ──
  fastify.get<{ Params: { id: string; containerId: string }; Querystring: { path?: string } }>(
    `${base}/read`,
    async (req, reply) => {
      try {
        const { id } = req.params;
        requireConnected(id);
        const cid = requireContainerId(req.params.containerId);
        const path = requirePath(req.query.path);
        const b64 = await execInContainer(id, cid, `base64 ${shellEscape(path)}`);
        const buf = Buffer.from(b64.replace(/\s/g, ''), 'base64');
        if (buf.byteLength > MAX_BYTES) {
          reply.code(413);
          return { success: false, error: `File too large (max ${MAX_BYTES} bytes)` };
        }
        return { success: true, path, content: buf.toString('utf8'), size: buf.byteLength };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // ── GET …/fs/download?path=… — binary-safe download ──
  fastify.get<{ Params: { id: string; containerId: string }; Querystring: { path?: string } }>(
    `${base}/download`,
    async (req, reply) => {
      try {
        const { id } = req.params;
        requireConnected(id);
        const cid = requireContainerId(req.params.containerId);
        const path = requirePath(req.query.path);
        const b64 = await execInContainer(id, cid, `base64 ${shellEscape(path)}`);
        const buf = Buffer.from(b64.replace(/\s/g, ''), 'base64');
        const name = path.split('/').pop() || 'download';
        reply.header('Content-Type', 'application/octet-stream');
        reply.header('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
        return reply.send(buf);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // ── POST …/fs/write { path, content } — create/overwrite a text file ──
  fastify.post<{ Params: { id: string; containerId: string }; Body: { path?: string; content?: string } }>(
    `${base}/write`,
    async (req, reply) => {
      try {
        const { id } = req.params;
        requireConnected(id);
        const cid = requireContainerId(req.params.containerId);
        const path = requirePath(req.body?.path);
        const content = req.body?.content ?? '';
        const buf = Buffer.from(content, 'utf8');
        if (buf.byteLength > MAX_BYTES) {
          reply.code(413);
          return { success: false, error: `Content too large (max ${MAX_BYTES} bytes)` };
        }
        await writeViaBase64(id, cid, path, buf);
        return { success: true, path, size: buf.byteLength };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // ── POST …/fs/upload { path, contentBase64 } — binary-safe upload ──
  fastify.post<{ Params: { id: string; containerId: string }; Body: { path?: string; contentBase64?: string } }>(
    `${base}/upload`,
    async (req, reply) => {
      try {
        const { id } = req.params;
        requireConnected(id);
        const cid = requireContainerId(req.params.containerId);
        const path = requirePath(req.body?.path);
        const buf = Buffer.from((req.body?.contentBase64 ?? '').replace(/\s/g, ''), 'base64');
        if (buf.byteLength > MAX_BYTES) {
          reply.code(413);
          return { success: false, error: `File too large (max ${MAX_BYTES} bytes)` };
        }
        await writeViaBase64(id, cid, path, buf);
        return { success: true, path, size: buf.byteLength };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // ── POST …/fs/mkdir { path } ──
  fastify.post<{ Params: { id: string; containerId: string }; Body: { path?: string } }>(
    `${base}/mkdir`,
    async (req, reply) => {
      try {
        const { id } = req.params;
        requireConnected(id);
        const cid = requireContainerId(req.params.containerId);
        const path = requirePath(req.body?.path);
        await execInContainer(id, cid, `mkdir -p ${shellEscape(path)}`);
        return { success: true, path };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // ── POST …/fs/rename { oldPath, newPath } ──
  fastify.post<{ Params: { id: string; containerId: string }; Body: { oldPath?: string; newPath?: string } }>(
    `${base}/rename`,
    async (req, reply) => {
      try {
        const { id } = req.params;
        requireConnected(id);
        const cid = requireContainerId(req.params.containerId);
        const oldPath = requirePath(req.body?.oldPath, 'oldPath');
        const newPath = requirePath(req.body?.newPath, 'newPath');
        await execInContainer(id, cid, `mv ${shellEscape(oldPath)} ${shellEscape(newPath)}`);
        return { success: true, oldPath, newPath };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // ── DELETE …/fs?path=… — delete a file or directory ──
  fastify.delete<{ Params: { id: string; containerId: string }; Querystring: { path?: string } }>(
    base,
    async (req, reply) => {
      try {
        const { id } = req.params;
        requireConnected(id);
        const cid = requireContainerId(req.params.containerId);
        const path = requirePath(req.query.path);
        if (path === '/' || path.length < 2) {
          reply.code(400);
          return { success: false, error: 'Refusing to delete this path' };
        }
        await execInContainer(id, cid, `rm -rf ${shellEscape(path)}`);
        return { success: true, path };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // ── internal: write a buffer into the container via base64 over exec stdin ──
  async function writeViaBase64(serverId: string, cid: string, path: string, buf: Buffer): Promise<void> {
    const b64 = buf.toString('base64');
    // echo <b64> | docker exec -i <cid> sh -c 'base64 -d > <path>'
    // b64 is [A-Za-z0-9+/=] only (safe). The inner `sh -c` arg is double-escaped:
    // first the path for the inner shell, then the whole inner command for the host shell.
    const inner = `base64 -d > ${shellEscape(path)}`;
    const cmd = `echo ${b64} | docker exec -i ${cid} sh -c ${shellEscape(inner)}`;
    const res = await connectionManager.exec(serverId, cmd, 20000);
    if (res.exitCode !== 0) {
      const stderr = res.stderr || '';
      const status = /no such file|not found|no such container/i.test(stderr) ? 404 : 500;
      throw Object.assign(new Error(sanitizeErrorMessage(stderr || 'Write failed')), { statusCode: status });
    }
  }
}
