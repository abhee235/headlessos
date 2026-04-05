// M4.7: Output Cache — hash-based caching layer for parsed command output
// @see docs/phases/phase-4.md
//
// Prevents redundant parsing when terminal output hasn't changed between polls.
// Integrates with ParsingPipeline: cache is checked before parsing, result stored after.

import { createHash } from 'node:crypto';

const DEFAULT_TTL_MS = 60_000; // 60 seconds
const MAX_ENTRIES = 500; // prevent unbounded memory growth

export interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  hitRate: number;
  memoryBytes: number;
}

interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  sizeBytes: number;
}

/**
 * Hash-based output cache.
 *
 * Cache key = hash(serverId + command + rawOutput).
 * If the same server runs the same command and gets the same output,
 * the cached parse result is returned immediately (no re-parse / no LLM call).
 */
export class OutputCache {
  private cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of expired entries every 30 seconds
    this.cleanupInterval = setInterval(() => this.evictExpired(), 30_000);
    // Allow process to exit even with interval running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Get cached parse result if rawOutput hash matches and not expired.
   */
  get<T>(serverId: string, command: string, rawOutput: string): T | null {
    const key = this.buildKey(serverId, command, rawOutput);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      // Expired — remove and count as miss
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data as T;
  }

  /**
   * Cache a parse result keyed by (serverId, command, hash(rawOutput)).
   */
  set<T>(serverId: string, command: string, rawOutput: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
    // Enforce max entries — evict oldest first
    if (this.cache.size >= MAX_ENTRIES) {
      this.evictOldest();
    }

    const key = this.buildKey(serverId, command, rawOutput);
    const serialized = JSON.stringify(data);
    const sizeBytes = Buffer.byteLength(serialized, 'utf-8') + key.length;

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      sizeBytes,
    });
  }

  /**
   * Invalidate all cache entries for a specific server.
   * Called on disconnect to prevent stale data.
   */
  invalidateServer(serverId: string): void {
    const prefix = `${serverId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    let memoryBytes = 0;
    for (const entry of this.cache.values()) {
      memoryBytes += entry.sizeBytes;
    }

    return {
      totalEntries: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? Math.round((this.hits / totalRequests) * 10000) / 100 : 0,
      memoryBytes,
    };
  }

  /**
   * Reset all stats and clear cache.
   */
  reset(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Cleanup on shutdown.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  // ── Internal ──

  private buildKey(serverId: string, command: string, rawOutput: string): string {
    const hash = createHash('sha256')
      .update(rawOutput)
      .digest('hex')
      .slice(0, 16); // 16 hex chars = 64 bits — sufficient for cache dedup
    return `${serverId}:${command}:${hash}`;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  private evictOldest(): void {
    // Delete first 10% of entries (fifo order from Map iteration)
    const toEvict = Math.max(1, Math.floor(this.cache.size * 0.1));
    let evicted = 0;
    for (const key of this.cache.keys()) {
      if (evicted >= toEvict) break;
      this.cache.delete(key);
      evicted++;
    }
  }
}
