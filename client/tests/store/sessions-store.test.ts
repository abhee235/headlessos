// EX6-A.6: Sessions Store tests
// @see docs/phases/phase-ex6.md

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

// ── api mock ──────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  fetchSessions: vi.fn(async () => []),
  fetchSession: vi.fn(async (_id: string) => null),
  saveSession: vi.fn(async () => {}),
  saveSessionBeacon: vi.fn(() => true),
  deleteSession: vi.fn(async () => {}),
  hibernateSession: vi.fn(async () => {}),
}));

// Import AFTER mocks
import { useSessionsStore } from '../../src/store/sessions-store';
import * as api from '../../src/lib/api';

const STORAGE_KEY = 'headlessos-sessions';

beforeEach(() => {
  // Wipe storage + store state
  Object.keys(storage).forEach((k) => delete storage[k]);
  vi.clearAllMocks();
  useSessionsStore.setState({ sessions: {}, summaries: [], activeServerId: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSessionsStore — activate', () => {
  it('creates an empty session for a new server and marks it active', async () => {
    const state = await useSessionsStore.getState().activate('srv-1');
    expect(state.serverId).toBe('srv-1');
    expect(state.lifecycle).toBe('active');
    expect(useSessionsStore.getState().activeServerId).toBe('srv-1');
  });

  it('keeps existing in-memory session intact when re-activated', async () => {
    useSessionsStore.getState().setSession({
      ...createEmptySessionState('srv-1'),
      pinnedDynamicViewIds: ['view-a'],
    });
    const state = await useSessionsStore.getState().activate('srv-1');
    expect(state.pinnedDynamicViewIds).toEqual(['view-a']);
    expect(useSessionsStore.getState().activeServerId).toBe('srv-1');
  });

  it('switches activeServerId without losing other sessions', async () => {
    await useSessionsStore.getState().activate('srv-1');
    await useSessionsStore.getState().activate('srv-2');
    const s = useSessionsStore.getState();
    expect(s.activeServerId).toBe('srv-2');
    expect(Object.keys(s.sessions).sort()).toEqual(['srv-1', 'srv-2']);
  });
});

describe('useSessionsStore — background', () => {
  it('marks a session as background', async () => {
    await useSessionsStore.getState().activate('srv-1');
    useSessionsStore.getState().background('srv-1');
    expect(useSessionsStore.getState().sessions['srv-1']!.lifecycle).toBe('background');
  });

  it('is a no-op for unknown serverId', () => {
    useSessionsStore.getState().background('unknown');
    expect(useSessionsStore.getState().sessions).toEqual({});
  });
});

describe('useSessionsStore — hibernate', () => {
  it('flushes to cold storage, removes from memory, calls hibernate API', async () => {
    await useSessionsStore.getState().activate('srv-1');
    await useSessionsStore.getState().hibernate('srv-1');

    expect(api.saveSession).toHaveBeenCalled();
    expect(api.hibernateSession).toHaveBeenCalledWith('srv-1');
    expect(useSessionsStore.getState().sessions['srv-1']).toBeUndefined();
  });

  it('clears activeServerId if hibernating the active session', async () => {
    await useSessionsStore.getState().activate('srv-1');
    await useSessionsStore.getState().hibernate('srv-1');
    expect(useSessionsStore.getState().activeServerId).toBeNull();
  });

  it('preserves activeServerId if hibernating a different session', async () => {
    await useSessionsStore.getState().activate('srv-1');
    await useSessionsStore.getState().activate('srv-2');
    await useSessionsStore.getState().hibernate('srv-1');
    expect(useSessionsStore.getState().activeServerId).toBe('srv-2');
  });

  it('still calls hibernate API even if session not in memory', async () => {
    await useSessionsStore.getState().hibernate('srv-cold');
    expect(api.hibernateSession).toHaveBeenCalledWith('srv-cold');
  });
});

describe('useSessionsStore — hibernateAll', () => {
  it('hibernates every active session', async () => {
    await useSessionsStore.getState().activate('srv-1');
    await useSessionsStore.getState().activate('srv-2');
    await useSessionsStore.getState().hibernateAll();
    expect(useSessionsStore.getState().sessions).toEqual({});
    expect(api.hibernateSession).toHaveBeenCalledTimes(2);
  });
});

describe('useSessionsStore — wake', () => {
  it('loads from warm tier when present', async () => {
    storage[STORAGE_KEY] = JSON.stringify({
      'srv-1': {
        ...createEmptySessionState('srv-1'),
        lifecycle: 'hibernated',
        pinnedDynamicViewIds: ['from-warm'],
      },
    });
    const state = await useSessionsStore.getState().wake('srv-1');
    expect(state.lifecycle).toBe('active');
    expect(state.pinnedDynamicViewIds).toEqual(['from-warm']);
    expect(state.hibernatedAt).toBeUndefined();
    expect(api.fetchSession).not.toHaveBeenCalled();
  });

  it('falls back to cold tier (backend) when warm has nothing', async () => {
    vi.mocked(api.fetchSession).mockResolvedValueOnce({
      ...createEmptySessionState('srv-1'),
      lifecycle: 'hibernated',
      pinnedDynamicViewIds: ['from-cold'],
    });
    const state = await useSessionsStore.getState().wake('srv-1');
    expect(state.pinnedDynamicViewIds).toEqual(['from-cold']);
    expect(state.lifecycle).toBe('active');
  });

  it('creates an empty session if neither tier has data', async () => {
    const state = await useSessionsStore.getState().wake('srv-1');
    expect(state.serverId).toBe('srv-1');
    expect(state.lifecycle).toBe('active');
    expect(state.windows).toEqual([]);
  });
});

describe('useSessionsStore — terminate', () => {
  it('removes session from memory + summaries + cold tier', async () => {
    await useSessionsStore.getState().activate('srv-1');
    useSessionsStore.setState({
      summaries: [
        {
          serverId: 'srv-1',
          lifecycle: 'active',
          lastActiveAt: new Date().toISOString(),
          windowCount: 0,
          hasOverrides: false,
        },
      ],
    });
    await useSessionsStore.getState().terminate('srv-1');
    expect(api.deleteSession).toHaveBeenCalledWith('srv-1');
    expect(useSessionsStore.getState().sessions).toEqual({});
    expect(useSessionsStore.getState().summaries).toEqual([]);
    expect(useSessionsStore.getState().activeServerId).toBeNull();
  });
});

describe('useSessionsStore — updateSession & setSession', () => {
  it('updateSession patches and bumps lastActiveAt for active sessions', async () => {
    await useSessionsStore.getState().activate('srv-1');
    const before = useSessionsStore.getState().sessions['srv-1']!.lastActiveAt;
    await new Promise((r) => setTimeout(r, 5));
    useSessionsStore.getState().updateSession('srv-1', {
      pinnedDynamicViewIds: ['v1'],
    });
    const after = useSessionsStore.getState().sessions['srv-1']!;
    expect(after.pinnedDynamicViewIds).toEqual(['v1']);
    expect(after.lastActiveAt > before).toBe(true);
  });

  it('updateSession is a no-op when serverId not in memory', () => {
    useSessionsStore.getState().updateSession('missing', { pinnedDynamicViewIds: ['x'] });
    expect(useSessionsStore.getState().sessions).toEqual({});
  });

  it('setSession trims agentHistory above cap', () => {
    const oversized = Array.from({ length: 60 }, (_, i) => ({
      id: `m-${i}`,
      role: 'user' as const,
      content: 'hi',
      timestamp: new Date().toISOString(),
    }));
    useSessionsStore.getState().setSession({
      ...createEmptySessionState('srv-1'),
      agentHistory: oversized,
    });
    expect(useSessionsStore.getState().sessions['srv-1']!.agentHistory).toHaveLength(50);
    // Keeps the most recent
    expect(useSessionsStore.getState().sessions['srv-1']!.agentHistory[0]!.id).toBe('m-10');
  });
});

describe('useSessionsStore — debounced flush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('writes warm tier after 500ms idle', async () => {
    await useSessionsStore.getState().activate('srv-1');
    expect(storage[STORAGE_KEY]).toBeUndefined();
    vi.advanceTimersByTime(600);
    expect(storage[STORAGE_KEY]).toBeDefined();
    const parsed = JSON.parse(storage[STORAGE_KEY]!);
    expect(parsed['srv-1']).toBeDefined();
  });

  it('writes cold tier (api.saveSession) after 2000ms idle', async () => {
    await useSessionsStore.getState().activate('srv-1');
    vi.advanceTimersByTime(1900);
    expect(api.saveSession).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    // Allow microtasks to drain
    await Promise.resolve();
    expect(api.saveSession).toHaveBeenCalled();
  });

  it('coalesces rapid updates into a single cold write', async () => {
    await useSessionsStore.getState().activate('srv-1');
    for (let i = 0; i < 10; i++) {
      useSessionsStore.getState().updateSession('srv-1', { unreadNotificationCount: i });
      vi.advanceTimersByTime(100);
    }
    // Idle 2s → 1 write
    vi.advanceTimersByTime(2100);
    await Promise.resolve();
    expect(api.saveSession).toHaveBeenCalledTimes(1);
  });
});

