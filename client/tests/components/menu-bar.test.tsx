// EX8.11: top menu bar — date format and the space windows keep clear under it
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The theme store reads matchMedia at import time; jsdom has none
vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
import { act } from '@testing-library/react';
import { menuBarDate } from '../../src/components/Desktop/MenuBar';
import { useDesktopStore, TOP_RESERVE, DOCK_RESERVE } from '../../src/store/window-store';

describe('menuBarDate', () => {
  it('reads like the design: weekday, month, day, no comma', () => {
    expect(menuBarDate(new Date(2026, 9, 21, 1, 40))).toMatch(/^\w{3} \w{3} 21$/);
  });
});

describe('windows stay below the menu bar', () => {
  beforeEach(() => act(() => useDesktopStore.setState({ windows: [], nextZIndex: 100 })));

  it('opens, moves and snaps below TOP_RESERVE', () => {
    act(() => useDesktopStore.getState().openWindow('files', 's1', 'Files', 'files'));
    const id = useDesktopStore.getState().windows[0].id;
    expect(useDesktopStore.getState().windows[0].y).toBeGreaterThanOrEqual(TOP_RESERVE);

    act(() => useDesktopStore.getState().moveWindow(id, 200, -50));
    expect(useDesktopStore.getState().windows[0].y).toBe(TOP_RESERVE);

    act(() => useDesktopStore.getState().snapWindow(id, 'left'));
    const w = useDesktopStore.getState().windows[0];
    expect(w.y).toBe(TOP_RESERVE);
    expect(w.height).toBe(window.innerHeight - DOCK_RESERVE - TOP_RESERVE);
  });
});
