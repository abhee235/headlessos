// EX8.31: the menu bar offers the dock while it's away, for anyone who hasn't found the handle
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

import { MenuBar } from '../../src/components/Desktop/MenuBar';
import { Taskbar } from '../../src/components/Desktop/Taskbar';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { useDesktopStore } from '../../src/store/window-store';
import { useAppStore } from '../../src/store/app-store';
import { usePreferencesStore } from '../../src/store/preferences-store';

const renderBoth = () => render(<TooltipProvider><MenuBar /><Taskbar /></TooltipProvider>);
const button = () => screen.queryByTestId('menubar-dock');
const isAway = () => screen.getByRole('toolbar', { name: 'Dock' }).dataset.away === 'true';

function openWindow(maximize: boolean) {
  act(() => {
    useDesktopStore.getState().openWindow('files', 's1', 'File Explorer', 'files');
    if (maximize) useDesktopStore.getState().maximizeWindow(useDesktopStore.getState().windows[0]!.id);
  });
}

beforeEach(() => act(() => {
  useAppStore.setState({
    servers: [{ id: 's1', name: 'S', host: 'h', port: 22, username: 'u', authMethod: 'password', state: { serverId: 's1', status: 'connected' } }] as never,
    activeServerId: 's1',
  });
  usePreferencesStore.setState({ pinnedAppIds: ['files'], dockPosition: 'bottom' });
  useDesktopStore.setState({ windows: [], dockRevealed: false, startMenuOpen: false, homeHubOpen: false });
}));

describe('the menu bar button', () => {
  it('is not there while the dock is on screen', () => {
    openWindow(false);
    renderBoth();
    expect(button()).toBeNull();
  });

  it('says what it does while the dock is away', () => {
    openWindow(true);
    renderBoth();
    expect(button()).toHaveTextContent('Show dock');
  });

  it('brings the dock up, and takes it down again', () => {
    openWindow(true);
    renderBoth();

    fireEvent.pointerDown(button()!);
    fireEvent.click(button()!);
    expect(isAway()).toBe(false);
    expect(button()).toHaveTextContent('Hide dock');

    fireEvent.pointerDown(button()!);
    fireEvent.click(button()!);
    expect(isAway()).toBe(true);
    expect(button()).toHaveTextContent('Show dock');
  });

  it('keeps the dock up when focus moves here from the dock', () => {
    vi.useFakeTimers();
    openWindow(true);
    renderBoth();
    const handle = screen.getByTestId('dock-handle');

    fireEvent.click(button()!);
    fireEvent.blur(handle, { relatedTarget: button() });
    act(() => { vi.advanceTimersByTime(2000); });
    vi.useRealTimers();

    expect(isAway()).toBe(false);
  });

  it('lets a press elsewhere send the dock away', () => {
    openWindow(true);
    renderBoth();
    fireEvent.click(button()!);
    fireEvent.pointerDown(document.body);
    expect(isAway()).toBe(true);
  });

  it('starts the next maximized window with the dock out of the way', () => {
    openWindow(true);
    renderBoth();
    fireEvent.click(button()!);
    const id = useDesktopStore.getState().windows[0]!.id;

    act(() => useDesktopStore.getState().restoreWindow(id));
    act(() => useDesktopStore.getState().maximizeWindow(id));

    expect(isAway()).toBe(true);
  });
});