describe('useSessionsStore — flushAll', () => {
  it('writes warm tier immediately and fires beacons', async () => {
    await useSessionsStore.getState().activate('srv-1');
    await useSessionsStore.getState().activate('srv-2');
    useSessionsStore.getState().flushAll();
    expect(storage[STORAGE_KEY]).toBeDefined();
    const parsed = JSON.parse(storage[STORAGE_KEY]!);
    expect(Object.keys(parsed).sort()).toEqual(['srv-1', 'srv-2']);
    expect(api.saveSessionBeacon).toHaveBeenCalledTimes(2);
  });
});

describe('useSessionsStore — loadAll', () => {
  it('hydrates from warm tier and fetches summaries', async () => {
    storage[STORAGE_KEY] = JSON.stringify({
      'srv-1': createEmptySessionState('srv-1'),
    });
    vi.mocked(api.fetchSessions).mockResolvedValueOnce([
      {
        serverId: 'srv-1',
        lifecycle: 'active',
        lastActiveAt: new Date().toISOString(),
        windowCount: 0,
        hasOverrides: false,
      },
    ]);

    await useSessionsStore.getState().loadAll();
    expect(useSessionsStore.getState().sessions['srv-1']).toBeDefined();
    expect(useSessionsStore.getState().summaries).toHaveLength(1);
  });

  it('still loads warm tier even if backend summaries fail', async () => {
    storage[STORAGE_KEY] = JSON.stringify({
      'srv-1': createEmptySessionState('srv-1'),
    });
    vi.mocked(api.fetchSessions).mockRejectedValueOnce(new Error('network'));
    await useSessionsStore.getState().loadAll();
    expect(useSessionsStore.getState().sessions['srv-1']).toBeDefined();
  });
});
