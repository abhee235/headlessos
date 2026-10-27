// EX8.10 + EX8.15 + EX8.26: HomeHub — overlay behaviour, the glance bindings and the network card
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
import {
  EMPTY_SERIES, NET_KEEP_MS, NetworkTrafficCard, addNetSample, arcPath, formatOffset, formatRate, formatSize, netStats,
  niceRateCeil, trafficPaths,
  type NetSample,
} from '../../src/components/HomeHub/cards';
import { barColour, glanceHeadline, greetingFor, levelTone, recentAppIds, skyFor } from '../../src/components/HomeHub/glance';
import { displayBrightness } from '../../src/lib/display-level';
import { useDesktopStore } from '../../src/store/window-store';
import { useAppStore } from '../../src/store/app-store';

const pulse = (cpu: number | null, mem: number | null = 10, disk: number | null = 10) => ({ cpu, memPct: mem, diskPct: disk, latencyMs: 20, net: null });

describe('HomeHub maths', () => {
  it('scales like the prototype: width, height or the 0.82 cap', () => {
    expect(hubScale(1440, 900)).toBeCloseTo(0.7487, 3);
    expect(hubScale(2560, 1600)).toBe(0.82);
  });
  it('draws arcs with the large-arc flag only past 180°', () => {
    expect(arcPath(100, 100, 86, -100, 100)).toMatch(/ A 86 86 0 1 1 /);
    expect(arcPath(100, 100, 86, -100, 0)).toMatch(/ A 86 86 0 0 1 /);
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

// ─── EX8.26: network traffic card ────────────────────────────────────────────

const io = (name: string, rx: number, tx: number) => ({ interface: name, rxBytes: rx, txBytes: tx, rxPackets: 0, txPackets: 0 });
const reading = (at: number, ...ifaces: ReturnType<typeof io>[]): NetSample => ({ serverId: 's', at, ifaces });

describe('network series', () => {
  it('ranks interfaces busiest first with loopback last, and makes no point from the first reading', () => {
    const s = addNetSample(EMPTY_SERIES, reading(0, io('lo', 9e9, 9e9), io('docker0', 10, 10), io('eth0', 5000, 5000)));
    expect(s.ifaces).toEqual(['eth0', 'docker0', 'lo']);
    expect(s.points).toEqual([]);
  });

  it('turns counter deltas into bytes per second', () => {
    let s = addNetSample(EMPTY_SERIES, reading(0, io('eth0', 1000, 500)));
    s = addNetSample(s, reading(2000, io('eth0', 5096, 2548)));
    expect(s.points).toEqual([{ at: 2000, secs: 2, rates: { eth0: { rx: 2048, tx: 1024 } } }]);
  });

  it('skips readings under 1 s apart, counts a counter that goes back as 0, appends new interfaces', () => {
    let s = addNetSample(EMPTY_SERIES, reading(0, io('eth0', 1000, 1000)));
    expect(addNetSample(s, reading(500, io('eth0', 9000, 9000)))).toBe(s);
    s = addNetSample(s, reading(2000, io('eth0', 10, 3000), io('wg0', 1, 1)));
    expect(s.points[0].rates).toEqual({ eth0: { rx: 0, tx: 1000 } });
    expect(s.ifaces).toEqual(['eth0', 'wg0']);
  });

  it('starts a new baseline after a gap instead of averaging over it', () => {
    let s = addNetSample(EMPTY_SERIES, reading(0, io('eth0', 0, 0)));
    s = addNetSample(s, reading(60_000, io('eth0', 6e6, 6e6)));
    expect(s.points).toEqual([]);
    s = addNetSample(s, reading(62_000, io('eth0', 6e6 + 2000, 6e6)));
    expect(s.points).toEqual([{ at: 62_000, secs: 2, rates: { eth0: { rx: 1000, tx: 0 } } }]);
  });

  it('keeps 15 minutes', () => {
    let s = EMPTY_SERIES;
    for (let t = 0; t <= NET_KEEP_MS + 10_000; t += 2000) s = addNetSample(s, reading(t, io('eth0', t, t)));
    expect(s.points[0].at).toBeGreaterThanOrEqual(10_000);
    expect(s.points[s.points.length - 1].at - s.points[0].at).toBeLessThanOrEqual(NET_KEEP_MS);
  });

  it('formats rates with at most three digits', () => {
    expect(formatRate(0)).toBe('0 B/s');
    expect(formatRate(512)).toBe('512 B/s');
    expect(formatRate(1000)).toBe('1.0 KB/s');
    expect(formatRate(3174)).toBe('3.1 KB/s');
    expect(formatRate(12_000)).toBe('12 KB/s');
    expect(formatRate(5 * 1024 ** 2)).toBe('5.0 MB/s');
    expect(formatSize(3.6 * 1024 ** 2)).toBe('3.6 MB');
  });

  it('sums peak, average and bytes moved over the measured time only', () => {
    const pts = [
      { at: 2000, secs: 2, rates: { eth0: { rx: 1000, tx: 100 } } },
      { at: 4000, secs: 2, rates: { eth0: { rx: 3000, tx: 300 } } },
      { at: 64_000, secs: 2, rates: { wg0: { rx: 9e9, tx: 9e9 } } },
    ];
    expect(netStats(pts, 'eth0')).toEqual({ peak: { rx: 3000, tx: 300 }, avg: { rx: 2000, tx: 200 }, total: { rx: 8000, tx: 800 } });
    expect(netStats(pts, 'nope')).toBeNull();
  });

  it('rounds the scale up to 1 / 2 / 5 steps, at least 1 KB/s', () => {
    expect(niceRateCeil(0)).toBe(1024);
    expect(niceRateCeil(1500)).toBe(2048);
    expect(niceRateCeil(3.4 * 1024)).toBe(5 * 1024);
    expect(niceRateCeil(140 * 1024)).toBe(200 * 1024);
    expect(niceRateCeil(700 * 1024)).toBe(1024 ** 2);
  });

  it('formats offsets from the end of the range', () => {
    expect(formatOffset(0)).toBe('now');
    expect(formatOffset(300_000)).toBe('−5:00');
    expect(formatOffset(84_000)).toBe('−1:24');
  });

  it('draws download above the centre line and upload below, breaking at gaps', () => {
    const pts = [
      { at: 0, secs: 2, rates: { eth0: { rx: 1024, tx: 512 } } }, { at: 2000, secs: 2, rates: { eth0: { rx: 1024, tx: 512 } } },
      { at: 30_000, secs: 2, rates: { eth0: { rx: 0, tx: 0 } } }, { at: 32_000, secs: 2, rates: { eth0: { rx: 0, tx: 0 } } },
    ];
    const p = trafficPaths(pts, 'eth0', 0, 60_000, 1024);
    expect(p.down.line.match(/M /g)).toHaveLength(2);
    // full scale reaches the headroom (y 8); half scale below the line is 64 + 28
    expect(p.down.line).toMatch(/^M 0\.0 8\.0 L 9\.1 8\.0/);
    expect(p.up.line).toMatch(/^M 0\.0 92\.0/);
    expect(p.down.area).toMatch(/^M 0\.0 64 L /);
  });
});

describe('network traffic card', () => {
  let n = 0;
  const id = () => `srv-${++n}`;
  const props = (serverId: string, sample: NetSample | null, connected = true) => ({ serverId, connected, sample });
  const at = (serverId: string, t: number, ...ifaces: ReturnType<typeof io>[]): NetSample => ({ serverId, at: t, ifaces });
  const stat = (title: string) => screen.getByText(title, { selector: 'dt' }).parentElement!.textContent;

  it('says when the server is not connected', () => {
    render(<NetworkTrafficCard {...props(id(), null, false)} />);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(stat('Peak')).toBe('Peak↓ –↑ –');
  });

  it('measures until it has a line, then shows the latest rates and the range stats', () => {
    const s = id();
    const { rerender } = render(<NetworkTrafficCard {...props(s, at(s, 0, io('eth0', 0, 0)))} />);
    expect(screen.getByText('Measuring…')).toBeInTheDocument();
    rerender(<NetworkTrafficCard {...props(s, at(s, 2000, io('eth0', 2048, 4096)))} />);
    rerender(<NetworkTrafficCard {...props(s, at(s, 4000, io('eth0', 4096 + 2048, 4096 + 6144)))} />);
    expect(screen.getByText('↓ 2.0 KB/s', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('↑ 3.0 KB/s', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Network · eth0')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /on eth0, last 5 minutes, scale 5 KB\/s/ })).toBeInTheDocument();
    // 1 KB/s then 2 KB/s down, 2 KB/s then 3 KB/s up
    expect(stat('Peak')).toBe('Peak↓ 2.0 KB/s↑ 3.0 KB/s');
    expect(stat('Average')).toBe('Average↓ 1.5 KB/s↑ 2.5 KB/s');
    expect(stat('Total')).toBe('Total↓ 6.0 KB↑ 10 KB');
  });

  it("keeps a server's history when the card mounts again", () => {
    const s = id();
    const { unmount } = render(<NetworkTrafficCard {...props(s, at(s, 0, io('eth0', 0, 0)))} />);
    unmount();
    const { rerender } = render(<NetworkTrafficCard {...props(s, at(s, 2000, io('eth0', 1024, 0)))} />);
    rerender(<NetworkTrafficCard {...props(s, at(s, 4000, io('eth0', 2048, 0)))} />);
    expect(screen.getByText('↓ 512 B/s', { selector: 'span' })).toBeInTheDocument();
  });

  it('switches interface from the label only when there is more than one', () => {
    const s = id();
    const { rerender } = render(<NetworkTrafficCard {...props(s, at(s, 0, io('eth0', 0, 0)))} />);
    expect(screen.queryByRole('button', { name: /^Interface/ })).toBeNull();
    rerender(<NetworkTrafficCard {...props(s, at(s, 2000, io('eth0', 10, 10), io('docker0', 0, 0)))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Interface eth0, show docker0' }));
    expect(screen.getByText('Network · docker0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Interface docker0, show eth0' }));
    expect(screen.getByText('Network · eth0')).toBeInTheDocument();
  });

  it('cycles the range from the time axis', () => {
    const s = id();
    render(<NetworkTrafficCard {...props(s, at(s, 0, io('eth0', 0, 0)))} />);
    expect(screen.getByText('−5:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Range: last 5 minutes/ }));
    expect(screen.getByText('−15:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Range: last 15 minutes/ }));
    expect(screen.getByText('−1:00')).toBeInTheDocument();
  });

  it('shows the moment under the pointer, and the latest again when it leaves', () => {
    const s = id();
    const { rerender } = render(<NetworkTrafficCard {...props(s, at(s, 0, io('eth0', 0, 0)))} />);
    let rx = 0;
    for (let t = 2000; t <= 300_000; t += 2000) {
      rx += t <= 280_000 ? 1024 * 2 : 4096 * 2; // 1 KB/s, then 4 KB/s for the last 20 s
      rerender(<NetworkTrafficCard {...props(s, at(s, t, io('eth0', rx, 0)))} />);
    }
    expect(screen.getByText('↓ 4.0 KB/s', { selector: 'span' })).toBeInTheDocument();
    const chart = screen.getByTestId('net-chart');
    chart.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 50, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(chart, { clientX: 90 }); // 30 s before the end of 5 min
    expect(screen.getByText('Network · eth0 · −0:30')).toBeInTheDocument();
    expect(screen.getByText('↓ 1.0 KB/s', { selector: 'span' })).toBeInTheDocument();
    fireEvent.pointerLeave(chart);
    expect(screen.getByText('Network · eth0')).toBeInTheDocument();
    expect(screen.getByText('↓ 4.0 KB/s', { selector: 'span' })).toBeInTheDocument();
  });
});
