// M1.6: Server Config Management
// @see docs/phases/phase-1.md

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { BaseService } from '../services/base-service.js';
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
      await mkdir(CONFIG_DIR, { recursive: true });
    }
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(SERVERS_FILE, 'utf-8');
      this.servers = JSON.parse(raw) as ServerConfig[];
    } catch {
      // File doesn't exist yet — start with empty array
      this.servers = [];
    }
  }

  private async save(): Promise<void> {
    // Strip sensitive fields before writing
    const safe = this.servers.map(s => ({
      ...s,
      // Don't persist plaintext passwords — TODO: M5.3 encryption
      password: s.password ? '***' : undefined,
    }));
    await writeFile(SERVERS_FILE, JSON.stringify(safe, null, 2), 'utf-8');
  }
}
