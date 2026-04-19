// EX5-C.1: User App Persistence — CRUD API routes
// @see docs/phases/phase-ex5.md

import type { FastifyInstance } from 'fastify';
import {
  AppStore,
  CreateAppSchema,
  UpdateAppSchema,
  type SavedApp,
} from '../dynamic-ui/app-store.js';

interface AppStoreRouteDeps {
  appStore: AppStore;
}

export async function appStoreRoutes(
  fastify: FastifyInstance,
  opts: AppStoreRouteDeps,
): Promise<void> {
  const { appStore } = opts;

  // ── GET /api/dynamic-ui/apps — List all saved apps ──────────

  fastify.get('/api/dynamic-ui/apps', async () => {
    const apps = appStore.listAll();
    return { apps };
  });

  // ── GET /api/dynamic-ui/apps/:id — Get single app ──────────

  fastify.get<{ Params: { id: string } }>(
    '/api/dynamic-ui/apps/:id',
    async (req, reply) => {
      const app = appStore.getById(req.params.id);
      if (!app) {
        return reply.status(404).send({ error: 'App not found' });
      }
      return { app };
    },
  );

  // ── POST /api/dynamic-ui/apps — Create new app ─────────────

  fastify.post<{
    Body: Record<string, unknown>;
  }>('/api/dynamic-ui/apps', async (req, reply) => {
    const parsed = CreateAppSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid app data',
        details: parsed.error.issues,
      });
    }
    const app = await appStore.create(parsed.data);
    return reply.status(201).send({ app });
  });

  // ── PUT /api/dynamic-ui/apps/:id — Update app ──────────────

  fastify.put<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>('/api/dynamic-ui/apps/:id', async (req, reply) => {
    const parsed = UpdateAppSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid update data',
        details: parsed.error.issues,
      });
    }
    const app = await appStore.update(req.params.id, parsed.data);
    if (!app) {
      return reply.status(404).send({ error: 'App not found' });
    }
    return { app };
  });

  // ── DELETE /api/dynamic-ui/apps/:id — Delete app ────────────

  fastify.delete<{ Params: { id: string } }>(
    '/api/dynamic-ui/apps/:id',
    async (req, reply) => {
      const removed = await appStore.remove(req.params.id);
      if (!removed) {
        return reply.status(404).send({ error: 'App not found' });
      }
      return reply.status(204).send();
    },
  );
}
