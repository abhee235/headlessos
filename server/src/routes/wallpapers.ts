// Wallpaper Routes — serves system + user wallpapers from local filesystem
// System wallpapers: server/assets/wallpapers/system/
// User wallpapers:   ~/.headlessos/wallpapers/

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Supported image extensions */
const IMAGE_EXTENSIONS = new Set([
  '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif',
]);

/** MIME type map */
const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/** Resolve the system wallpapers directory */
function getSystemDir(): string {
  return join(__dirname, '..', '..', 'assets', 'wallpapers', 'system');
}

/** Resolve the user wallpapers directory (~/.headlessos/wallpapers/) */
function getUserDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return join(home, '.headlessos', 'wallpapers');
}

interface WallpaperInfo {
  id: string;
  name: string;
  filename: string;
  category: 'system' | 'user';
  url: string;
}

/** Scan a directory for image files */
async function scanWallpapers(
  dir: string,
  category: 'system' | 'user',
): Promise<WallpaperInfo[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const wallpapers: WallpaperInfo[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const nameWithoutExt = basename(entry.name, ext);
      // Create a display-friendly name: "golden-hour" → "Golden Hour"
      const displayName = nameWithoutExt
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      wallpapers.push({
        id: `${category}:${entry.name}`,
        name: displayName,
        filename: entry.name,
        category,
        url: `/api/wallpapers/${category}/${encodeURIComponent(entry.name)}`,
      });
    }

    return wallpapers.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // Directory doesn't exist or isn't readable — return empty
    return [];
  }
}

/** Validate filename — no traversal, must have image extension */
function isValidFilename(name: string): boolean {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return false;
  }
  const ext = extname(name).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export async function wallpaperRoutes(fastify: FastifyInstance): Promise<void> {
  // Ensure user wallpaper directory exists
  const userDir = getUserDir();
  await fs.mkdir(userDir, { recursive: true }).catch(() => {});

  // ── GET /api/wallpapers — list all wallpapers ──────────────────────────

  fastify.get('/api/wallpapers', async () => {
    const [system, user] = await Promise.all([
      scanWallpapers(getSystemDir(), 'system'),
      scanWallpapers(getUserDir(), 'user'),
    ]);
    return { system, user };
  });

  // ── GET /api/wallpapers/:category/:filename — serve an image ──────────

  fastify.get(
    '/api/wallpapers/:category/:filename',
    async (
      request: FastifyRequest<{ Params: { category: string; filename: string } }>,
      reply: FastifyReply,
    ) => {
      const { category, filename } = request.params;

      if (category !== 'system' && category !== 'user') {
        return reply.code(400).send({ error: 'Invalid category' });
      }
      if (!isValidFilename(filename)) {
        return reply.code(400).send({ error: 'Invalid filename' });
      }

      const dir = category === 'system' ? getSystemDir() : getUserDir();
      const filePath = join(dir, filename);

      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
          return reply.code(404).send({ error: 'Not found' });
        }

        const ext = extname(filename).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const data = await fs.readFile(filePath);

        return reply
          .header('Content-Type', mime)
          .header('Cache-Control', category === 'system' ? 'public, max-age=86400' : 'no-cache')
          .send(data);
      } catch {
        return reply.code(404).send({ error: 'Not found' });
      }
    },
  );

  // ── POST /api/wallpapers/upload — upload a user wallpaper ─────────────

  fastify.post(
    '/api/wallpapers/upload',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await (request as FastifyRequest & { file: () => Promise<{
        filename: string;
        mimetype: string;
        file: NodeJS.ReadableStream;
      }> }).file();

      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const ext = extname(data.filename).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        return reply
          .code(400)
          .send({ error: `Unsupported format. Allowed: ${[...IMAGE_EXTENSIONS].join(', ')}` });
      }

      // Sanitize filename
      const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const destPath = join(getUserDir(), safeName);

      // Stream to disk
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk as Buffer);
      }
      await fs.writeFile(destPath, Buffer.concat(chunks));

      const nameWithoutExt = basename(safeName, ext);
      const displayName = nameWithoutExt
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const info: WallpaperInfo = {
        id: `user:${safeName}`,
        name: displayName,
        filename: safeName,
        category: 'user',
        url: `/api/wallpapers/user/${encodeURIComponent(safeName)}`,
      };

      return reply.code(201).send(info);
    },
  );

  // ── DELETE /api/wallpapers/user/:filename — delete a user wallpaper ───

  fastify.delete(
    '/api/wallpapers/user/:filename',
    async (
      request: FastifyRequest<{ Params: { filename: string } }>,
      reply: FastifyReply,
    ) => {
      const { filename } = request.params;

      if (!isValidFilename(filename)) {
        return reply.code(400).send({ error: 'Invalid filename' });
      }

      const filePath = join(getUserDir(), filename);

      try {
        await fs.unlink(filePath);
        return { success: true };
      } catch {
        return reply.code(404).send({ error: 'Not found' });
      }
    },
  );
}
