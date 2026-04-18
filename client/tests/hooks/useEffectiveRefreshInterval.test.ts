// EX6-B.6: Tests for useEffectiveRefreshInterval throttle
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionsStore } from '../../src/store/sessions-store';
import { usePreferencesStore } from '../../src/store/preferences-store';
import {
  useEffectiveRefreshInterval,
  getEffectiveRefreshInterval,
} from '../../src/hooks/useEffectiveRefreshInterval';

beforeEach(() => {
  useSessionsStore.setState({ activeServerId: null, sessions: {}, summaries: [] });
  usePreferencesStore.setState({ autoRefreshInterval: 30 } as never, false);
});

describe('useEffectiveRefreshInterval', () => {
  it('returns base interval for the active server', () => {
    useSessionsStore.setState({ activeServerId: 'srv-A' });
    const { result } = renderHook(() => useEffectiveRefreshInterval('srv-A'));
    expect(result.current).toBe(30);
  });

  it('returns 4× interval for background servers', () => {
    useSessionsStore.setState({ activeServerId: 'srv-A' });
    const { result } = renderHook(() => useEffectiveRefreshInterval('srv-B'));
    expect(result.current).toBe(120);
  });

  it('returns 0 when auto-refresh is disabled', () => {
    usePreferencesStore.setState({ autoRefreshInterval: 0 } as never, false);
    const { result } = renderHook(() => useEffectiveRefreshInterval('srv-A'));
    expect(result.current).toBe(0);
  });

  it('returns base interval when serverId is null', () => {
    const { result } = renderHook(() => useEffectiveRefreshInterval(null));
    expect(result.current).toBe(30);
  });

  it('snapshot helper getEffectiveRefreshInterval works without React', () => {
    useSessionsStore.setState({ activeServerId: 'srv-A' });
    expect(getEffectiveRefreshInterval('srv-A')).toBe(30);
    expect(getEffectiveRefreshInterval('srv-B')).toBe(120);
    expect(getEffectiveRefreshInterval(null)).toBe(30);
  });
});
