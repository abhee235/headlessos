// EX1.10: Dynamic UI Disk Cache — persistent schema cache across app restarts
// @see docs/phases/phase-ex1.md

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';

const CACHE_DIR = join(homedir(), '.headlessos', 'dynamic-ui-cache');
const FAVORITES_FILE = join(homedir(), '.headlessos', 'dynamic-ui-favorites.json');
const MAX_DISK_ENTRIES = 200;
const DEFAULT_DISK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Types ──────────────────────────────────────────────────────────

export interface DiskCacheEntry {
  key: string;
  tool: string;
  command: string;
  view: DynamicView;
  createdAt: string;
  expiresAt: string;
}

export interface FavoriteEntry {
  id: string;
  tool: string;
  command: string;
  view: DynamicView;
  label: string;
  pinnedAt: string;
}

export interface DiskCacheStats {
  totalEntries: number;
  totalFavorites: number;
  diskHits: number;
  diskMisses: number;
}

// ── Disk Cache ─────────────────────────────────────────────────────

export class DynamicUIDiskCache {
  private cacheDir: string;
  private favoritesFile: string;
  private initialized = false;
  private diskHits = 0;
  private diskMisses = 0;

  constructor(opts?: { cacheDir?: string; favoritesFile?: string }) {
    this.cacheDir = opts?.cacheDir ?? CACHE_DIR;
    this.favoritesFile = opts?.favoritesFile ?? FAVORITES_FILE;
  }

  /** Ensure cache directory exists. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.cacheDir, { recursive: true });
    this.initialized = true;
  }

  // ── Get / Set ────────────────────────────────────────────────────

  /** Retrieve a cached DynamicView from disk. Returns null on miss. */
  async get(serverId: string, command: string, outputHash: string): Promise<DynamicView | null> {
    await this.init();
    const key = this.buildKey(serverId, command, outputHash);
    const filePath = this.entryPath(key);

    try {
      const raw = await readFile(filePath, 'utf-8');
      const entry = JSON.parse(raw) as DiskCacheEntry;

      // Check expiry
      if (new Date(entry.expiresAt).getTime() < Date.now()) {
        await unlink(filePath).catch(() => {});
        this.diskMisses++;
        return null;
      }

      // Validate the view
      const parsed = DynamicViewSchema.safeParse(entry.view);
      if (!parsed.success) {
        await unlink(filePath).catch(() => {});
        this.diskMisses++;
        return null;
      }

      this.diskHits++;
      return parsed.data;
    } catch {
      this.diskMisses++;
      return null;
    }
  }

  /** Store a DynamicView on disk. */
  async set(
    serverId: string,
    command: string,
    outputHash: string,
    tool: string,
    view: DynamicView,
    ttlMs = DEFAULT_DISK_TTL_MS,
  ): Promise<void> {
    await this.init();
    const key = this.buildKey(serverId, command, outputHash);

    const entry: DiskCacheEntry = {
      key,
      tool,
      command,
      view,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };

    await writeFile(this.entryPath(key), JSON.stringify(entry, null, 2), 'utf-8');

    // Enforce max entries
    await this.enforceLimit();
  }

  /** Invalidate all cache entries for a specific server. */
  async invalidateServer(serverId: string): Promise<void> {
    await this.init();
    const prefix = `${serverId}-`;
    try {
      const files = await readdir(this.cacheDir);
      for (const file of files) {
        if (file.startsWith(prefix)) {
          await unlink(join(this.cacheDir, file)).catch(() => {});
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  /** Clear all cached entries. */
  async clear(): Promise<void> {
    await this.init();
    try {
      const files = await readdir(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await unlink(join(this.cacheDir, file)).catch(() => {});
        }
      }
    } catch {
      // Ignore
    }
  }

  // ── Favorites ────────────────────────────────────────────────────

  /** Get all pinned favorites. */
  async getFavorites(): Promise<FavoriteEntry[]> {
    try {
      const raw = await readFile(this.favoritesFile, 'utf-8');
      return JSON.parse(raw) as FavoriteEntry[];
    } catch {
      return [];
    }
  }

  /** Pin a view as a favorite. */
  async addFavorite(
    tool: string,
    command: string,
    view: DynamicView,
    label: string,
  ): Promise<FavoriteEntry> {
    const favorites = await this.getFavorites();
    const entry: FavoriteEntry = {
      id: createHash('sha256')
        .update(`${tool}:${command}:${Date.now()}`)
        .digest('hex')
        .slice(0, 12),
      tool,
      command,
      view,
      label,
      pinnedAt: new Date().toISOString(),
    };
    favorites.push(entry);
    await this.writeFavorites(favorites);
    return entry;
  }

  /** Unpin a favorite by ID. */
  async removeFavorite(id: string): Promise<boolean> {
    const favorites = await this.getFavorites();
    const filtered = favorites.filter(f => f.id !== id);
    if (filtered.length === favorites.length) return false;
    await this.writeFavorites(filtered);
    return true;
  }

  // ── Stats ────────────────────────────────────────────────────────

  async getStats(): Promise<DiskCacheStats> {
    let totalEntries = 0;
    try {
      const files = await readdir(this.cacheDir);
      totalEntries = files.filter(f => f.endsWith('.json')).length;
    } catch {
      // Directory doesn't exist yet
    }

    const favorites = await this.getFavorites();

    return {
      totalEntries,
      totalFavorites: favorites.length,
      diskHits: this.diskHits,
      diskMisses: this.diskMisses,
    };
  }

  // ── Internal ─────────────────────────────────────────────────────

  private buildKey(serverId: string, command: string, outputHash: string): string {
    const hash = createHash('sha256')
      .update(`${serverId}:${command}:${outputHash}`)
      .digest('hex')
      .slice(0, 16);
    return `${serverId}-${hash}`;
  }

  private entryPath(key: string): string {
    return join(this.cacheDir, `${key}.json`);
  }

  private async writeFavorites(favorites: FavoriteEntry[]): Promise<void> {
    const dir = join(this.favoritesFile, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(this.favoritesFile, JSON.stringify(favorites, null, 2), 'utf-8');
  }

  private async enforceLimit(): Promise<void> {
    try {
      const files = await readdir(this.cacheDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      if (jsonFiles.length <= MAX_DISK_ENTRIES) return;

      // Sort by modification time, delete oldest
      const filesWithTime = await Promise.all(
        jsonFiles.map(async (f) => {
          const p = join(this.cacheDir, f);
          const s = await stat(p).catch(() => null);
          return { path: p, mtime: s?.mtimeMs ?? 0 };
        }),
      );
      filesWithTime.sort((a, b) => a.mtime - b.mtime);

      const toDelete = filesWithTime.slice(0, jsonFiles.length - MAX_DISK_ENTRIES);
      for (const f of toDelete) {
        await unlink(f.path).catch(() => {});
      }
    } catch {
      // Ignore enforcement errors
    }
  }
}
