// EX8.17: Idle glance — the Home hub as the idle privacy screen
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';

vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

import { useIdleGlance } from '../../src/hooks/useIdleGlance';
import { useDesktopStore } from '../../src/store/window-store';
import { useAppStore } from '../../src/store/app-store';
import { usePreferencesStore } from '../../src/store/preferences-store';

function Probe() {
  useIdleGlance();
  return null;
}

describe('useIdleGlance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    act(() => {
      useDesktopStore.setState({ homeHubOpen: false, homeHubReason: null });
      useAppStore.setState({ screen: 'desktop' });
      usePreferencesStore.getState().setIdleGlanceMinutes(1);
    });
  });
  afterEach(() => vi.useRealTimers());

  it('opens the hub as the away screen after a minute without input', () => {
    render(<Probe />);
    act(() => { vi.advanceTimersByTime(55_000); });
    expect(useDesktopStore.getState().homeHubOpen).toBe(false);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(useDesktopStore.getState()).toMatchObject({ homeHubOpen: true, homeHubReason: 'idle' });
  });

  it('input restarts the countdown', () => {
    render(<Probe />);
    act(() => { vi.advanceTimersByTime(50_000); });
    fireEvent.pointerMove(window);
    act(() => { vi.advanceTimersByTime(50_000); });
    expect(useDesktopStore.getState().homeHubOpen).toBe(false);
    act(() => { vi.advanceTimersByTime(15_000); });
    expect(useDesktopStore.getState().homeHubOpen).toBe(true);
  });

  it('does nothing when off, or away from the desktop', () => {
    act(() => usePreferencesStore.getState().setIdleGlanceMinutes(0));
    const { unmount } = render(<Probe />);
    act(() => { vi.advanceTimersByTime(5 * 60_000); });
    expect(useDesktopStore.getState().homeHubOpen).toBe(false);
    unmount();

    act(() => { usePreferencesStore.getState().setIdleGlanceMinutes(1); useAppStore.setState({ screen: 'lock' }); });
    render(<Probe />);
    act(() => { vi.advanceTimersByTime(5 * 60_000); });
    expect(useDesktopStore.getState().homeHubOpen).toBe(false);
  });

  it('keeps a hub the user opened as a user hub', () => {
    act(() => useDesktopStore.getState().toggleHomeHub());
    render(<Probe />);
    act(() => { vi.advanceTimersByTime(2 * 60_000); });
    expect(useDesktopStore.getState().homeHubReason).toBe('user');
  });
});
