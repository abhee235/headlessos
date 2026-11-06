// EX8.31: the dock makes way for a maximized window, and comes back when it's wanted
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, listTrash: vi.fn(async () => []) };
});

import { Taskbar } from '../../src/components/Desktop/Taskbar';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { useDesktopStore } from '../../src/store/window-store';
import { useAppStore } from '../../src/store/app-store';
import { usePreferencesStore } from '../../src/store/preferences-store';

const renderDock = () => render(<TooltipProvider><Taskbar /></TooltipProvider>);
const dock = () => screen.getByRole('toolbar', { name: 'Dock' });
const handle = () => screen.queryByTestId('dock-handle');
const isAway = () => dock().dataset.away === 'true';
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function openMaximized(serverId = 's1') {
  act(() => {
    useDesktopStore.getState().openWindow('files', serverId, 'File Explorer', 'files');
    const { windows, maximizeWindow } = useDesktopStore.getState();
    maximizeWindow(windows[windows.length - 1]!.id);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  act(() => {
    useAppStore.setState({
      servers: [{ id: 's1', name: 'S', host: 'h', port: 22, username: 'u', authMethod: 'password', state: { serverId: 's1', status: 'connected' } }] as never,
      activeServerId: 's1',
    });
    usePreferencesStore.setState({ pinnedAppIds: ['files', 'terminal'], dockPosition: 'bottom' });
    useDesktopStore.setState({ windows: [], dockRevealed: false, startMenuOpen: false, homeHubOpen: false });
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.querySelectorAll('[data-test-menu]').forEach((el) => el.remove());
});

describe('when the dock makes way', () => {
  it('stays with no window maximized', () => {
    act(() => { useDesktopStore.getState().openWindow('files', 's1', 'File Explorer', 'files'); });
    renderDock();
    expect(isAway()).toBe(false);
    expect(handle()).toBeNull();
  });

  it('slides away for a maximized window, and leaves the handle', () => {
    openMaximized();
    renderDock();
    expect(isAway()).toBe(true);
    expect(handle()).not.toBeNull();
  });

  it('comes back when the window is restored', () => {
    openMaximized();
    renderDock();
    const { windows, restoreWindow } = useDesktopStore.getState();
    act(() => restoreWindow(windows[0]!.id));
    expect(isAway()).toBe(false);
    expect(handle()).toBeNull();
  });

  it('ignores a maximized window that is minimized', () => {
    openMaximized();
    const { windows, minimizeWindow } = useDesktopStore.getState();
    act(() => minimizeWindow(windows[0]!.id));
    renderDock();
    expect(isAway()).toBe(false);
  });

  it("ignores another session's window, which isn't on screen", () => {
    openMaximized('s2');
    renderDock();
    expect(isAway()).toBe(false);
  });
});

describe('bringing it back', () => {
  beforeEach(() => {
    openMaximized();
    renderDock();
  });

  it('rises after a short hover on the handle', () => {
    fireEvent.mouseEnter(handle()!);
    wait(149);
    expect(isAway()).toBe(true);
    wait(1);
    expect(isAway()).toBe(false);
  });

  it('stays down for a pointer just passing the edge', () => {
    fireEvent.mouseEnter(handle()!);
    wait(100);
    fireEvent.mouseLeave(handle()!);
    wait(1000);
    expect(isAway()).toBe(true);
  });

  it('stays down while a mouse button is held, as in a text selection', () => {
    fireEvent.mouseEnter(handle()!, { buttons: 1 });
    wait(1000);
    expect(isAway()).toBe(true);
  });

  it('rises at once on a click, for a touch screen', () => {
    fireEvent.click(handle()!);
    expect(isAway()).toBe(false);
  });

  it('goes again after the pointer leaves', () => {
    fireEvent.click(handle()!);
    fireEvent.mouseLeave(handle()!);
    wait(499);
    expect(isAway()).toBe(false);
    wait(1);
    expect(isAway()).toBe(true);
  });

  it('survives the gap between the handle and the dock', () => {
    fireEvent.click(handle()!);
    fireEvent.mouseLeave(handle()!);
    wait(200);
    fireEvent.mouseEnter(dock());
    wait(5000);
    expect(isAway()).toBe(false);
  });

  it('goes on a press elsewhere, which is the only way on a touch screen', () => {
    fireEvent.click(handle()!);
    fireEvent.pointerDown(document.body);
    expect(isAway()).toBe(true);
  });

  it('stays for a press on the dock itself', () => {
    fireEvent.click(handle()!);
    fireEvent.pointerDown(dock());
    expect(isAway()).toBe(false);
  });
});

describe('while it is in use', () => {
  beforeEach(() => {
    openMaximized();
    renderDock();
  });

  it('stays up for the Launcher', () => {
    act(() => useDesktopStore.setState({ startMenuOpen: true }));
    expect(isAway()).toBe(false);
    act(() => useDesktopStore.setState({ startMenuOpen: false }));
    expect(isAway()).toBe(true);
  });

  it('stays up for the Home hub', () => {
    act(() => useDesktopStore.setState({ homeHubOpen: true }));
    expect(isAway()).toBe(false);
  });

  it('stays up for a dock menu, and goes once it closes', () => {
    fireEvent.click(handle()!);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.dataset.testMenu = '';
    document.body.appendChild(menu);

    fireEvent.mouseLeave(dock());
    wait(2000);
    expect(isAway()).toBe(false);

    menu.remove();
    wait(500);
    expect(isAway()).toBe(true);
  });
});

describe('with the dock on the right', () => {
  it('slides off that edge and puts the handle there', () => {
    act(() => usePreferencesStore.setState({ dockPosition: 'right' }));
    openMaximized();
    renderDock();
    expect(isAway()).toBe(true);
    expect(dock().className).toContain('translate-x-[calc(100%+24px)]');
    expect(handle()!.dataset.side).toBe('right');
  });
});
