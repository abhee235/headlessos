// EX6-A.4: SessionStore tests
// @see docs/phases/phase-ex6.md

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionStore } from '../../src/config/session-store.js';
import {
  createEmptySessionState,
  type SessionState,
} from 'headlessos-shared/schemas/session';

let tempDir: string;
let store: SessionStore;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'sessionstore-test-'));
  store = new SessionStore('session-store-test', tempDir);
  await store.construct({} as never);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('SessionStore', () => {
  it('returns null for missing session', async () => {
    expect(await store.getSession('does-not-exist')).toBeNull();
  });

  it('returns empty list when no sessions exist', async () => {
    expect(await store.listSessions()).toEqual([]);
  });

  it('round-trips a saved session', async () => {
    const state = createEmptySessionState('srv-1');
    await store.saveSession(state);

    const loaded = await store.getSession('srv-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.serverId).toBe('srv-1');
    expect(loaded?.lifecycle).toBe('active');
  });

  it('lists saved sessions sorted by lastActiveAt desc', async () => {
    const older: SessionState = {
      ...createEmptySessionState('srv-old'),
      lastActiveAt: '2026-04-10T00:00:00.000Z',
    };
    const newer: SessionState = {
      ...createEmptySessionState('srv-new'),
      lastActiveAt: '2026-04-18T00:00:00.000Z',
    };
    await store.saveSession(older);
    await store.saveSession(newer);

    const list = await store.listSessions();
    expect(list).toHaveLength(2);
    expect(list[0]!.serverId).toBe('srv-new');
    expect(list[1]!.serverId).toBe('srv-old');
  });

  it('summary reports windowCount and hasOverrides', async () => {
    const state: SessionState = {
      ...createEmptySessionState('srv-1'),
      preferenceOverrides: { accentColorIndex: 3 },
      windows: [
        {
          id: 'w1',
          appId: 'dashboard',
          title: 'Dashboard',
          icon: 'dashboard',
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          minimized: false,
          maximized: false,
          zIndex: 1,
        },
      ],
    };
    await store.saveSession(state);

    const list = await store.listSessions();
    expect(list[0]!.windowCount).toBe(1);
    expect(list[0]!.hasOverrides).toBe(true);
  });

  it('deletes a session', async () => {
    await store.saveSession(createEmptySessionState('srv-1'));
    expect(await store.getSession('srv-1')).not.toBeNull();

    await store.deleteSession('srv-1');
    expect(await store.getSession('srv-1')).toBeNull();
  });

  it('delete is a no-op for missing sessions', async () => {
    await expect(store.deleteSession('missing')).resolves.toBeUndefined();
  });

  it('handles corrupted JSON by deleting and returning null', async () => {
    const file = join(tempDir, 'sessions', 'srv-bad.json');
    await writeFile(file, '{not json', 'utf-8');

    const loaded = await store.getSession('srv-bad');
    expect(loaded).toBeNull();
    // File should be deleted
    const entries = await readdir(join(tempDir, 'sessions'));
    expect(entries).not.toContain('srv-bad.json');
  });

  it('handles schema-invalid JSON by deleting and returning null', async () => {
    const file = join(tempDir, 'sessions', 'srv-bad.json');
    await writeFile(file, JSON.stringify({ schemaVersion: 1, serverId: 'x' /* missing fields */ }));

    const loaded = await store.getSession('srv-bad');
    expect(loaded).toBeNull();
  });

  it('rejects path-traversal serverIds', async () => {
    await expect(store.getSession('../etc/passwd')).rejects.toThrow(/Invalid serverId/);
    await expect(store.deleteSession('../etc/passwd')).rejects.toThrow(/Invalid serverId/);
  });

  it('writes atomically (no .tmp left behind on success)', async () => {
    await store.saveSession(createEmptySessionState('srv-1'));
    const entries = await readdir(join(tempDir, 'sessions'));
    expect(entries.filter((e) => e.endsWith('.tmp'))).toEqual([]);
    expect(entries).toContain('srv-1.json');
  });

  it('markHibernated sets lifecycle and hibernatedAt', async () => {
    await store.saveSession(createEmptySessionState('srv-1'));
    await store.markHibernated('srv-1');

    const loaded = await store.getSession('srv-1');
    expect(loaded?.lifecycle).toBe('hibernated');
    expect(loaded?.hibernatedAt).toBeDefined();
  });

  it('markHibernated is idempotent', async () => {
    await store.saveSession(createEmptySessionState('srv-1'));
    await store.markHibernated('srv-1');
    const first = await store.getSession('srv-1');
    await store.markHibernated('srv-1');
    const second = await store.getSession('srv-1');
    expect(second?.hibernatedAt).toBe(first?.hibernatedAt);
  });

  it('markHibernated is a no-op for missing sessions', async () => {
    await expect(store.markHibernated('missing')).resolves.toBeUndefined();
  });

  // POSIX-only: Node ignores the `mode` option on Windows (NTFS uses ACLs, not
  // POSIX permission bits), so the file reports 0o666 there. The 0o600 write mode
  // in session-store.ts still runs; it just has no effect on Windows.
  it.skipIf(process.platform === 'win32')('saved file has 0o600 permissions', async () => {
    await store.saveSession(createEmptySessionState('srv-1'));
    const { stat } = await import('fs/promises');
    const s = await stat(join(tempDir, 'sessions', 'srv-1.json'));
    // Owner read+write only (last 9 bits = rw-------)
    expect(s.mode & 0o777).toBe(0o600);
  });

  it('saved JSON validates against schema on subsequent read', async () => {
    const state = createEmptySessionState('srv-1');
    await store.saveSession(state);
    const raw = await readFile(join(tempDir, 'sessions', 'srv-1.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.serverId).toBe('srv-1');
  });
});
