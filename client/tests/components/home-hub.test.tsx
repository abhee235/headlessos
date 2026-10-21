// EX8.10 + EX8.15: HomeHub — overlay behaviour and the glance bindings
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return {
    ...actual,
    fetchHostInfo: vi.fn(async () => ({ success: true, data: { username: 'abhis', hostname: 'pc', platform: 'win32' } })),
    fetchLLMConfig: vi.fn(async () => ({ success: true, data: { provider: 'none', model: '', hasApiKey: false } })),
    fetchWeather: vi.fn(async () => ({ success: false, error: 'offline' })),
    fetchTaskManager: vi.fn(async () => ({ success: false })),
    fetchSystemDashboard: vi.fn(async () => ({ success: false })),
    fetchTaskManagerUsers: vi.fn(async () => ({ success: false })),
    fetchFiles: vi.fn(async () => []),
  };
});
vi.mock('../../src/components/Desktop/wallpapers', async (orig) => {
  const actual = await orig<typeof import('../../src/components/Desktop/wallpapers')>();
  return { ...actual, fetchWallpapers: vi.fn(async () => ({ system: [{ url: 'w/dusk.jpg' }], user: [] })) };
});

import { HomeHub, hubScale } from '../../src/components/HomeHub/HomeHub';
import { arcPath, formatTrackTime } from '../../src/components/HomeHub/cards';
import { barColour, glanceHeadline, greetingFor, levelTone, recentAppIds, skyFor } from '../../src/components/HomeHub/glance';
import { displayBrightness } from '../../src/lib/display-level';
import { useDesktopStore } from '../../src/store/window-store';
import { useAppStore } from '../../src/store/app-store';

const pulse = (cpu: number | null, mem: number | null = 10, disk: number | null = 10) => ({ cpu, memPct: mem, diskPct: disk, latencyMs: 20 });

describe('HomeHub maths', () => {
  it('scales like the prototype: width, height or the 0.82 cap', () => {
    expect(hubScale(1440, 900)).toBeCloseTo(0.7487, 3);
    expect(hubScale(2560, 1600)).toBe(0.82);
  });
  it('draws arcs with the large-arc flag only past 180°', () => {
    expect(arcPath(100, 100, 86, -100, 100)).toMatch(/ A 86 86 0 1 1 /);
    expect(arcPath(100, 100, 86, -100, 0)).toMatch(/ A 86 86 0 0 1 /);
  });
  it('formats track time as m:ss', () => {
    expect(formatTrackTime(236)).toBe('3:56');
  });
});

describe('glance bindings', () => {
  it('greets by the hour', () => {
    expect(greetingFor(8)).toBe('Good Morning');
    expect(greetingFor(14)).toBe('Good Afternoon');
    expect(greetingFor(21)).toBe('Good Evening');
    expect(greetingFor(2)).toBe('Good Evening');
  });

  it('builds the headline from the server state', () => {
    expect(glanceHeadline({ serverName: null, connected: false, pulse: pulse(null) })).toEqual(['No server', 'connected yet']);
    expect(glanceHeadline({ serverName: 'Prod', connected: false, pulse: pulse(null) })).toEqual(['Not connected to', 'Prod']);
    expect(glanceHeadline({ serverName: 'Prod', connected: true, pulse: pulse(20) })).toEqual(['All calm on', 'Prod']);
    expect(glanceHeadline({ serverName: 'Prod', connected: true, pulse: pulse(95, 92) })).toEqual(['2 things need', 'attention']);
  });

  it('colours load green / amber / red', () => {
    expect(levelTone(null)).toBe('off');
    expect(levelTone(40)).toBe('green');
    expect(levelTone(80)).toBe('amber');
    expect(levelTone(95)).toBe('red');
  });

  it('maps WMO weather codes, with a moon at night', () => {
    expect(skyFor(0)).toEqual({ sky: 'sun', label: 'Clear' });
    expect(skyFor(0, false).sky).toBe('moon');
    expect(skyFor(3).label).toBe('Overcast');
    expect(skyFor(63)).toEqual({ sky: 'rain', label: 'Rain' });
    expect(skyFor(95).label).toBe('Thunderstorm');
  });

  it('lists the 4 most recent known apps, then pinned ones', () => {
    const recent = [
      { appId: 'files', timestamp: 3 }, { appId: 'terminal', timestamp: 5 },
      { appId: 'files', timestamp: 1 }, { appId: 'nope', timestamp: 9 },
    ];
    expect(recentAppIds(recent, ['dashboard', 'docker', 'files'])).toEqual(['terminal', 'files', 'dashboard', 'docker']);
  });
});

