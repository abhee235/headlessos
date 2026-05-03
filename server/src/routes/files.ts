// M2.3 + M2.5 / M12.8: File Explorer Routes — thin HTTP wrappers around FilesService
// @see docs/phases/phase-2.md, docs/phases/phase-12.md
//
// All SFTP business logic lives in FilesService. This file only handles:
//   - HTTP param extraction + ServiceResult → HTTP response mapping
//   - Multipart upload streaming (tightly coupled to Fastify request.parts() API)
//   - Download stream piping to Fastify reply

import type { FastifyInstance } from 'fastify';
import type { FilesService } from '../services/domain/files-service.js';
import { posix } from 'path';
import { validatePath } from '../security/validators.js';

interface FileRouteOpts {
  filesService: FilesService;
}

export async function fileRoutes(
  fastify: FastifyInstance,
  opts: FileRouteOpts,
): Promise<void> {
  const { filesService } = opts;

  // ── GET /api/servers/:id/files — list directory ───────

  fastify.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/api/servers/:id/files',
    async (req, reply) => {
      const r = await filesService.listDirectory(req.params.id, req.query.path ?? '/');
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { error: r.error }; }
      return r.data;
    },
  );

  // ── GET /api/servers/:id/files/read — read file content ──

  fastify.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/api/servers/:id/files/read',
    async (req, reply) => {
      const r = await filesService.readFile(req.params.id, req.query.path ?? '');
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { error: r.error }; }
      return r.data;
    },
  );

  // ── POST /api/servers/:id/files/write — write file ────

  fastify.post<{ Params: { id: string }; Body: { path: string; content: string } }>(
    '/api/servers/:id/files/write',
    async (req, reply) => {
      const r = await filesService.writeFile(req.params.id, req.body.path, req.body.content);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, size: r.data!.size };
    },
  );

  // ── POST /api/servers/:id/files/mkdir ─────────────────

  fastify.post<{ Params: { id: string }; Body: { path: string } }>(
    '/api/servers/:id/files/mkdir',
    async (req, reply) => {
      const r = await filesService.mkdir(req.params.id, req.body.path);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true };
    },
  );

  // ── POST /api/servers/:id/files/rename ────────────────

  fastify.post<{ Params: { id: string }; Body: { oldPath: string; newPath: string } }>(
    '/api/servers/:id/files/rename',
    async (req, reply) => {
      const r = await filesService.rename(req.params.id, req.body.oldPath, req.body.newPath);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true };
    },
  );

  // ── DELETE /api/servers/:id/files ─────────────────────

  fastify.delete<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/api/servers/:id/files',
    async (req, reply) => {
      const r = await filesService.delete(req.params.id, req.query.path ?? '');
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true };
    },
  );

  // ── GET /api/servers/:id/files/stat ───────────────────

  fastify.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/api/servers/:id/files/stat',
    async (req, reply) => {
      const r = await filesService.stat(req.params.id, req.query.path ?? '');
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { error: r.error }; }
      return r.data;
    },
  );

  // ── GET /api/servers/:id/files/download — pipe stream to HTTP ──

  fastify.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/api/servers/:id/files/download',
    async (req, reply) => {
      const r = await filesService.getReadStream(req.params.id, req.query.path ?? '');
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { error: r.error }; }
      reply.header('Content-Disposition', `attachment; filename="${r.data!.filename}"`);
      reply.header('Content-Type', 'application/octet-stream');
      return reply.send(r.data!.stream);
    },
  );

  // ── POST /api/servers/:id/files/upload — multipart streaming ──
  // Multipart handling stays in the route (tightly coupled to Fastify request.parts()).

  fastify.post<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/api/servers/:id/files/upload',
    async (req, reply) => {
      const { id } = req.params;
      const destDir = req.query.path ?? '/';

      if (!validatePath(destDir)) {
        reply.code(400);
        return { success: false, error: 'Invalid destination path' };
      }

      const parts = req.parts();
      const results: Array<{ name: string; size: number; success: boolean }> = [];

      for await (const part of parts) {
        if (part.type !== 'file' || !part.filename) continue;

        const safeName = part.filename.replace(/[/\\]/g, '_').replace(/\.\./g, '_');
        const remotePath = posix.join(destDir, safeName);

        if (!validatePath(remotePath)) {
          results.push({ name: safeName, size: 0, success: false });
          continue;
        }

        const wr = await filesService.getWriteStream(id, remotePath);
        if (!wr.ok) {
          results.push({ name: safeName, size: 0, success: false });
          continue;
        }

        const size = await new Promise<number>((resolve, reject) => {
          const writeStream = wr.data!;
          let totalBytes = 0;
          part.file.on('data', (chunk: Buffer) => { totalBytes += chunk.length; });
          part.file.pipe(writeStream);
          writeStream.on('close', () => resolve(totalBytes));
          writeStream.on('error', (err: Error) => reject(err));
          part.file.on('error', (err: Error) => reject(err));
        });

        results.push({ name: safeName, size, success: true });
      }

      return { success: true, files: results };
    },
  );

  // ── POST /api/servers/:id/files/copy ──────────────────

  fastify.post<{ Params: { id: string }; Body: { sourcePath: string; destPath: string } }>(
    '/api/servers/:id/files/copy',
    async (req, reply) => {
      const r = await filesService.copy(req.params.id, req.body.sourcePath, req.body.destPath);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true };
    },
  );

  // ── POST /api/servers/:id/files/move ──────────────────

  fastify.post<{ Params: { id: string }; Body: { sourcePath: string; destPath: string } }>(
    '/api/servers/:id/files/move',
    async (req, reply) => {
      const r = await filesService.move(req.params.id, req.body.sourcePath, req.body.destPath);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true };
    },
  );

  // ── GET /api/servers/:id/files/search ─────────────────

  fastify.get<{
    Params: { id: string };
    Querystring: { path?: string; query?: string; maxDepth?: string };
  }>(
    '/api/servers/:id/files/search',
    async (req, reply) => {
      const r = await filesService.search(
        req.params.id,
        req.query.path ?? '/',
        req.query.query ?? '',
        req.query.maxDepth ?? '5',
      );
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { error: r.error }; }
      return r.data;
    },
  );

  // ── POST /api/servers/:id/files/trash — move to trash ──

  fastify.post<{ Params: { id: string }; Body: { path: string } }>(
    '/api/servers/:id/files/trash',
    async (req, reply) => {
      const r = await filesService.moveToTrash(req.params.id, req.body.path);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true, ...r.data };
    },
  );

  // ── GET /api/servers/:id/files/trash — list trash ─────

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/files/trash',
    async (req, reply) => {
      const r = await filesService.listTrash(req.params.id);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { error: r.error }; }
      return r.data;
    },
  );

  // ── POST /api/servers/:id/files/trash/restore ─────────

  fastify.post<{ Params: { id: string }; Body: { trashName: string; restorePath: string } }>(
    '/api/servers/:id/files/trash/restore',
    async (req, reply) => {
      const { trashName, restorePath } = req.body;
      const r = await filesService.restoreFromTrash(req.params.id, trashName, restorePath);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true };
    },
  );

  // ── DELETE /api/servers/:id/files/trash — empty trash ──

  fastify.delete<{ Params: { id: string }; Querystring: { name?: string } }>(
    '/api/servers/:id/files/trash',
    async (req, reply) => {
      const r = await filesService.emptyTrash(req.params.id, req.query.name);
      if (!r.ok) { reply.code(r.statusCode ?? 500); return { success: false, error: r.error }; }
      return { success: true };
    },
  );
}
