// M1.7: Server API Routes
// @see docs/phases/phase-1.md

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { ConfigStore } from '../config/store.js';
import type { ServerConfig } from 'headlessos-shared';

export async function serverRoutes(
  fastify: FastifyInstance,
  opts: { connectionManager: ConnectionManager; configStore: ConfigStore },
): Promise<void> {
  const { connectionManager, configStore } = opts;

  // ── GET /api/servers — list all servers ───────────────

  fastify.get('/api/servers', async () => {
    const servers = await configStore.getServers();
    return servers.map(s => ({
      ...s,
      password: undefined,  // Strip sensitive data
      passphrase: undefined,
      state: connectionManager.getState(s.id),
    }));
  });

  // ── POST /api/servers — add a server ──────────────────

  fastify.post<{ Body: Omit<ServerConfig, 'id'> }>('/api/servers', async (req, reply) => {
    const server = await configStore.addServer(req.body);
    reply.code(201);
    return { ...server, password: undefined, passphrase: undefined };
  });

  // ── PUT /api/servers/:id — update server ──────────────

  fastify.put<{
    Params: { id: string };
    Body: Partial<ServerConfig>;
  }>('/api/servers/:id', async (req) => {
    const updated = await configStore.updateServer(req.params.id, req.body);
    return { ...updated, password: undefined, passphrase: undefined };
  });

  // ── DELETE /api/servers/:id ───────────────────────────

  fastify.delete<{ Params: { id: string } }>('/api/servers/:id', async (req, reply) => {
    await connectionManager.disconnect(req.params.id);
    await configStore.removeServer(req.params.id);
    reply.code(204);
  });

  // ── POST /api/servers/:id/connect ─────────────────────

  fastify.post<{
    Params: { id: string };
    Body: { password?: string; privateKey?: string; passphrase?: string };
  }>('/api/servers/:id/connect', async (req, reply) => {
    const config = await configStore.getServer(req.params.id);
    if (!config) {
      reply.code(404);
      return { error: 'Server not found' };
    }

    // Override stored credentials with session-provided ones
    const connectConfig = { ...config };
    if (req.body?.password) connectConfig.password = req.body.password;
    if (req.body?.privateKey) connectConfig.privateKeyPath = req.body.privateKey;
    if (req.body?.passphrase) connectConfig.passphrase = req.body.passphrase;

    try {
      await connectionManager.connect(connectConfig);
      return connectionManager.getState(req.params.id);
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : 'Connection failed' };
    }
  });

  // ── POST /api/servers/:id/disconnect ──────────────────

  fastify.post<{ Params: { id: string } }>('/api/servers/:id/disconnect', async (req) => {
    await connectionManager.disconnect(req.params.id);
    return connectionManager.getState(req.params.id);
  });

  // ── GET /api/servers/:id/status ───────────────────────

  fastify.get<{ Params: { id: string } }>('/api/servers/:id/status', async (req) => {
    return connectionManager.getState(req.params.id);
  });

  // ── GET /api/ssh-keys — detect local SSH keys ────────

  fastify.get('/api/ssh-keys', async (_req, reply) => {
    const sshDir = join(homedir(), '.ssh');
    try {
      const files = await readdir(sshDir);
      // Match private key files (no .pub extension, common key patterns)
      const keyPatterns = [
        /^id_rsa$/,
        /^id_ed25519$/,
        /^id_ecdsa$/,
        /^id_dsa$/,
        /^id_.*(?<!\.pub)$/,    // any id_* file that's not .pub
      ];
      const keyFiles = files
        .filter(f => keyPatterns.some(p => p.test(f)))
        .filter(f => !f.endsWith('.pub'));  // extra safety

      const keys: Array<{ name: string; path: string; type: string }> = [];
      for (const file of keyFiles) {
        const fullPath = join(sshDir, file);
        try {
          const content = await readFile(fullPath, 'utf-8');
          // Detect key type from first line
          let type = 'unknown';
          if (content.includes('RSA')) type = 'RSA';
          else if (content.includes('ED25519') || content.includes('ed25519')) type = 'ED25519';
          else if (content.includes('ECDSA') || content.includes('ecdsa')) type = 'ECDSA';
          else if (content.includes('DSA')) type = 'DSA';
          else if (content.includes('OPENSSH')) type = 'OpenSSH';

          keys.push({ name: file, path: fullPath, type });
        } catch {
          // Skip unreadable files
        }
      }

      return { keys };
    } catch {
      // ~/.ssh doesn't exist or isn't readable
      return { keys: [] };
    }
  });

  // ── GET /api/ssh-keys/:name — read a specific key's content ──

  fastify.get<{ Params: { name: string } }>('/api/ssh-keys/:name', async (req, reply) => {
    const keyName = req.params.name;
    // Validate: only allow simple filenames (no path traversal)
    if (/[/\\]/.test(keyName) || keyName.includes('..')) {
      reply.code(400);
      return { error: 'Invalid key name' };
    }

    const keyPath = join(homedir(), '.ssh', keyName);
    try {
      const content = await readFile(keyPath, 'utf-8');
      // Verify it looks like a private key
      if (!content.includes('PRIVATE KEY')) {
        reply.code(400);
        return { error: 'File does not appear to be a private key' };
      }
      return { content };
    } catch {
      reply.code(404);
      return { error: 'Key not found' };
    }
  });
}