describe('display level', () => {
  it('treats 50 as normal, dims below and brightens above (capped)', () => {
    expect(displayBrightness(50)).toBe(1);
    expect(displayBrightness(0)).toBeCloseTo(0.4);
    expect(displayBrightness(25)).toBeCloseTo(0.7);
    expect(displayBrightness(100)).toBeCloseTo(1.35);
    expect(displayBrightness(150)).toBeCloseTo(1.35);
  });
  it('colours the bar without blue', () => {
    expect(barColour(0)).toBe('rgb(255,42,42)');
    expect(barColour(52)).toBe('rgb(57,214,59)');
    // between green and violet the blue channel never dominates both others by much
    const [r, g, b] = barColour(62).match(/\d+/g)!.map(Number);
    expect(b).toBeLessThan(Math.max(r, g) + 160);
  });
});

describe('HomeHub overlay', () => {
  beforeEach(() => act(() => {
    useDesktopStore.setState({ homeHubOpen: false, startMenuOpen: false });
    useAppStore.setState({ servers: [], activeServerId: null });
  }));

  it('renders only while open; opening it closes the launcher', () => {
    const { rerender } = render(<HomeHub />);
    expect(screen.queryByRole('dialog', { name: 'Home hub' })).toBeNull();
    act(() => useDesktopStore.setState({ startMenuOpen: true }));
    act(() => useDesktopStore.getState().toggleHomeHub());
    rerender(<HomeHub />);
    expect(screen.getByRole('dialog', { name: 'Home hub' })).toBeInTheDocument();
    expect(useDesktopStore.getState().startMenuOpen).toBe(false);
  });

  it('greets the local user and says when no server is connected', async () => {
    act(() => useDesktopStore.setState({ homeHubOpen: true }));
    render(<HomeHub />);
    await waitFor(() => expect(screen.getByText(/Abhis!$/)).toBeInTheDocument());
    expect(screen.getByTitle('No server connected yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set city' })).toBeInTheDocument();
    // the dial starts on Memory
    expect(screen.getByRole('button', { name: 'Memory' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes on Escape and on a backdrop click, not on a card click', () => {
    act(() => useDesktopStore.setState({ homeHubOpen: true }));
    render(<HomeHub />);
    fireEvent.click(screen.getByRole('region', { name: 'Weather' }));
    expect(useDesktopStore.getState().homeHubOpen).toBe(true);
    fireEvent.click(screen.getByTestId('hub-canvas'));
    expect(useDesktopStore.getState().homeHubOpen).toBe(false);
    act(() => useDesktopStore.setState({ homeHubOpen: true }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useDesktopStore.getState().homeHubOpen).toBe(false);
  });

  it('lists saved servers in the room bar and re-points the hub', () => {
    act(() => {
      useAppStore.setState({
        servers: [
          { id: 'a', name: 'Alpha', host: 'h', port: 22, username: 'u', authMethod: 'password', state: null },
          { id: 'b', name: 'Beta', host: 'h', port: 22, username: 'u', authMethod: 'password', state: null },
        ] as never,
        activeServerId: 'a',
      });
      useDesktopStore.setState({ homeHubOpen: true });
    });
    render(<HomeHub />);
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTitle('Not connected to Beta')).toBeInTheDocument();
  });
});
