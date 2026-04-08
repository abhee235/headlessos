// EX1.10: Tests for DynamicUIDiskCache
// @see docs/phases/phase-ex1.md

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DynamicUIDiskCache } from '../../src/cache/dynamic-ui-cache.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

// ── Helpers ────────────────────────────────────────────────────────

function makeView(title: string): DynamicView {
  return {
    title,
    sidebarItems: [{ id: 'main', label: title }],
    sections: {
      main: {
        layout: 'stack' as const,
        gap: 'md' as const,
        children: [
          {
            type: 'code-block' as const,
            code: `Sample output for ${title}`,
            language: 'text',
          },
        ],
      },
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('DynamicUIDiskCache', () => {
  let tmpDir: string;
  let cache: DynamicUIDiskCache;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'headlessos-cache-test-'));
    cache = new DynamicUIDiskCache({
      cacheDir: join(tmpDir, 'cache'),
      favoritesFile: join(tmpDir, 'favorites.json'),
    });
    await cache.init();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── Get / Set ──────────────────────────────────────────────────

  describe('get/set', () => {
    it('returns null for uncached entries (miss)', async () => {
      const result = await cache.get('srv1', 'df -h', 'abc123');
      expect(result).toBeNull();
    });

    it('stores and retrieves a DynamicView', async () => {
      const view = makeView('Disk Usage');
      await cache.set('srv1', 'df -h', 'hash1', 'disk', view);

      const result = await cache.get('srv1', 'df -h', 'hash1');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Disk Usage');
    });

    it('returns null for different output hash (miss)', async () => {
      const view = makeView('Disk Usage');
      await cache.set('srv1', 'df -h', 'hash1', 'disk', view);

      const result = await cache.get('srv1', 'df -h', 'hash2');
      expect(result).toBeNull();
    });

    it('differentiates between servers', async () => {
      const view1 = makeView('Server 1 Disk');
      const view2 = makeView('Server 2 Disk');
      await cache.set('srv1', 'df -h', 'hash1', 'disk', view1);
      await cache.set('srv2', 'df -h', 'hash1', 'disk', view2);

      const result1 = await cache.get('srv1', 'df -h', 'hash1');
      const result2 = await cache.get('srv2', 'df -h', 'hash1');
      expect(result1!.title).toBe('Server 1 Disk');
      expect(result2!.title).toBe('Server 2 Disk');
    });

    it('returns null for expired entries', async () => {
      const view = makeView('Expired');
      // Set with 1ms TTL → immediately expires
      await cache.set('srv1', 'df -h', 'hash1', 'disk', view, 1);

      // Wait a tick for expiry
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await cache.get('srv1', 'df -h', 'hash1');
      expect(result).toBeNull();
    });

    it('persists data across cache instances', async () => {
      const view = makeView('Persistent');
      await cache.set('srv1', 'df -h', 'hash1', 'disk', view);

      // Create a new cache pointing to the same directory
      const cache2 = new DynamicUIDiskCache({
        cacheDir: join(tmpDir, 'cache'),
        favoritesFile: join(tmpDir, 'favorites.json'),
      });
      await cache2.init();

      const result = await cache2.get('srv1', 'df -h', 'hash1');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Persistent');
    });
  });

  // ── Invalidation ──────────────────────────────────────────────

  describe('invalidateServer', () => {
    it('removes all entries for a specific server', async () => {
      await cache.set('srv1', 'df -h', 'h1', 'disk', makeView('V1'));
      await cache.set('srv1', 'free -m', 'h2', 'memory', makeView('V2'));
      await cache.set('srv2', 'df -h', 'h3', 'disk', makeView('V3'));

      await cache.invalidateServer('srv1');

      expect(await cache.get('srv1', 'df -h', 'h1')).toBeNull();
      expect(await cache.get('srv1', 'free -m', 'h2')).toBeNull();
      // srv2 should be unaffected
      expect(await cache.get('srv2', 'df -h', 'h3')).not.toBeNull();
    });
  });

  describe('clear', () => {
    it('removes all cached entries', async () => {
      await cache.set('srv1', 'df -h', 'h1', 'disk', makeView('V1'));
      await cache.set('srv2', 'df -h', 'h2', 'disk', makeView('V2'));

      await cache.clear();

      expect(await cache.get('srv1', 'df -h', 'h1')).toBeNull();
      expect(await cache.get('srv2', 'df -h', 'h2')).toBeNull();
    });
  });

  // ── Favorites ─────────────────────────────────────────────────

  describe('favorites', () => {
    it('starts with empty favorites list', async () => {
      const favs = await cache.getFavorites();
      expect(favs).toEqual([]);
    });

    it('adds a favorite and returns it', async () => {
      const view = makeView('Pinned View');
      const fav = await cache.addFavorite('docker', 'docker ps', view, 'My Containers');

      expect(fav.id).toBeTruthy();
      expect(fav.tool).toBe('docker');
      expect(fav.command).toBe('docker ps');
      expect(fav.label).toBe('My Containers');
      expect(fav.pinnedAt).toBeTruthy();
    });

    it('lists all favorites', async () => {
      await cache.addFavorite('docker', 'docker ps', makeView('A'), 'Containers');
      await cache.addFavorite('disk', 'df -h', makeView('B'), 'Disk');

      const favs = await cache.getFavorites();
      expect(favs).toHaveLength(2);
      expect(favs[0].label).toBe('Containers');
      expect(favs[1].label).toBe('Disk');
    });

    it('removes a favorite by ID', async () => {
      const fav = await cache.addFavorite('docker', 'docker ps', makeView('A'), 'Containers');
      const removed = await cache.removeFavorite(fav.id);
      expect(removed).toBe(true);

      const favs = await cache.getFavorites();
      expect(favs).toHaveLength(0);
    });

    it('returns false when removing non-existent favorite', async () => {
      const removed = await cache.removeFavorite('non-existent-id');
      expect(removed).toBe(false);
    });

    it('persists favorites across instances', async () => {
      await cache.addFavorite('docker', 'docker ps', makeView('A'), 'Containers');

      const cache2 = new DynamicUIDiskCache({
        cacheDir: join(tmpDir, 'cache'),
        favoritesFile: join(tmpDir, 'favorites.json'),
      });

      const favs = await cache2.getFavorites();
      expect(favs).toHaveLength(1);
      expect(favs[0].label).toBe('Containers');
    });
  });

  // ── Stats ─────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns initial stats with zero values', async () => {
      const stats = await cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalFavorites).toBe(0);
      expect(stats.diskHits).toBe(0);
      expect(stats.diskMisses).toBe(0);
    });

    it('tracks hits and misses', async () => {
      await cache.set('srv1', 'df -h', 'h1', 'disk', makeView('V'));

      await cache.get('srv1', 'df -h', 'h1'); // hit
      await cache.get('srv1', 'df -h', 'h1'); // hit
      await cache.get('srv1', 'df -h', 'missing'); // miss

      const stats = await cache.getStats();
      expect(stats.diskHits).toBe(2);
      expect(stats.diskMisses).toBe(1);
      expect(stats.totalEntries).toBe(1);
    });

    it('counts favorites in stats', async () => {
      await cache.addFavorite('docker', 'docker ps', makeView('A'), 'A');
      await cache.addFavorite('disk', 'df -h', makeView('B'), 'B');

      const stats = await cache.getStats();
      expect(stats.totalFavorites).toBe(2);
    });
  });

  // ── init idempotency ──────────────────────────────────────────

  describe('init', () => {
    it('can be called multiple times safely', async () => {
      await cache.init();
      await cache.init();
      // Should not throw
      const result = await cache.get('srv1', 'cmd', 'hash');
      expect(result).toBeNull();
    });
  });
});
