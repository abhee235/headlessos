// M1.6 + M5.3: Server Config Management with credential encryption
// @see docs/phases/phase-1.md, docs/SECURITY.md

import { readFile, writeFile, mkdir, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { BaseService } from '../services/base-service.js';
import { encrypt, decrypt, isEncrypted } from '../security/encryption.js';
import type { ServerConfig } from 'headlessos-shared';

const CONFIG_DIR = join(homedir(), '.headlessos');
const SERVERS_FILE = join(CONFIG_DIR, 'servers.json');

export class ConfigStore extends BaseService {
  private servers: ServerConfig[] = [];

  protected async _construct(): Promise<void> {
    await this.ensureConfigDir();
    await this.load();
  }

  // ── Server CRUD ───────────────────────────────────────

  async getServers(): Promise<ServerConfig[]> {
    return [...this.servers];
  }

  /** EX9.2: sync lookup (servers load at construct) — approval cards name the server and login user */
  findServer(id: string): ServerConfig | undefined {
    return this.servers.find((s) => s.id === id);
  }

  async getServer(id: string): Promise<ServerConfig | undefined> {
    return this.servers.find(s => s.id === id);
  }

  async addServer(config: Omit<ServerConfig, 'id'>): Promise<ServerConfig> {
    const server: ServerConfig = {
      ...config,
      id: randomUUID(),
    };
    this.servers.push(server);
    await this.save();
    return server;
  }

  async updateServer(id: string, updates: Partial<ServerConfig>): Promise<ServerConfig> {
    const index = this.servers.findIndex(s => s.id === id);
    if (index === -1) throw new Error(`Server "${id}" not found`);

    this.servers[index] = { ...this.servers[index]!, ...updates, id };
    await this.save();
    return this.servers[index]!;
  }

  async removeServer(id: string): Promise<void> {
    const index = this.servers.findIndex(s => s.id === id);
    if (index === -1) throw new Error(`Server "${id}" not found`);

    this.servers.splice(index, 1);
    await this.save();
  }

  // ── Persistence ───────────────────────────────────────

  private async ensureConfigDir(): Promise<void> {
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    // Ensure directory is owner-only (0700)
    try {
      await chmod(CONFIG_DIR, 0o700);
    } catch {
      // Non-fatal — may fail on some systems
    }
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(SERVERS_FILE, 'utf-8');
      const stored = JSON.parse(raw) as ServerConfig[];

      // M5.3: Decrypt passwords on load
      this.servers = stored.map(s => ({
        ...s,
        password: s.password ? decrypt(s.password) : undefined,
      }));

      // Migrate: if any passwords were stored in plaintext (not encrypted),
      // re-save with encryption to upgrade the file
      const needsMigration = stored.some(s => s.password && !isEncrypted(s.password));
      if (needsMigration) {
        await this.save();
      }
    } catch {
      // File doesn't exist yet — start with empty array
      this.servers = [];
    }
  }

  private async save(): Promise<void> {
    // M5.3: Encrypt passwords before writing to disk
    const encrypted = this.servers.map(s => ({
      ...s,
      password: s.password ? encrypt(s.password) : undefined,
    }));
    await writeFile(SERVERS_FILE, JSON.stringify(encrypted, null, 2), {
      encoding: 'utf-8',
      mode: 0o600, // Owner read/write only
    });
  }
}
