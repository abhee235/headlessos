// M1.6 + M5.3: Server Config Management with credential encryption
// M16.1: a stored secret that can't be opened is kept, not dropped
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

type SecretField = (typeof SECRET_FIELDS)[number];

/** A secret that can't be decrypted now stays out of memory; the owner can still sign in by hand */
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
  /** M16.1: stored values that couldn't be opened, written back as they were */
  private unreadable = new Map<string, Partial<Record<SecretField, string>>>();
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

  /** M15.17: the name of a damaged server list that was kept aside, if there is one */
  damagedListFile(): string | null {
    return existsSync(`${this.serversFile}.broken`) ? 'servers.json.broken' : null;
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
    try {
      await this.save();
    } catch (err) {
      this.servers.pop(); // M16.1: a new secret can't be saved while logins are locked
      throw err;
    }
    return server;
  }

  async updateServer(id: string, updates: Partial<ServerConfig>): Promise<ServerConfig> {
    const index = this.servers.findIndex(s => s.id === id);
    if (index === -1) throw new Error(`Server "${id}" not found`);

    const before = this.servers[index]!;
    this.servers[index] = { ...before, ...updates, id };
    try {
      await this.save();
    } catch (err) {
      this.servers[index] = before; // M16.1: as in addServer
      throw err;
    }
    return this.servers[index]!;
  }

  async removeServer(id: string): Promise<void> {
    const index = this.servers.findIndex(s => s.id === id);
    if (index === -1) throw new Error(`Server "${id}" not found`);

    this.servers.splice(index, 1);
    this.unreadable.delete(id);
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
      if (!Array.isArray(stored)) throw new Error('not a list');
    } catch {
      // M15.12: an empty list would be saved over this file, so move it out of the way
      await rename(this.serversFile, `${this.serversFile}.broken`);
      console.warn('[config] servers.json could not be read, and was kept as servers.json.broken');
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

    // M16.1: whatever didn't open stays on disk for when it can
    this.unreadable.clear();
    stored.forEach((s, i) => {
      const kept: Partial<Record<SecretField, string>> = {};
      for (const field of SECRET_FIELDS) {
        if (s[field] && this.servers[i]![field] === undefined) kept[field] = s[field];
      }
      if (Object.keys(kept).length > 0) this.unreadable.set(s.id, kept);
    });

    // Migrate plain text and older encryption (M15.18). A secret that can't be read gives no
    // reason to save.
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
    const seal = (s: ServerConfig, field: SecretField) => {
      const value = s[field];
      return value ? encrypt(value) : this.unreadable.get(s.id)?.[field];
    };
    const encrypted = this.servers.map(s => ({
      ...s,
      password: seal(s, 'password'),
      privateKeyPath: seal(s, 'privateKeyPath'),
      passphrase: seal(s, 'passphrase'),
    }));
    await writeFile(this.serversFile, JSON.stringify(encrypted, null, 2), {
      encoding: 'utf-8',
      mode: 0o600, // Owner read/write only
    });
  }
}
