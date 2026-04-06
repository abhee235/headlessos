// M10.8: Plugin Registry Unit Tests
// @see docs/PROGRESS.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

// ── Inline PluginManifest + Registry for testing ──

const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/),
  name: z.string().min(1).max(64),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/),
  description: z.string().max(256).optional(),
  permissions: z.array(z.string()).default([]),
});

type PluginManifest = z.infer<typeof PluginManifestSchema>;
type PluginState = 'installed' | 'active' | 'inactive' | 'error';

interface PluginModule {
  activate?: (ctx: { manifest: PluginManifest; onDispose: (fn: () => void) => void }) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

interface PluginEntry {
  manifest: PluginManifest;
  state: PluginState;
  module?: PluginModule;
  error?: string;
}

class TestPluginRegistry {
  private plugins = new Map<string, PluginEntry>();
  private disposables = new Map<string, Array<() => void>>();

  register(manifest: PluginManifest, mod?: PluginModule): void {
    const parsed = PluginManifestSchema.parse(manifest);
    if (this.plugins.has(parsed.id)) throw new Error(`Already registered: ${parsed.id}`);
    this.plugins.set(parsed.id, { manifest: parsed, state: 'installed', module: mod });
  }

  async activate(id: string): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) throw new Error(`Not found: ${id}`);
    if (entry.state === 'active') return;

    const disposeFns: Array<() => void> = [];
    this.disposables.set(id, disposeFns);

    try {
      if (entry.module?.activate) {
        await entry.module.activate({
          manifest: entry.manifest,
          onDispose: (fn) => disposeFns.push(fn),
        });
      }
      entry.state = 'active';
      entry.error = undefined;
    } catch (err) {
      entry.state = 'error';
      entry.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async deactivate(id: string): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) throw new Error(`Not found: ${id}`);
    if (entry.state !== 'active') return;

    try {
      if (entry.module?.deactivate) await entry.module.deactivate();
    } finally {
      const fns = this.disposables.get(id) ?? [];
      for (const fn of fns) { try { fn(); } catch { /* ignore */ } }
      this.disposables.delete(id);
      entry.state = 'inactive';
    }
  }

  async unregister(id: string): Promise<void> {
    if (this.plugins.get(id)?.state === 'active') await this.deactivate(id);
    this.plugins.delete(id);
  }

  get(id: string) { return this.plugins.get(id); }
  getAll() { return [...this.plugins.values()]; }
  get size() { return this.plugins.size; }
}

// ── Tests ────────────────────────────────────────────────

const VALID_MANIFEST: PluginManifest = {
  id: 'com.example.test',
  name: 'Test Plugin',
  version: '1.0.0',
  description: 'A test plugin',
  permissions: [],
};

describe('PluginManifestSchema', () => {
  it('should accept a valid manifest', () => {
    expect(() => PluginManifestSchema.parse(VALID_MANIFEST)).not.toThrow();
  });

  it('should reject invalid ID format', () => {
    expect(() => PluginManifestSchema.parse({ ...VALID_MANIFEST, id: 'bad_id' })).toThrow();
    expect(() => PluginManifestSchema.parse({ ...VALID_MANIFEST, id: 'UPPERCASE.bad' })).toThrow();
  });

  it('should reject invalid version', () => {
    expect(() => PluginManifestSchema.parse({ ...VALID_MANIFEST, version: 'v1' })).toThrow();
  });

  it('should accept pre-release versions', () => {
    expect(() => PluginManifestSchema.parse({ ...VALID_MANIFEST, version: '1.0.0-beta.1' })).not.toThrow();
  });

  it('should require name', () => {
    expect(() => PluginManifestSchema.parse({ ...VALID_MANIFEST, name: '' })).toThrow();
  });

  it('should default permissions to empty array', () => {
    const m = { id: 'com.test.foo', name: 'Foo', version: '1.0.0' };
    const parsed = PluginManifestSchema.parse(m);
    expect(parsed.permissions).toEqual([]);
  });
});

describe('PluginRegistry', () => {
  let registry: TestPluginRegistry;

  beforeEach(() => {
    registry = new TestPluginRegistry();
  });

  it('should register a plugin', () => {
    registry.register(VALID_MANIFEST);
    expect(registry.size).toBe(1);
    expect(registry.get('com.example.test')?.state).toBe('installed');
  });

  it('should reject duplicate registration', () => {
    registry.register(VALID_MANIFEST);
    expect(() => registry.register(VALID_MANIFEST)).toThrow(/Already registered/);
  });

  it('should activate a plugin', async () => {
    const activate = vi.fn();
    registry.register(VALID_MANIFEST, { activate });
    await registry.activate('com.example.test');
    expect(activate).toHaveBeenCalledTimes(1);
    expect(registry.get('com.example.test')?.state).toBe('active');
  });

  it('should skip activating an already-active plugin', async () => {
    const activate = vi.fn();
    registry.register(VALID_MANIFEST, { activate });
    await registry.activate('com.example.test');
    await registry.activate('com.example.test');
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('should deactivate a plugin', async () => {
    const deactivate = vi.fn();
    registry.register(VALID_MANIFEST, { activate: vi.fn(), deactivate });
    await registry.activate('com.example.test');
    await registry.deactivate('com.example.test');
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(registry.get('com.example.test')?.state).toBe('inactive');
  });

  it('should run disposables on deactivate', async () => {
    const dispose = vi.fn();
    registry.register(VALID_MANIFEST, {
      activate: (ctx) => {
        ctx.onDispose(dispose);
      },
    });
    await registry.activate('com.example.test');
    await registry.deactivate('com.example.test');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('should handle activation errors', async () => {
    registry.register(VALID_MANIFEST, {
      activate: () => { throw new Error('fail'); },
    });
    await expect(registry.activate('com.example.test')).rejects.toThrow('fail');
    expect(registry.get('com.example.test')?.state).toBe('error');
    expect(registry.get('com.example.test')?.error).toBe('fail');
  });

  it('should unregister a plugin', async () => {
    registry.register(VALID_MANIFEST);
    await registry.unregister('com.example.test');
    expect(registry.size).toBe(0);
  });

  it('should deactivate on unregister if active', async () => {
    const deactivate = vi.fn();
    registry.register(VALID_MANIFEST, { activate: vi.fn(), deactivate });
    await registry.activate('com.example.test');
    await registry.unregister('com.example.test');
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
  });

  it('should throw when activating unknown plugin', async () => {
    await expect(registry.activate('com.unknown.plugin')).rejects.toThrow(/Not found/);
  });

  it('should list all plugins', () => {
    registry.register(VALID_MANIFEST);
    registry.register({ ...VALID_MANIFEST, id: 'com.example.two', name: 'Two' });
    expect(registry.getAll()).toHaveLength(2);
  });
});
