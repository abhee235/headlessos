// M10.8: Plugin / Extension API — manifest schema, lifecycle hooks, registry
// @see docs/PROGRESS.md

import { z } from 'zod';

// ── Plugin Manifest Schema ───────────────────────────────

export const PluginPermissionSchema = z.enum([
  'fs:read',
  'fs:write',
  'process:list',
  'process:kill',
  'docker:read',
  'docker:manage',
  'service:read',
  'service:manage',
  'terminal:access',
  'network:read',
  'network:manage',
  'system:read',
  'system:manage',
  'llm:invoke',
  'notification:send',
  'ui:panel',
  'ui:toolbar',
  'ui:sidebar',
]);

export type PluginPermission = z.infer<typeof PluginPermissionSchema>;

export const PluginManifestSchema = z.object({
  /** Unique plugin identifier (reverse-dns style) */
  id: z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/, 'ID must be reverse-dns style: com.example.plugin'),
  /** Human-readable name */
  name: z.string().min(1).max(64),
  /** Semantic version */
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'Must be semver: 1.0.0'),
  /** Short description */
  description: z.string().max(256).optional(),
  /** Author name or org */
  author: z.string().max(128).optional(),
  /** License identifier */
  license: z.string().max(32).optional(),
  /** Minimum HeadlessOS version required */
  minAppVersion: z.string().optional(),
  /** Lucide icon name */
  icon: z.string().optional(),
  /** Permissions the plugin requests */
  permissions: z.array(PluginPermissionSchema).default([]),
  /** Entry point — the main module path */
  main: z.string().optional(),
  /** UI contributions */
  contributes: z.object({
    /** Apps to register in the app launcher */
    apps: z.array(z.object({
      id: z.string(),
      name: z.string(),
      icon: z.string().optional(),
      description: z.string().optional(),
      singleInstance: z.boolean().default(true),
    })).optional(),
    /** Toolbar buttons to add */
    toolbarItems: z.array(z.object({
      id: z.string(),
      label: z.string(),
      icon: z.string().optional(),
      placement: z.enum(['file-explorer', 'taskbar', 'window-titlebar']).default('taskbar'),
    })).optional(),
    /** Settings pages to contribute */
    settings: z.array(z.object({
      id: z.string(),
      label: z.string(),
      icon: z.string().optional(),
    })).optional(),
  }).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// ── Plugin Lifecycle ─────────────────────────────────────

export interface PluginContext {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Send a notification */
  notify: (title: string, message?: string) => void;
  /** Log a message */
  log: (message: string) => void;
  /** Register a disposable to be cleaned up on deactivate */
  onDispose: (fn: () => void) => void;
}

export interface PluginModule {
  /** Called when plugin is activated */
  activate?: (ctx: PluginContext) => void | Promise<void>;
  /** Called when plugin is deactivated */
  deactivate?: () => void | Promise<void>;
}

export type PluginState = 'installed' | 'active' | 'inactive' | 'error';

export interface PluginEntry {
  manifest: PluginManifest;
  state: PluginState;
  module?: PluginModule;
  error?: string;
  activatedAt?: number;
}

// ── Plugin Registry ──────────────────────────────────────

class PluginRegistry {
  private plugins = new Map<string, PluginEntry>();
  private disposables = new Map<string, Array<() => void>>();

  /**
   * Register a plugin from its manifest.
   */
  register(manifest: PluginManifest): void {
    // Validate manifest
    const parsed = PluginManifestSchema.parse(manifest);

    if (this.plugins.has(parsed.id)) {
      throw new Error(`Plugin "${parsed.id}" is already registered`);
    }

    this.plugins.set(parsed.id, {
      manifest: parsed,
      state: 'installed',
    });
  }

  /**
   * Activate a plugin.
   */
  async activate(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) throw new Error(`Plugin "${pluginId}" not found`);
    if (entry.state === 'active') return;

    const disposeFns: Array<() => void> = [];
    this.disposables.set(pluginId, disposeFns);

    const ctx: PluginContext = {
      manifest: entry.manifest,
      notify: (title, message) => {
        console.log(`[Plugin:${pluginId}] ${title}${message ? ': ' + message : ''}`);
      },
      log: (message) => {
        console.log(`[Plugin:${pluginId}] ${message}`);
      },
      onDispose: (fn) => disposeFns.push(fn),
    };

    try {
      if (entry.module?.activate) {
        await entry.module.activate(ctx);
      }
      entry.state = 'active';
      entry.activatedAt = Date.now();
      entry.error = undefined;
    } catch (err) {
      entry.state = 'error';
      entry.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Deactivate a plugin.
   */
  async deactivate(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) throw new Error(`Plugin "${pluginId}" not found`);
    if (entry.state !== 'active') return;

    try {
      if (entry.module?.deactivate) {
        await entry.module.deactivate();
      }
    } finally {
      // Run all registered disposables
      const disposeFns = this.disposables.get(pluginId) ?? [];
      for (const fn of disposeFns) {
        try { fn(); } catch { /* ignore */ }
      }
      this.disposables.delete(pluginId);
      entry.state = 'inactive';
    }
  }

  /**
   * Unregister a plugin (deactivates first if needed).
   */
  async unregister(pluginId: string): Promise<void> {
    if (this.plugins.get(pluginId)?.state === 'active') {
      await this.deactivate(pluginId);
    }
    this.plugins.delete(pluginId);
  }

  /**
   * Get plugin entry by ID.
   */
  get(pluginId: string): PluginEntry | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all registered plugins.
   */
  getAll(): PluginEntry[] {
    return [...this.plugins.values()];
  }

  /**
   * Get plugin count.
   */
  get size(): number {
    return this.plugins.size;
  }
}

// ── Singleton Instance ───────────────────────────────────

export const pluginRegistry = new PluginRegistry();
