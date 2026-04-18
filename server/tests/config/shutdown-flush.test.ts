// EX6-A.10: Graceful shutdown — hibernate active sessions
// @see docs/phases/phase-ex6.md

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionStore } from '../../src/config/session-store.js';
import { ConnectionManager } from '../../src/ssh/connection-manager.js';
import { createEmptySessionState } from 'headlessos-shared/schemas/session';

describe('EX6-A.10: graceful shutdown hibernation', () => {
  let dir: string;
  let store: SessionStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'headlessos-shutdown-'));
    store = new SessionStore('s', dir);
    await store.construct({} as never);
  });

  afterEach(async () => {
    await store.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it('ConnectionManager.getConnectedServerIds returns [] when no connections', () => {
    const cm = new ConnectionManager('cm');
    expect(cm.getConnectedServerIds()).toEqual([]);
  });

  it('markHibernated flips lifecycle and stamps hibernatedAt', async () => {
    const initial = createEmptySessionState('srv-1');
    expect(initial.lifecycle).toBe('active');
    await store.saveSession(initial);

    await store.markHibernated('srv-1');

    const after = await store.getSession('srv-1');
    expect(after?.lifecycle).toBe('hibernated');
    expect(after?.hibernatedAt).toBeTruthy();
  });

  it('markHibernated is idempotent (no-op when already hibernated)', async () => {
    const initial = createEmptySessionState('srv-1');
    await store.saveSession(initial);
    await store.markHibernated('srv-1');
    const first = await store.getSession('srv-1');
    const firstStamp = first!.hibernatedAt;

    await new Promise((r) => setTimeout(r, 5));
    await store.markHibernated('srv-1');
    const second = await store.getSession('srv-1');
    expect(second?.hibernatedAt).toBe(firstStamp); // unchanged
  });

  it('markHibernated is a no-op for unknown serverId', async () => {
    await store.markHibernated('unknown');
    const list = await store.listSessions();
    expect(list).toHaveLength(0);
  });

  it('shutdown flow: markHibernated for multiple sessions in parallel', async () => {
    await store.saveSession(createEmptySessionState('srv-1'));
    await store.saveSession(createEmptySessionState('srv-2'));
    await store.saveSession(createEmptySessionState('srv-3'));

    const ids = ['srv-1', 'srv-2', 'srv-3'];
    const results = await Promise.allSettled(
      ids.map((id) => store.markHibernated(id)),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const list = await store.listSessions();
    expect(list.every((s) => s.lifecycle === 'hibernated')).toBe(true);
  });
});
