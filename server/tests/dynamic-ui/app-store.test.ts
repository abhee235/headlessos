// EX5-C.1: AppStore — user app persistence tests
// Tests CRUD operations, disk I/O, validation, TemplateRegistry integration
// @see docs/phases/phase-ex5.md

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppStore, SavedAppSchema, CreateAppSchema, UpdateAppSchema, type CreateAppInput } from '../../src/dynamic-ui/app-store.js';
import { TemplateRegistry } from '../../src/dynamic-ui/template-registry.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

// ── Helpers ────────────────────────────────────────────────────────

function makeDummyView(title = 'Test View'): DynamicView {
  return {
    title,
    sidebarItems: [{ id: 'main', label: 'Main' }],
    sections: {
      main: {
        layout: 'stack',
        children: [
          {
            type: 'stat-card',
            title: 'Test Stat',
            value: '42',
          },
        ],
      },
    },
  } as DynamicView;
}

function makeCreateInput(overrides?: Partial<CreateAppInput>): CreateAppInput {
  return {
    name: 'Test App',
    icon: 'terminal',
    cliTool: 'mytool',
    description: 'A test app',
    tags: ['test', 'cli'],
    view: makeDummyView(),
    commandPatterns: ['^mytool'],
    ...overrides,
  };
}

let tempDir: string;
let store: AppStore;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'appstore-test-'));
  store = new AppStore({ appsDir: tempDir });
  await store.init();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ── CRUD ───────────────────────────────────────────────────────────

