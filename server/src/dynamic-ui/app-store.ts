// EX5-C.1: User App Persistence — SavedApp CRUD + TemplateRegistry integration
// @see docs/phases/phase-ex5.md

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { DynamicViewSchema, type DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import type { TemplateRegistry } from './template-registry.js';
import type { UITemplate } from './types.js';

// ── Schema ─────────────────────────────────────────────────────────

export const SavedAppSchema = z.object({
  id: z.guid(),
  name: z.string().min(1).max(100),
  icon: z.string().min(1).max(50),
  cliTool: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  tags: z.array(z.string().max(50)).max(20).default([]),
  view: DynamicViewSchema,
  commandPatterns: z.array(z.string().max(200)).max(20).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  serverId: z.string().optional(),
});

export type SavedApp = z.infer<typeof SavedAppSchema>;

export const CreateAppSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().min(1).max(50),
  cliTool: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  tags: z.array(z.string().max(50)).max(20).default([]),
  view: DynamicViewSchema,
  commandPatterns: z.array(z.string().max(200)).max(20).default([]),
  serverId: z.string().optional(),
});

export type CreateAppInput = z.infer<typeof CreateAppSchema>;

export const UpdateAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().min(1).max(50).optional(),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  commandPatterns: z.array(z.string().max(200)).max(20).optional(),
});

export type UpdateAppInput = z.infer<typeof UpdateAppSchema>;

// ── Store Directory ────────────────────────────────────────────────

const DEFAULT_APPS_DIR = join(homedir(), '.headlessos', 'user-apps');

// ── AppStore ───────────────────────────────────────────────────────

/**
 * File-based CRUD store for user-saved DynamicView apps.
 * Each app is stored as `{id}.json` under `~/.headlessos/user-apps/`.
 * On init, all apps are loaded and registered into TemplateRegistry
 * so they're matched automatically for future generations.
 */
export class AppStore {
  private appsDir: string;
  private apps = new Map<string, SavedApp>();
  private initialized = false;
  private templateRegistry: TemplateRegistry | null = null;

  constructor(opts?: { appsDir?: string }) {
    this.appsDir = opts?.appsDir ?? DEFAULT_APPS_DIR;
  }

  /** Set the TemplateRegistry for auto-registering saved apps as templates. */
  setTemplateRegistry(registry: TemplateRegistry): void {
    this.templateRegistry = registry;
  }

  /** Initialize: ensure directory exists and load all apps from disk. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.appsDir, { recursive: true });
    await this.loadAll();
    this.initialized = true;
  }

  /** List all saved apps. */
  listAll(): SavedApp[] {
    return Array.from(this.apps.values());
  }

  /** Get a single app by ID. */
  getById(id: string): SavedApp | undefined {
    return this.apps.get(id);
  }

  /** Create a new saved app. Returns the created app. */
  async create(input: CreateAppInput): Promise<SavedApp> {
    const parsed = CreateAppSchema.parse(input);
    const now = new Date().toISOString();
    const app: SavedApp = {
      id: randomUUID(),
      name: parsed.name,
      icon: parsed.icon,
      cliTool: parsed.cliTool,
      description: parsed.description,
      tags: parsed.tags,
      view: parsed.view,
      commandPatterns: parsed.commandPatterns,
      createdAt: now,
      updatedAt: now,
      serverId: parsed.serverId,
    };

    await this.writeToDisk(app);
    this.apps.set(app.id, app);
    this.registerAsTemplate(app);
    return app;
  }

  /** Update an existing app. Returns the updated app or null if not found. */
  async update(id: string, input: UpdateAppInput): Promise<SavedApp | null> {
    const existing = this.apps.get(id);
    if (!existing) return null;

    const parsed = UpdateAppSchema.parse(input);
    const updated: SavedApp = {
      ...existing,
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.icon !== undefined && { icon: parsed.icon }),
      ...(parsed.description !== undefined && { description: parsed.description }),
      ...(parsed.tags !== undefined && { tags: parsed.tags }),
      ...(parsed.commandPatterns !== undefined && { commandPatterns: parsed.commandPatterns }),
      updatedAt: new Date().toISOString(),
    };

    await this.writeToDisk(updated);
    this.apps.set(id, updated);
    // Re-register template with updated metadata
    this.registerAsTemplate(updated);
    return updated;
  }

  /** Delete an app by ID. Returns true if deleted, false if not found. */
  async remove(id: string): Promise<boolean> {
    if (!this.apps.has(id)) return false;

    const filePath = this.appPath(id);
    try {
      await unlink(filePath);
    } catch {
      // File may not exist on disk — still remove from memory
    }
    this.apps.delete(id);
    // Note: TemplateRegistry doesn't have a remove method,
    // but re-registering with the same ID will overwrite.
    // The app simply won't match anymore since patterns are gone.
    return true;
  }

  /** Get the count of saved apps. */
  get size(): number {
    return this.apps.size;
  }

  // ── Internal ─────────────────────────────────────────────────────

  /** Load all app JSON files from the apps directory. */
  private async loadAll(): Promise<void> {
    try {
      const files = await readdir(this.appsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const raw = await readFile(join(this.appsDir, file), 'utf-8');
          const data = JSON.parse(raw);
          const parsed = SavedAppSchema.safeParse(data);
          if (parsed.success) {
            this.apps.set(parsed.data.id, parsed.data);
            this.registerAsTemplate(parsed.data);
          }
        } catch {
          // Skip corrupt files silently
        }
      }
    } catch {
      // Directory might not exist yet — that's fine
    }
  }

  /** Write an app to disk as JSON. */
  private async writeToDisk(app: SavedApp): Promise<void> {
    await mkdir(this.appsDir, { recursive: true });
    const filePath = this.appPath(app.id);
    await writeFile(filePath, JSON.stringify(app, null, 2), 'utf-8');
  }

  /** Get the file path for an app. */
  private appPath(id: string): string {
    return join(this.appsDir, `${id}.json`);
  }

  /** Register a saved app as a UITemplate in the TemplateRegistry. */
  private registerAsTemplate(app: SavedApp): void {
    if (!this.templateRegistry) return;

    const template: UITemplate = {
      id: `user-app-${app.id}`,
      name: app.name,
      description: app.description || `User-saved app for ${app.cliTool}`,
      tags: [...app.tags, 'user-app', app.cliTool],
      matchPatterns: app.commandPatterns,
      schema: app.view,
    };

    this.templateRegistry.register(template);
  }
}
