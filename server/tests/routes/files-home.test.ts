// EX8.30: GET /api/servers/:id/files/home — the login's home folder for File Explorer's favourites
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { fileRoutes } from '../../src/routes/files.js';
import type { FilesService } from '../../src/services/domain/files-service.js';

async function appWith(homeDir: FilesService['homeDir']) {
  const app = Fastify();
  await app.register(fileRoutes, { filesService: { homeDir } as unknown as FilesService });
  return app;
}

describe('GET /api/servers/:id/files/home', () => {
  it('returns the path the server reports', async () => {
    const homeDir = vi.fn(async () => ({ ok: true as const, data: { path: '/home/deploy' } }));
    const app = await appWith(homeDir as unknown as FilesService['homeDir']);
    const res = await app.inject({ method: 'GET', url: '/api/servers/s1/files/home' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ path: '/home/deploy' });
    expect(homeDir).toHaveBeenCalledWith('s1');
  });

  it('passes the service error and status through', async () => {
    const homeDir = vi.fn(async () => ({ ok: false as const, error: 'Server "s1" is not connected', statusCode: 400 }));
    const app = await appWith(homeDir as unknown as FilesService['homeDir']);
    const res = await app.inject({ method: 'GET', url: '/api/servers/s1/files/home' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Server "s1" is not connected' });
  });
});