describe('AppStore CRUD', () => {
  it('creates an app and assigns UUID + timestamps', async () => {
    const app = await store.create(makeCreateInput());
    expect(app.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(app.name).toBe('Test App');
    expect(app.icon).toBe('terminal');
    expect(app.cliTool).toBe('mytool');
    expect(app.description).toBe('A test app');
    expect(app.tags).toEqual(['test', 'cli']);
    expect(app.commandPatterns).toEqual(['^mytool']);
    expect(app.createdAt).toBeTruthy();
    expect(app.updatedAt).toBeTruthy();
    expect(app.view.title).toBe('Test View');
  });

  it('lists all created apps', async () => {
    await store.create(makeCreateInput({ name: 'App 1' }));
    await store.create(makeCreateInput({ name: 'App 2' }));
    await store.create(makeCreateInput({ name: 'App 3' }));
    const all = store.listAll();
    expect(all).toHaveLength(3);
    expect(all.map(a => a.name).sort()).toEqual(['App 1', 'App 2', 'App 3']);
  });

  it('gets a single app by ID', async () => {
    const created = await store.create(makeCreateInput());
    const fetched = store.getById(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe('Test App');
  });

  it('returns undefined for non-existent ID', () => {
    expect(store.getById('non-existent-uuid')).toBeUndefined();
  });

  it('updates app name and tags', async () => {
    const created = await store.create(makeCreateInput());
    const updated = await store.update(created.id, {
      name: 'Renamed App',
      tags: ['renamed'],
    });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Renamed App');
    expect(updated!.tags).toEqual(['renamed']);
    // Unchanged fields preserved
    expect(updated!.icon).toBe('terminal');
    expect(updated!.cliTool).toBe('mytool');
    // updatedAt changed
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );
  });

  it('returns null when updating non-existent app', async () => {
    const result = await store.update('non-existent', { name: 'X' });
    expect(result).toBeNull();
  });

  it('deletes an app', async () => {
    const app = await store.create(makeCreateInput());
    expect(store.size).toBe(1);
    const removed = await store.remove(app.id);
    expect(removed).toBe(true);
    expect(store.size).toBe(0);
    expect(store.getById(app.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent app', async () => {
    expect(await store.remove('non-existent')).toBe(false);
  });

  it('reports correct size', async () => {
    expect(store.size).toBe(0);
    await store.create(makeCreateInput({ name: 'A' }));
    expect(store.size).toBe(1);
    await store.create(makeCreateInput({ name: 'B' }));
    expect(store.size).toBe(2);
  });
});

// ── Disk Persistence ───────────────────────────────────────────────

describe('AppStore disk persistence', () => {
  it('writes JSON files to disk on create', async () => {
    const app = await store.create(makeCreateInput());
    const files = await readdir(tempDir);
    expect(files).toContain(`${app.id}.json`);
  });

  it('persisted file is valid JSON matching SavedAppSchema', async () => {
    const app = await store.create(makeCreateInput());
    const raw = await readFile(join(tempDir, `${app.id}.json`), 'utf-8');
    const data = JSON.parse(raw);
    const parsed = SavedAppSchema.safeParse(data);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.name).toBe('Test App');
  });

  it('removes JSON file on delete', async () => {
    const app = await store.create(makeCreateInput());
    await store.remove(app.id);
    const files = await readdir(tempDir);
    expect(files).not.toContain(`${app.id}.json`);
  });

  it('updates JSON file on update', async () => {
    const app = await store.create(makeCreateInput());
    await store.update(app.id, { name: 'Updated' });
    const raw = await readFile(join(tempDir, `${app.id}.json`), 'utf-8');
    const data = JSON.parse(raw);
    expect(data.name).toBe('Updated');
  });

  it('reloads apps from disk on new store init', async () => {
    const app = await store.create(makeCreateInput({ name: 'Persistent App' }));

    // Create a new store instance pointing at the same directory
    const store2 = new AppStore({ appsDir: tempDir });
    await store2.init();
    expect(store2.size).toBe(1);
    const loaded = store2.getById(app.id);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Persistent App');
  });

  it('skips invalid JSON files during load', async () => {
    // Create a valid app
    await store.create(makeCreateInput());
    // Write a corrupt file
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(join(tempDir, 'corrupt.json'), 'not json!', 'utf-8');

    // A new store should load only the valid app
    const store2 = new AppStore({ appsDir: tempDir });
    await store2.init();
    expect(store2.size).toBe(1);
  });
});

// ── Validation ─────────────────────────────────────────────────────

describe('AppStore validation', () => {
  it('rejects empty name', async () => {
    await expect(
      store.create(makeCreateInput({ name: '' })),
    ).rejects.toThrow();
  });

  it('rejects empty icon', async () => {
    await expect(
      store.create(makeCreateInput({ icon: '' })),
    ).rejects.toThrow();
  });

  it('rejects empty cliTool', async () => {
    await expect(
      store.create(makeCreateInput({ cliTool: '' })),
    ).rejects.toThrow();
  });

  it('accepts minimal valid input', async () => {
    const app = await store.create({
      name: 'Min',
      icon: 'x',
      cliTool: 'y',
      view: makeDummyView(),
    });
    expect(app.tags).toEqual([]);
    expect(app.commandPatterns).toEqual([]);
    expect(app.description).toBe('');
  });
});

// ── TemplateRegistry Integration ───────────────────────────────────

describe('AppStore TemplateRegistry integration', () => {
  it('registers created app as a template', async () => {
    const registry = new TemplateRegistry();
    store.setTemplateRegistry(registry);

    const app = await store.create(makeCreateInput({ name: 'Restic Manager' }));
    const template = registry.getById(`user-app-${app.id}`);
    expect(template).toBeDefined();
    expect(template!.name).toBe('Restic Manager');
    expect(template!.tags).toContain('user-app');
    expect(template!.tags).toContain('mytool');
  });

  it('updates template on app update', async () => {
    const registry = new TemplateRegistry();
    store.setTemplateRegistry(registry);

    const app = await store.create(makeCreateInput());
    await store.update(app.id, { name: 'Renamed' });
    const template = registry.getById(`user-app-${app.id}`);
    expect(template!.name).toBe('Renamed');
  });

  it('matches command patterns through registry', async () => {
    const registry = new TemplateRegistry();
    store.setTemplateRegistry(registry);

    await store.create(makeCreateInput({
      commandPatterns: ['^restic\\b', 'restic snapshots'],
    }));

    const matches = registry.matchCommand('restic snapshots');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('registers apps loaded from disk into registry', async () => {
    // Create an app first
    const app = await store.create(makeCreateInput({ name: 'Disk App' }));

    // New store with a fresh registry
    const registry = new TemplateRegistry();
    const store2 = new AppStore({ appsDir: tempDir });
    store2.setTemplateRegistry(registry);
    await store2.init();

    const template = registry.getById(`user-app-${app.id}`);
    expect(template).toBeDefined();
    expect(template!.name).toBe('Disk App');
  });

  it('works without registry (no errors)', async () => {
    // No setTemplateRegistry called — should not throw
    const app = await store.create(makeCreateInput());
    expect(app).toBeDefined();
  });
});

// ── Schema Tests ───────────────────────────────────────────────────

describe('AppStore schemas', () => {
  it('CreateAppSchema validates correctly', () => {
    const result = CreateAppSchema.safeParse(makeCreateInput());
    expect(result.success).toBe(true);
  });

  it('UpdateAppSchema accepts partial fields', () => {
    const result = UpdateAppSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('UpdateAppSchema accepts empty object', () => {
    const result = UpdateAppSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('SavedAppSchema validates a full saved app', async () => {
    const app = await store.create(makeCreateInput());
    const result = SavedAppSchema.safeParse(app);
    expect(result.success).toBe(true);
  });
});
