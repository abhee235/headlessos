// EX6-A.7: Window ↔ Session Sync tests
// @see docs/phases/phase-ex6.md

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEmptySessionState } from 'headlessos-shared/schemas/session';

// ── localStorage mock ─────────────────────────────────
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
  clear: vi.fn(() => { Object.keys(storage).forEach((k) => delete storage[k]); }),
  get length() { return Object.keys(storage).length; },
  key: vi.fn((_i: number) => null),
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

// jsdom provides window — give it stable inner sizes for window-store math
Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });

// ── api mock ──────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  fetchSessions: vi.fn(async () => []),
  fetchSession: vi.fn(async () => null),
  saveSession: vi.fn(async () => {}),
  saveSessionBeacon: vi.fn(() => true),
  deleteSession: vi.fn(async () => {}),
  hibernateSession: vi.fn(async () => {}),
}));

import { useDesktopStore } from '../../src/store/window-store';
import {
  useSessionsStore,
  _resetSessionLifecycleHooksForTests,
} from '../../src/store/sessions-store';
import {
  initWindowSessionSync,
  flushOutboundSync,
  restoreWindowsFromSession,
  removeWindowsForServer,
  _resetWindowSessionSyncForTests,
} from '../../src/store/window-session-sync';

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  vi.clearAllMocks();
  _resetWindowSessionSyncForTests();
  _resetSessionLifecycleHooksForTests();
  useSessionsStore.setState({ sessions: {}, summaries: [], activeServerId: null });
  useDesktopStore.setState({
    windows: [],
    nextZIndex: 100,
    startMenuOpen: false,
    snapPreview: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Outbound sync (windows → session) ─────────────────

describe('window-session-sync — outbound', () => {
  it('flushOutboundSync writes windows for active session', async () => {
    await useSessionsStore.getState().activate('srv-1');
    initWindowSessionSync();

    useDesktopStore.getState().openWindow('dashboard', 'srv-1', 'Dashboard', 'Activity');
    flushOutboundSync();

    const session = useSessionsStore.getState().sessions['srv-1']!;
    expect(session.windows).toHaveLength(1);
    expect(session.windows[0]!.appId).toBe('dashboard');
    expect(session.focusedWindowId).toBe(session.windows[0]!.id);
  });

  it('only writes windows for sessions present in the store', async () => {
    await useSessionsStore.getState().activate('srv-1');
    initWindowSessionSync();

    // Open a window for a server NOT in sessions store
    useDesktopStore.getState().openWindow('dashboard', 'unknown-srv', 'X', 'X');
    flushOutboundSync();

    expect(useSessionsStore.getState().sessions['srv-1']!.windows).toHaveLength(0);
    expect(useSessionsStore.getState().sessions['unknown-srv']).toBeUndefined();
  });

  it('groups windows correctly when multiple sessions are active', async () => {
    await useSessionsStore.getState().activate('srv-1');
    await useSessionsStore.getState().activate('srv-2');
    initWindowSessionSync();

    useDesktopStore.getState().openWindow('dashboard', 'srv-1', 'A', 'X');
    useDesktopStore.getState().openWindow('files', 'srv-2', 'B', 'X');
    useDesktopStore.getState().openWindow('terminal', 'srv-1', 'C', 'X');
    flushOutboundSync();

    expect(useSessionsStore.getState().sessions['srv-1']!.windows).toHaveLength(2);
    expect(useSessionsStore.getState().sessions['srv-2']!.windows).toHaveLength(1);
  });

  it('debounces multiple rapid changes into a single flush (250ms)', async () => {
    vi.useFakeTimers();
    await useSessionsStore.getState().activate('srv-1');
    initWindowSessionSync();

    useDesktopStore.getState().openWindow('dashboard', 'srv-1', 'A', 'X');
    useDesktopStore.getState().openWindow('files', 'srv-1', 'B', 'X');
    useDesktopStore.getState().openWindow('terminal', 'srv-1', 'C', 'X');

    // Before debounce fires, session has empty windows
    expect(useSessionsStore.getState().sessions['srv-1']!.windows).toHaveLength(0);

    vi.advanceTimersByTime(300);
    expect(useSessionsStore.getState().sessions['srv-1']!.windows).toHaveLength(3);
  });

  it('drops ephemeral fields (focused, preSnap, serverId) from persisted', async () => {
    await useSessionsStore.getState().activate('srv-1');
    initWindowSessionSync();

    useDesktopStore.getState().openWindow('dashboard', 'srv-1', 'A', 'X');
    flushOutboundSync();

    const persisted = useSessionsStore.getState().sessions['srv-1']!.windows[0]!;
    expect((persisted as Record<string, unknown>).focused).toBeUndefined();
    expect((persisted as Record<string, unknown>).serverId).toBeUndefined();
    expect((persisted as Record<string, unknown>).preSnap).toBeUndefined();
  });
});

// ── Inbound sync (session → windows) ──────────────────

describe('window-session-sync — restoreWindowsFromSession', () => {
  it('merges persisted windows into useDesktopStore', () => {
    useSessionsStore.getState().setSession({
      ...createEmptySessionState('srv-1'),
      windows: [
        {
          id: 'win-42',
          appId: 'dashboard',
          title: 'Dashboard',
          icon: 'Activity',
          x: 100,
          y: 50,
          width: 800,
          height: 600,
          minimized: false,
          maximized: false,
          zIndex: 5,
        },
      ],
      nextZIndex: 6,
    });
    restoreWindowsFromSession('srv-1');

    const wins = useDesktopStore.getState().windows;
    expect(wins).toHaveLength(1);
    expect(wins[0]!.id).toBe('win-42');
    expect(wins[0]!.serverId).toBe('srv-1');
    expect(wins[0]!.appId).toBe('dashboard');
  });

  it('preserves windows belonging to OTHER servers', () => {
    // Pre-existing window for srv-other
    useDesktopStore.setState({
      windows: [
        {
          id: 'win-9',
          appId: 'terminal',
          serverId: 'srv-other',
          title: 'Terminal',
          icon: 'Terminal',
          x: 0, y: 0, width: 600, height: 400,
          minimized: false, maximized: false, focused: true, zIndex: 1,
        },
      ],
      nextZIndex: 100,
      startMenuOpen: false,
      snapPreview: null,
    });

    useSessionsStore.getState().setSession({
      ...createEmptySessionState('srv-1'),
      windows: [
        {
          id: 'win-1',
          appId: 'dashboard',
          title: 'Dashboard',
          icon: 'Activity',
          x: 0, y: 0, width: 800, height: 600,
          minimized: false, maximized: false, zIndex: 2,
        },
      ],
    });
    restoreWindowsFromSession('srv-1');

    const wins = useDesktopStore.getState().windows;
    expect(wins).toHaveLength(2);
    expect(wins.find((w) => w.serverId === 'srv-other')).toBeDefined();
    expect(wins.find((w) => w.serverId === 'srv-1')).toBeDefined();
  });

  it('replaces stale windows for the same server (no duplication)', () => {
    useDesktopStore.setState({
      windows: [
        {
          id: 'win-old',
          appId: 'dashboard', serverId: 'srv-1', title: 'old', icon: 'X',
          x: 0, y: 0, width: 800, height: 600,
          minimized: false, maximized: false, focused: true, zIndex: 1,
        },
      ],
      nextZIndex: 100, startMenuOpen: false, snapPreview: null,
    });
    useSessionsStore.getState().setSession({
      ...createEmptySessionState('srv-1'),
      windows: [
        {
          id: 'win-new',
          appId: 'files', title: 'new', icon: 'X',
          x: 0, y: 0, width: 800, height: 600,
          minimized: false, maximized: false, zIndex: 2,
        },
      ],
    });
    restoreWindowsFromSession('srv-1');

    const wins = useDesktopStore.getState().windows;
    expect(wins).toHaveLength(1);
    expect(wins[0]!.id).toBe('win-new');
  });

  it('bumps internal counter past restored IDs to prevent collisions', () => {
    useSessionsStore.getState().setSession({
      ...createEmptySessionState('srv-1'),
      windows: [
        {
          id: 'win-99',
          appId: 'dashboard', title: 'X', icon: 'X',
          x: 0, y: 0, width: 800, height: 600,
          minimized: false, maximized: false, zIndex: 1,
        },
      ],
    });
    restoreWindowsFromSession('srv-1');

    // Open a brand-new window — its ID should be win-100 or higher
    useDesktopStore.getState().openWindow('terminal', 'srv-2', 'T', 'X');
    const newWin = useDesktopStore.getState().windows.find((w) => w.appId === 'terminal')!;
    const m = /^win-(\d+)$/.exec(newWin.id);
    expect(m).not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBeGreaterThan(99);
  });

  it('focuses session.focusedWindowId if set', () => {
    useSessionsStore.getState().setSession({
      ...createEmptySessionState('srv-1'),
      windows: [
        { id: 'win-a', appId: 'dashboard', title: 'A', icon: 'X', x: 0, y: 0, width: 800, height: 600, minimized: false, maximized: false, zIndex: 1 },
        { id: 'win-b', appId: 'files',     title: 'B', icon: 'X', x: 0, y: 0, width: 800, height: 600, minimized: false, maximized: false, zIndex: 2 },
      ],
      focusedWindowId: 'win-b',
    });
    restoreWindowsFromSession('srv-1');

    const focused = useDesktopStore.getState().windows.find((w) => w.focused);
    expect(focused?.id).toBe('win-b');
  });

  it('is a no-op when session does not exist', () => {
    restoreWindowsFromSession('missing');
    expect(useDesktopStore.getState().windows).toEqual([]);
  });
});

// ── removeWindowsForServer ────────────────────────────

describe('window-session-sync — removeWindowsForServer', () => {
  it('removes only windows for the given server', () => {
    useDesktopStore.setState({
      windows: [
        { id: 'a', appId: 'x', serverId: 'srv-1', title: '', icon: '', x: 0, y: 0, width: 800, height: 600, minimized: false, maximized: false, focused: false, zIndex: 1 },
        { id: 'b', appId: 'x', serverId: 'srv-2', title: '', icon: '', x: 0, y: 0, width: 800, height: 600, minimized: false, maximized: false, focused: true, zIndex: 2 },
        { id: 'c', appId: 'x', serverId: 'srv-1', title: '', icon: '', x: 0, y: 0, width: 800, height: 600, minimized: false, maximized: false, focused: false, zIndex: 3 },
      ],
      nextZIndex: 100, startMenuOpen: false, snapPreview: null,
    });

    removeWindowsForServer('srv-1');
    const wins = useDesktopStore.getState().windows;
    expect(wins).toHaveLength(1);
    expect(wins[0]!.serverId).toBe('srv-2');
  });
});

// ── End-to-end lifecycle through useSessionsStore ─────

describe('window-session-sync — lifecycle integration', () => {
  it('activate() restores persisted windows', async () => {
    initWindowSessionSync();

    // Pre-populate cold tier (warm) with a session that has windows
    storage['headlessos-sessions'] = JSON.stringify({
      'srv-1': {
        ...createEmptySessionState('srv-1'),
        lifecycle: 'hibernated',
        windows: [
          {
            id: 'win-77', appId: 'dashboard', title: 'D', icon: 'X',
            x: 100, y: 50, width: 800, height: 600,
            minimized: false, maximized: false, zIndex: 5,
          },
        ],
      },
    });

    await useSessionsStore.getState().activate('srv-1');

    const wins = useDesktopStore.getState().windows;
    expect(wins).toHaveLength(1);
    expect(wins[0]!.id).toBe('win-77');
    expect(wins[0]!.serverId).toBe('srv-1');
  });

  it('hibernate() drops windows from desktop but keeps them persisted', async () => {
    initWindowSessionSync();
    await useSessionsStore.getState().activate('srv-1');
    useDesktopStore.getState().openWindow('dashboard', 'srv-1', 'D', 'X');

    await useSessionsStore.getState().hibernate('srv-1');

    expect(useDesktopStore.getState().windows.filter((w) => w.serverId === 'srv-1')).toHaveLength(0);
    // Cold tier should have been called with the windows
    const { saveSession } = await import('../../src/lib/api');
    expect(saveSession).toHaveBeenCalled();
    const lastCall = vi.mocked(saveSession).mock.calls.at(-1)![0];
    expect(lastCall.windows).toHaveLength(1);
    expect(lastCall.lifecycle).toBe('hibernated');
  });

  it('wake() restores hibernated windows back to the desktop', async () => {
    initWindowSessionSync();

    // Simulate prior hibernation in warm tier
    storage['headlessos-sessions'] = JSON.stringify({
      'srv-1': {
        ...createEmptySessionState('srv-1'),
        lifecycle: 'hibernated',
        windows: [
          { id: 'win-5', appId: 'files', title: 'F', icon: 'X', x: 0, y: 0, width: 800, height: 600, minimized: false, maximized: false, zIndex: 1 },
        ],
      },
    });

    const woken = await useSessionsStore.getState().wake('srv-1');
    expect(woken.lifecycle).toBe('active');
    // wake doesn't trigger lifecycle hooks directly — activate does
    await useSessionsStore.getState().activate('srv-1');

    const wins = useDesktopStore.getState().windows.filter((w) => w.serverId === 'srv-1');
    expect(wins).toHaveLength(1);
    expect(wins[0]!.id).toBe('win-5');
  });

  it('terminate() removes windows from desktop', async () => {
    initWindowSessionSync();
    await useSessionsStore.getState().activate('srv-1');
    useDesktopStore.getState().openWindow('dashboard', 'srv-1', 'D', 'X');
    expect(useDesktopStore.getState().windows.filter((w) => w.serverId === 'srv-1')).toHaveLength(1);

    await useSessionsStore.getState().terminate('srv-1');
    expect(useDesktopStore.getState().windows.filter((w) => w.serverId === 'srv-1')).toHaveLength(0);
  });

  it('cross-server isolation: switching active server does not lose windows of others', async () => {
    initWindowSessionSync();
    await useSessionsStore.getState().activate('srv-1');
    useDesktopStore.getState().openWindow('dashboard', 'srv-1', 'D1', 'X');
    flushOutboundSync();

    await useSessionsStore.getState().activate('srv-2');
    useDesktopStore.getState().openWindow('files', 'srv-2', 'F2', 'X');
    flushOutboundSync();

    // Switch back
    await useSessionsStore.getState().activate('srv-1');
    flushOutboundSync();

    // Both sessions retain their windows
    expect(useSessionsStore.getState().sessions['srv-1']!.windows).toHaveLength(1);
    expect(useSessionsStore.getState().sessions['srv-1']!.windows[0]!.appId).toBe('dashboard');
    expect(useSessionsStore.getState().sessions['srv-2']!.windows).toHaveLength(1);
    expect(useSessionsStore.getState().sessions['srv-2']!.windows[0]!.appId).toBe('files');
  });
});
