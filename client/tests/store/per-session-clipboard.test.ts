// EX6-A.9: Per-session clipboard + dynamic-ui isolation tests
// @see docs/phases/phase-ex6.md

import { describe, it, expect, beforeEach, vi } from 'vitest';

const storage: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
  writable: true,
});

vi.mock('../../src/lib/api', () => ({
  fetchSessions: vi.fn(async () => []),
  fetchSession: vi.fn(async () => null),
  saveSession: vi.fn(async () => {}),
  saveSessionBeacon: vi.fn(() => true),
  deleteSession: vi.fn(async () => {}),
  hibernateSession: vi.fn(async () => {}),
}));

import { useSessionsStore, _resetSessionLifecycleHooksForTests } from '../../src/store/sessions-store';
import { useClipboardStore } from '../../src/store/clipboard-store';
import { useDynamicUIStore } from '../../src/store/dynamic-ui-store';
import {
  initWindowSessionSync,
  _resetWindowSessionSyncForTests,
} from '../../src/store/window-session-sync';

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  _resetSessionLifecycleHooksForTests();
  _resetWindowSessionSyncForTests();
  useSessionsStore.setState({ sessions: {}, summaries: [], activeServerId: null });
  useDynamicUIStore.setState({ pinnedViews: {}, windowToView: {} });
});

// ── Clipboard per-session ─────────────────────────────

describe('per-session clipboard', () => {
  it('starts empty', () => {
    expect(useClipboardStore.getState().entries).toEqual([]);
    expect(useClipboardStore.getState().operation).toBeNull();
  });

  it('copy persists into the active session', async () => {
    await useSessionsStore.getState().activate('srv-1');
    useClipboardStore.getState().copy(
      [{ serverId: 'srv-1', path: '/etc/hosts', name: 'hosts', isDirectory: false }],
      '/etc',
    );
    const session = useSessionsStore.getState().sessions['srv-1']!;
    expect(session.clipboard.entries).toHaveLength(1);
    expect(session.clipboard.operation).toBe('copy');
  });

  it('switching server swaps clipboard contents', async () => {
    await useSessionsStore.getState().activate('srv-1');
    useClipboardStore.getState().copy(
      [{ serverId: 'srv-1', path: '/a', name: 'a', isDirectory: false }],
      '/',
    );
    expect(useClipboardStore.getState().entries).toHaveLength(1);

    await useSessionsStore.getState().activate('srv-2');
    expect(useClipboardStore.getState().entries).toHaveLength(0);
    expect(useClipboardStore.getState().operation).toBeNull();

    // Set clipboard on srv-2
    useClipboardStore.getState().cut(
      [{ serverId: 'srv-2', path: '/b', name: 'b', isDirectory: false }],
      '/',
    );
    expect(useClipboardStore.getState().operation).toBe('cut');

    // Back to srv-1 — original clipboard restored
    useSessionsStore.setState({ activeServerId: 'srv-1' });
    expect(useClipboardStore.getState().entries[0]!.path).toBe('/a');
    expect(useClipboardStore.getState().operation).toBe('copy');
  });

  it('clear() empties only the active session clipboard', async () => {
    await useSessionsStore.getState().activate('srv-1');
    useClipboardStore.getState().copy(
      [{ serverId: 'srv-1', path: '/a', name: 'a', isDirectory: false }],
      '/',
    );
    await useSessionsStore.getState().activate('srv-2');
    useClipboardStore.getState().copy(
      [{ serverId: 'srv-2', path: '/b', name: 'b', isDirectory: false }],
      '/',
    );

    useClipboardStore.getState().clear();
    expect(useSessionsStore.getState().sessions['srv-2']!.clipboard.entries).toHaveLength(0);
    // srv-1's clipboard untouched
    expect(useSessionsStore.getState().sessions['srv-1']!.clipboard.entries).toHaveLength(1);
  });

  it('copy/cut are no-ops when no active server', () => {
    useClipboardStore.getState().copy(
      [{ serverId: 'srv-x', path: '/a', name: 'a', isDirectory: false }],
      '/',
    );
    // local store updates but no session is touched
    expect(useSessionsStore.getState().sessions).toEqual({});
  });
});

// ── Dynamic-UI per-server cleanup ─────────────────────

describe('dynamic-ui unpinAllForServer', () => {
  it('removes only views for the given server', () => {
    const ds = useDynamicUIStore.getState();
    const view = {
      title: 'X', icon: 'Sparkles', sections: {}, sidebarItems: [],
    };
    ds.pinView('srv-1', view);
    ds.pinView('srv-1', view);
    ds.pinView('srv-2', view);

    ds.unpinAllForServer('srv-1');
    const remaining = Object.values(useDynamicUIStore.getState().pinnedViews);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.serverId).toBe('srv-2');
  });

  it('also removes window→view links for removed views', () => {
    const ds = useDynamicUIStore.getState();
    const view = { title: 'X', icon: 'Sparkles', sections: {}, sidebarItems: [] };
    const id1 = ds.pinView('srv-1', view);
    const id2 = ds.pinView('srv-2', view);
    ds.linkWindow('win-a', id1);
    ds.linkWindow('win-b', id2);

    ds.unpinAllForServer('srv-1');
    const links = useDynamicUIStore.getState().windowToView;
    expect(links['win-a']).toBeUndefined();
    expect(links['win-b']).toBe(id2);
  });
});

// ── Lifecycle integration ─────────────────────────────

describe('hibernate clears dynamic-ui pinned views for that server', () => {
  it('drops all srv-1 views on hibernate', async () => {
    initWindowSessionSync();
    await useSessionsStore.getState().activate('srv-1');
    const ds = useDynamicUIStore.getState();
    ds.pinView('srv-1', { title: 'A', icon: 'Sparkles', sections: {}, sidebarItems: [] });
    ds.pinView('srv-2', { title: 'B', icon: 'Sparkles', sections: {}, sidebarItems: [] });

    await useSessionsStore.getState().hibernate('srv-1');

    const remaining = Object.values(useDynamicUIStore.getState().pinnedViews);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.serverId).toBe('srv-2');
  });
});
