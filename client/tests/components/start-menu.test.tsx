// EX8.33: the launcher stays compact and leaves the desktop showing
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

import { StartMenu } from '../../src/components/Desktop/StartMenu';
import { useDesktopStore } from '../../src/store/window-store';
import { useAppStore } from '../../src/store/app-store';
import { usePreferencesStore } from '../../src/store/preferences-store';
import { useSavedAppStore } from '../../src/store/saved-app-store';

const openWindow = vi.fn();
const server = { id: 's1', name: 'web', host: '10.0.0.1', port: 22, username: 'root', state: { status: 'connected' } };
const recent = ['dashboard', 'files', 'terminal', 'docker', 'services'].map((appId) => ({ appId, timestamp: Date.now() }));

beforeEach(() => {
  openWindow.mockClear();
  act(() => {
    useDesktopStore.setState({ startMenuOpen: true, openWindow });
    useAppStore.setState({ servers: [server], activeServerId: 's1' } as unknown as Partial<ReturnType<typeof useAppStore.getState>>);
    usePreferencesStore.setState({ recentApps: recent });
    useSavedAppStore.setState({ apps: [], fetched: true });
  });
});

describe('Launcher', () => {
  it('draws quick actions as slim pills, not squares', () => {
    render(<StartMenu />);
    const action = screen.getByRole('button', { name: 'Personalize' });
    expect(action).toHaveClass('h-10');
    expect(action).not.toHaveClass('flex-col');
  });

  it('keeps what a quick action does', () => {
    render(<StartMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Personalize' }));
    expect(openWindow).toHaveBeenCalledWith('settings', '', 'Personalize', 'settings', { initialPage: 'wallpaper' });
  });

  it('lists 3 recent apps, however many there are', () => {
    render(<StartMenu />);
    expect(screen.getAllByText('Just now')).toHaveLength(3);
  });

  it('draws apps on the same tiles as the dock', () => {
    act(() => usePreferencesStore.setState({ dockIconStyle: 'color' }));
    const { container } = render(<StartMenu />);
    const grid = screen.getByRole('button', { name: 'Docker' });
    expect((grid.querySelector('span span') as HTMLElement).style.background).toContain('linear-gradient');
    expect(container.querySelector('.lumen-plate')).toBeNull();
  });

  it('stays on glass when the dock is set to Glass', () => {
    act(() => usePreferencesStore.setState({ dockIconStyle: 'glass' }));
    render(<StartMenu />);
    expect(screen.getByRole('button', { name: 'Docker' }).querySelector('.lumen-plate')).not.toBeNull();
  });

  it('drops the Recent and Server cards in a short window', () => {
    render(<StartMenu />);
    expect(screen.getByTestId('launcher-cards').className).toContain('[@media(max-height:814px)]:hidden');
  });
});
