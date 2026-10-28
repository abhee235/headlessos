// EX8.29: the fleet overview in the Home hub's style — dials, LEDs, one summary card
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import type { FleetOverview, FleetServerSummary } from '../../src/lib/api';

const fetchFleetOverview = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, fetchFleetOverview };
});

import { FleetDashboardView, FleetDial, fleetTone, shortUptime, updatedAgo } from '../../src/components/Fleet/FleetDashboardView';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { useAppStore } from '../../src/store/app-store';
import { useDesktopStore } from '../../src/store/window-store';

const web: FleetServerSummary = {
  id: 'web', name: 'web-01', host: 'web-01.example.com', port: 22, status: 'connected', tags: ['prod'],
  system: { hostname: 'web-01', os: 'Ubuntu 22.04.5 LTS', uptime: 'up 2 days, 16 hours, 38 minutes', kernel: '6.8', architecture: 'x86_64' },
  cpu: { usedPercent: 22, cores: 12 },
  memory: { totalMb: 15515, usedMb: 2187, usedPercent: 14 },
  disk: { totalGb: 1007, usedGb: 57, usedPercent: 6 },
  latencyMs: 18,
};
const db: FleetServerSummary = { id: 'db', name: 'db-01', host: 'db-01.example.com', port: 22, status: 'disconnected', tags: [] };

const overview = (servers: FleetServerSummary[], avgCpuPercent: number | null = 22): FleetOverview => ({
  servers,
  totals: { total: servers.length, connected: servers.filter((s) => s.status === 'connected').length, disconnected: 0,
    totalMemoryMb: 15515, usedMemoryMb: 2187, totalDiskGb: 1007, usedDiskGb: 57, avgCpuPercent },
  fetchedAt: new Date().toISOString(),
});

const renderView = async () => {
  await act(async () => {
    render(<TooltipProvider><FleetDashboardView /></TooltipProvider>);
  });
};

const connectServer = vi.fn();
const setActiveServer = vi.fn();
const openWindow = vi.fn();

beforeEach(() => {
  fetchFleetOverview.mockReset();
  connectServer.mockReset(); setActiveServer.mockReset(); openWindow.mockReset();
  useAppStore.setState({ connectServer, setActiveServer } as never);
  useDesktopStore.setState({ openWindow } as never);
});
afterEach(() => vi.useRealTimers());

describe('fleet helpers', () => {
  it('shortens uptime to the two largest units', () => {
    expect(shortUptime('up 2 days, 16 hours, 38 minutes')).toBe('up 2d 16h');
    expect(shortUptime('up 1 week, 3 days, 2 hours')).toBe('up 1w 3d');
    expect(shortUptime('up 42 minutes')).toBe('up 42m');
    expect(shortUptime(undefined)).toBeNull();
  });

  it('lights the LED by the busiest metric, and off when not connected', () => {
    expect(fleetTone(web)).toBe('green');
    expect(fleetTone({ ...web, disk: { ...web.disk!, usedPercent: 80 } })).toBe('amber');
    expect(fleetTone({ ...web, cpu: { usedPercent: 95, cores: 2 } })).toBe('red');
    expect(fleetTone(db)).toBe('off');
    expect(fleetTone({ ...db, status: 'error', error: 'timeout' })).toBe('red');
  });

  it('says how long ago the data was fetched', () => {
    const t = Date.parse('2026-10-28T10:00:00Z');
    expect(updatedAgo('2026-10-28T10:00:00Z', t + 2000)).toBe('updated just now');
    expect(updatedAgo('2026-10-28T10:00:00Z', t + 12_000)).toBe('updated 12 s ago');
    expect(updatedAgo('2026-10-28T10:00:00Z', t + 180_000)).toBe('updated 3 min ago');
  });
});

