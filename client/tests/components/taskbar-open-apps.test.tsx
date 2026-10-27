// EX8.27: open apps in the dock get a lane across it; the app in front a brighter one with an accent bar
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

import { Taskbar } from '../../src/components/Desktop/Taskbar';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { useDesktopStore } from '../../src/store/window-store';
import { useAppStore } from '../../src/store/app-store';
import { usePreferencesStore } from '../../src/store/preferences-store';

/** The open-app background behind a dock tile, if any */
const bgOf = (label: string) =>
  screen.getByRole('button', { name: label }).parentElement!.querySelector('[data-testid="dock-open-bg"]');

const renderDock = () => render(<TooltipProvider><Taskbar /></TooltipProvider>);

describe('dock: open apps', () => {
  beforeEach(() => act(() => {
    useAppStore.setState({ servers: [{ id: 's1', name: 'S', host: 'h', port: 22, username: 'u', authMethod: 'password', state: { status: 'connected' } }] as never, activeServerId: 's1' });
    usePreferencesStore.setState({ pinnedAppIds: ['files', 'terminal', 'dashboard'], dockPosition: 'bottom' });
    useDesktopStore.setState({ windows: [] });
  }));

  it('puts a stronger background behind the app in front and a subtle one behind the rest', () => {
    act(() => {
      useDesktopStore.getState().openWindow('files', 's1', 'File Explorer', 'files');
      useDesktopStore.getState().openWindow('terminal', 's1', 'Terminal', 'terminal');
    });
    renderDock();
    expect(bgOf('Terminal')).toHaveClass('dock-lane-front');
    expect(bgOf('File Explorer')).not.toHaveClass('dock-lane-front');
    expect(bgOf('Dashboard')).toBeNull();
    // only the app in front gets the accent bar at the dock's base
    expect(bgOf('Terminal')!.querySelector('.dock-lane-bar')).not.toBeNull();
    expect(bgOf('File Explorer')!.querySelector('.dock-lane-bar')).toBeNull();
  });

  it('keeps the background when the app in front is minimized from the dock', () => {
    act(() => { useDesktopStore.getState().openWindow('terminal', 's1', 'Terminal', 'terminal'); });
    renderDock();
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    expect(useDesktopStore.getState().windows[0].minimized).toBe(true);
    expect(bgOf('Terminal')).not.toHaveClass('dock-lane-front');
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    expect(bgOf('Terminal')).toHaveClass('dock-lane-front');
  });

  it('marks an unpinned window as open while it is minimized', () => {
    act(() => {
      useDesktopStore.getState().openWindow('services', 's1', 'Services', 'services');
      useDesktopStore.getState().minimizeWindow(useDesktopStore.getState().windows[0].id);
    });
    renderDock();
    expect(bgOf('Services')).not.toHaveClass('dock-lane-front');
  });
});
