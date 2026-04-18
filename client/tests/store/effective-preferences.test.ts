// EX6-A.8: Layered preferences tests
// @see docs/phases/phase-ex6.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createEmptySessionState } from 'headlessos-shared/schemas/session';

// localStorage mock
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

import { usePreferencesStore } from '../../src/store/preferences-store';
import { useSessionsStore } from '../../src/store/sessions-store';
import {
  useEffectivePref,
  getEffectivePref,
  setPreferenceOverride,
  clearPreferenceOverride,
  hasPreferenceOverride,
  isOverridableKey,
} from '../../src/store/effective-preferences';

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  useSessionsStore.setState({ sessions: {}, summaries: [], activeServerId: null });
  // Reset prefs by re-loading
  usePreferencesStore.setState({ accentColorIndex: 0, autoRefreshInterval: 30, terminalFontSize: 14 });
});

describe('isOverridableKey', () => {
  it('accepts allowlisted keys', () => {
    expect(isOverridableKey('accentColorIndex')).toBe(true);
    expect(isOverridableKey('wallpaperId')).toBe(true);
    expect(isOverridableKey('terminalFontSize')).toBe(true);
    expect(isOverridableKey('autoRefreshInterval')).toBe(true);
  });

  it('rejects non-allowlisted keys', () => {
    expect(isOverridableKey('hasSeenOnboarding')).toBe(false);
    expect(isOverridableKey('dateFormat')).toBe(false);
    expect(isOverridableKey('explorerViewMode')).toBe(false);
  });
});

describe('useEffectivePref', () => {
  it('returns global value when no active server', () => {
    const { result } = renderHook(() => useEffectivePref('accentColorIndex'));
    expect(result.current).toBe(0);
  });

  it('returns global value when active server has no override', async () => {
    await useSessionsStore.getState().activate('srv-1');
    const { result } = renderHook(() => useEffectivePref('autoRefreshInterval'));
    expect(result.current).toBe(30);
  });

  it('returns override when active server has one', async () => {
    await useSessionsStore.getState().activate('srv-1');
    setPreferenceOverride('autoRefreshInterval', 60);
    const { result } = renderHook(() => useEffectivePref('autoRefreshInterval'));
    expect(result.current).toBe(60);
  });

  it('falls back to global for non-overridable keys even with active session', async () => {
    await useSessionsStore.getState().activate('srv-1');
    usePreferencesStore.setState({ dateFormat: '24h' });
    const { result } = renderHook(() => useEffectivePref('dateFormat'));
    expect(result.current).toBe('24h');
  });

  it('switches to new override when activeServerId changes', async () => {
    await useSessionsStore.getState().activate('srv-1');
    setPreferenceOverride('terminalFontSize', 18);
    await useSessionsStore.getState().activate('srv-2');
    setPreferenceOverride('terminalFontSize', 22);

    const { result, rerender } = renderHook(() => useEffectivePref('terminalFontSize'));
    expect(result.current).toBe(22);

    act(() => {
      useSessionsStore.setState({ activeServerId: 'srv-1' });
    });
    rerender();
    expect(result.current).toBe(18);
  });
});

describe('getEffectivePref (snapshot)', () => {
  it('returns global when no override', () => {
    expect(getEffectivePref('accentColorIndex')).toBe(0);
  });

  it('returns override when set', async () => {
    await useSessionsStore.getState().activate('srv-1');
    setPreferenceOverride('accentColorIndex', 4);
    expect(getEffectivePref('accentColorIndex')).toBe(4);
  });
});

describe('setPreferenceOverride', () => {
  it('throws when no active server', () => {
    expect(() => setPreferenceOverride('accentColorIndex', 3))
      .toThrow(/no active server/);
  });

  it('throws when key is not allowlisted', async () => {
    await useSessionsStore.getState().activate('srv-1');
    expect(() => setPreferenceOverride('hasSeenOnboarding' as never, true as never))
      .toThrow(/not in the per-session override allowlist/);
  });

  it('persists override to active session', async () => {
    await useSessionsStore.getState().activate('srv-1');
    setPreferenceOverride('wallpaperId', 'mountain.jpg');
    expect(useSessionsStore.getState().sessions['srv-1']!.preferenceOverrides.wallpaperId)
      .toBe('mountain.jpg');
  });

  it('does not affect other sessions', async () => {
    await useSessionsStore.getState().activate('srv-1');
    await useSessionsStore.getState().activate('srv-2');
    setPreferenceOverride('terminalFontSize', 20);
    expect(useSessionsStore.getState().sessions['srv-1']!.preferenceOverrides.terminalFontSize)
      .toBeUndefined();
    expect(useSessionsStore.getState().sessions['srv-2']!.preferenceOverrides.terminalFontSize)
      .toBe(20);
  });

  it('does not mutate global preferences', async () => {
    await useSessionsStore.getState().activate('srv-1');
    setPreferenceOverride('autoRefreshInterval', 120);
    expect(usePreferencesStore.getState().autoRefreshInterval).toBe(30);
  });
});

describe('clearPreferenceOverride', () => {
  it('removes override and falls back to global', async () => {
    await useSessionsStore.getState().activate('srv-1');
    setPreferenceOverride('terminalFontSize', 22);
    expect(getEffectivePref('terminalFontSize')).toBe(22);
    clearPreferenceOverride('terminalFontSize');
    expect(getEffectivePref('terminalFontSize')).toBe(14);
    expect(useSessionsStore.getState().sessions['srv-1']!.preferenceOverrides.terminalFontSize)
      .toBeUndefined();
  });

  it('is a no-op when no override exists', async () => {
    await useSessionsStore.getState().activate('srv-1');
    clearPreferenceOverride('terminalFontSize'); // should not throw
    expect(useSessionsStore.getState().sessions['srv-1']!.preferenceOverrides).toEqual({});
  });
});

describe('hasPreferenceOverride', () => {
  it('returns false when no override', async () => {
    await useSessionsStore.getState().activate('srv-1');
    expect(hasPreferenceOverride('accentColorIndex')).toBe(false);
  });

  it('returns true after setting one', async () => {
    await useSessionsStore.getState().activate('srv-1');
    setPreferenceOverride('accentColorIndex', 5);
    expect(hasPreferenceOverride('accentColorIndex')).toBe(true);
  });

  it('returns false when no active server', () => {
    expect(hasPreferenceOverride('accentColorIndex')).toBe(false);
  });
});

describe('overrides survive serialization', () => {
  it('round-trips through SessionState', async () => {
    await useSessionsStore.getState().activate('srv-1');
    setPreferenceOverride('accentColorIndex', 3);
    setPreferenceOverride('wallpaperId', 'forest.jpg');

    const session = useSessionsStore.getState().sessions['srv-1']!;
    const json = JSON.stringify(session);
    const parsed = JSON.parse(json);
    expect(parsed.preferenceOverrides).toEqual({
      accentColorIndex: 3,
      wallpaperId: 'forest.jpg',
    });
  });
});