describe('FleetDial', () => {
  it('is a meter with the value, and draws a knob', () => {
    const { container } = render(<FleetDial label="Memory" value={63.4} detail="2.1 / 15.2 GB" />);
    const meter = screen.getByRole('meter', { name: 'Memory use' });
    expect(meter).toHaveAttribute('aria-valuenow', '63');
    expect(meter).toHaveTextContent('63%');
    expect(container.querySelector('[data-knob]')).not.toBeNull();
    expect(screen.getByText('2.1 / 15.2 GB')).toBeInTheDocument();
  });

  it('is empty with a dash when there is no reading', () => {
    const { container } = render(<FleetDial label="CPU" value={null} />);
    const meter = screen.getByRole('meter', { name: 'CPU use' });
    expect(meter).not.toHaveAttribute('aria-valuenow');
    expect(meter).toHaveAttribute('aria-valuetext', 'No reading yet');
    expect(meter).toHaveTextContent('–');
    expect(container.querySelector('[data-knob]')).toBeNull();
  });

  it('turns amber from 75% and red from 90%', () => {
    const colour = (v: number) => {
      const { container, unmount } = render(<FleetDial label="Disk" value={v} />);
      const fill = (container.querySelector('[data-knob]') as SVGCircleElement).style.fill;
      unmount();
      return fill;
    };
    expect(colour(40)).toContain('accent-solid');
    expect(colour(80)).toContain('warning');
    expect(colour(95)).toContain('danger');
  });
});

describe('FleetDashboardView', () => {
  it('shows the fleet summary and a card of three dials per server, without the old icon chips or bars', async () => {
    fetchFleetOverview.mockResolvedValue({ success: true, data: overview([web, db]) });
    await renderView();
    expect(screen.getByRole('heading', { name: 'Fleet' })).toBeInTheDocument();
    expect(screen.getByTestId('fleet-subtitle')).toHaveTextContent('1 of 2 online · updated just now');

    const summary = screen.getByTestId('fleet-summary');
    expect(within(summary).getAllByRole('meter')).toHaveLength(3);

    const card = screen.getByTestId('fleet-card-web');
    expect(within(card).getAllByRole('meter').map((m) => m.getAttribute('aria-label'))).toEqual(['CPU use', 'Memory use', 'Disk use']);
    expect(within(card).getByText('12 cores')).toBeInTheDocument();
    expect(within(card).getByText('2.1 / 15.2 GB')).toBeInTheDocument();
    expect(within(card).getByText('Ubuntu 22.04.5 LTS · up 2d 16h')).toBeInTheDocument();
    expect(within(card).getByText('18 ms')).toBeInTheDocument();
    expect(within(card).getByText('prod')).toBeInTheDocument();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  it('draws an offline server empty with Connect, and opens a server from its card', async () => {
    fetchFleetOverview.mockResolvedValue({ success: true, data: overview([web, db]) });
    await renderView();
    const offline = screen.getByTestId('fleet-card-db');
    expect(within(offline).getByText('Offline')).toBeInTheDocument();
    within(offline).getAllByRole('meter').forEach((m) => expect(m).toHaveTextContent('–'));

    fireEvent.click(within(offline).getByRole('button', { name: 'Connect' }));
    expect(connectServer).toHaveBeenCalledWith('db');
    expect(openWindow).toHaveBeenCalledWith('dashboard', 'db', 'Dashboard — db-01', 'dashboard');

    // the name is the card's button (stretched over it), so keyboard and click both reach it
    fireEvent.click(screen.getByRole('button', { name: 'Open web-01 (Online)' }));
    expect(setActiveServer).toHaveBeenLastCalledWith('web');
    expect(connectServer).toHaveBeenCalledTimes(1); // already connected
  });

  it('asks again once, 2 s later, while a connected server has no CPU reading yet', async () => {
    vi.useFakeTimers();
    const first = overview([{ ...web, cpu: { usedPercent: null, cores: 12 } }], null);
    fetchFleetOverview.mockResolvedValueOnce({ success: true, data: first }).mockResolvedValue({ success: true, data: overview([web]) });
    await renderView();
    expect(fetchFleetOverview).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId('fleet-card-web')).getByRole('meter', { name: 'CPU use' })).toHaveTextContent('–');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(fetchFleetOverview).toHaveBeenCalledTimes(2);
    expect(within(screen.getByTestId('fleet-card-web')).getByRole('meter', { name: 'CPU use' })).toHaveTextContent('22%');
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(fetchFleetOverview).toHaveBeenCalledTimes(2);
  });
});
