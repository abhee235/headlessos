// M1.6 + M5.3: Server Config Management with credential encryption
// @see docs/phases/phase-1.md, docs/SECURITY.md

import { readFile, rename, writeFile, mkdir, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { BaseService } from '../services/base-service.js';
import { encrypt, decrypt, isCurrentEncryption } from '../security/encryption.js';
import type { ServerConfig } from 'headlessos-shared';

const DEFAULT_CONFIG_DIR = join(homedir(), '.headlessos');

/** M15.12: what must never sit on disk in plain text */
const SECRET_FIELDS = ['password', 'privateKeyPath', 'passphrase'] as const;

/** A secret that can't be decrypted is lost, but its server isn't: the owner signs in again */
function readSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return undefined;
  }
}

export class ConfigStore extends BaseService {
  private servers: ServerConfig[] = [];
  private readonly configDir: string;
  private readonly serversFile: string;

  constructor(name: string, configDir: string = DEFAULT_CONFIG_DIR) {
    super(name);
    this.configDir = configDir;
    this.serversFile = join(configDir, 'servers.json');
  }

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
    if (!existsSync(this.configDir)) {
      await mkdir(this.configDir, { recursive: true, mode: 0o700 });
    }
    // Ensure directory is owner-only (0700)
    try {
      await chmod(this.configDir, 0o700);
    } catch {
      // Non-fatal — may fail on some systems
    }
  }

  private async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.serversFile, 'utf-8');
    } catch {
      // File doesn't exist yet — start with empty array
      this.servers = [];
      return;
    }

    let stored: ServerConfig[];
    try {
      stored = JSON.parse(raw) as ServerConfig[];
    } catch {
      // M15.12: an empty list would be saved over this file, so move it out of the way
      await rename(this.serversFile, `${this.serversFile}.broken`);
      this.servers = [];
      return;
    }

    // M5.3, M15.12: decrypt credentials on load
    this.servers = stored.map(s => ({
      ...s,
      password: readSecret(s.password),
      privateKeyPath: readSecret(s.privateKeyPath),
      passphrase: readSecret(s.passphrase),
    }));

    // Migrate plain text and older encryption (M15.18). A secret that can't be read must not
    // cause a save: that would drop it, and the next start may be able to read it.
    const needsMigration = stored.some(s =>
      SECRET_FIELDS.some(field =>
        s[field] && !isCurrentEncryption(s[field]!) && readSecret(s[field]) !== undefined,
      ),
    );
    if (needsMigration) {
      await this.save();
    }
  }

  private async save(): Promise<void> {
    // M5.3, M15.12: encrypt credentials before writing to disk
    const encrypted = this.servers.map(s => ({
      ...s,
      password: s.password ? encrypt(s.password) : undefined,
      privateKeyPath: s.privateKeyPath ? encrypt(s.privateKeyPath) : undefined,
      passphrase: s.passphrase ? encrypt(s.passphrase) : undefined,
    }));
    await writeFile(this.serversFile, JSON.stringify(encrypted, null, 2), {
      encoding: 'utf-8',
      mode: 0o600, // Owner read/write only
    });
  }
}
