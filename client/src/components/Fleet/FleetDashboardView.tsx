// M11.1: Fleet Dashboard — Multi-server overview with aggregate stats
// EX8.29: in the Home hub's language — dial gauges for CPU / memory / disk and a status
// LED per server, one summary card for the fleet. Theme tokens throughout, so it reads in
// light and dark and follows the accent. @see docs/phases/phase-ex8.md
//
// Exports: FleetDial (a card-size health dial), shortUptime, fleetTone, FleetDashboardView.

import { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCw, AlertCircle } from 'lucide-react';
import { LoadingView } from '@/components/ui/loading-view';
import { fetchFleetOverview, type FleetOverview, type FleetServerSummary } from '../../lib/api';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore } from '../../store/window-store';
import { usePreferencesStore } from '../../store/preferences-store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { arcPath } from '../HomeHub/cards';
import { levelTone } from '../HomeHub/glance';
import { LED_TONES } from '../HomeHub/hub-ui';
import { cn } from '@/lib/utils';

// ── Helpers ─────────────────────────────────────────────

type Tone = 'green' | 'amber' | 'red' | 'off';

/** The LED tone for a server: its busiest metric (CPU, memory, disk); off when not connected */
export function fleetTone(srv: FleetServerSummary): Tone {
  if (srv.status === 'error') return 'red';
  if (srv.status !== 'connected') return 'off';
  const peak = Math.max(srv.cpu?.usedPercent ?? 0, srv.memory?.usedPercent ?? 0, srv.disk?.usedPercent ?? 0);
  const t = levelTone(peak);
  return t === 'off' ? 'green' : t;
}

/** "up 2 days, 16 hours, 38 minutes" → "up 2d 16h" (the two largest units) */
export function shortUptime(raw: string | undefined): string | null {
  if (!raw) return null;
  const units: Array<[RegExp, string]> = [
    [/(\d+)\s*weeks?/, 'w'], [/(\d+)\s*days?/, 'd'], [/(\d+)\s*hours?/, 'h'], [/(\d+)\s*min(ute)?s?/, 'm'],
  ];
  const parts = units.flatMap(([re, u]) => {
    const m = re.exec(raw);
    return m && Number(m[1]) > 0 ? [`${m[1]}${u}`] : [];
  });
  if (parts.length === 0) return raw.trim() || null;
  return `up ${parts.slice(0, 2).join(' ')}`;
}

const gb = (mb: number) => (mb / 1024).toFixed(1);

// ── LED ─────────────────────────────────────────────────

function Led({ tone, size = 12 }: { tone: Tone; size?: number }) {
  const on = tone !== 'off';
  const [fill, glow] = on ? LED_TONES[tone] : ['', ''];
  return (
    <span
      aria-hidden
      data-tone={tone}
      className={cn('inline-block shrink-0 rounded-full', !on && 'bg-fill-2')}
      style={{
        width: size,
        height: size,
        background: on ? fill : undefined,
        boxShadow: on ? `0 0 0 3px color-mix(in srgb, var(--color-label) 8%, transparent), 0 0 ${size}px ${glow}` : undefined,
      }}
    />
  );
}

// ── Dial ────────────────────────────────────────────────

const A0 = -100, A1 = 100;

/**
 * The Home hub's health dial at card size: a 200° arc, a dotted inner ring, the value arc
 * and a knob. Accent colour, amber from 75%, red from 90%. `value` null draws it empty (–).
 */
export function FleetDial({ label, value, detail, size = 'md' }: {
  label: string; value: number | null | undefined; detail?: string; size?: 'md' | 'lg';
}) {
  const v = value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
  const tone = levelTone(v);
  const colour = tone === 'red' ? 'var(--color-danger)' : tone === 'amber' ? 'var(--color-warning)' : 'var(--color-accent-solid)';
  const cx = 60, cy = 58, r = 46;
  const ka = A0 + (A1 - A0) * ((v ?? 0) / 100);
  const kx = cx + r * Math.sin((ka * Math.PI) / 180);
  const ky = cy - r * Math.cos((ka * Math.PI) / 180);
  const px = size === 'lg' ? 132 : 104;
  const scale = px / 120;

  return (
    <div className="flex min-w-0 flex-col items-center" data-testid={`dial-${label.toLowerCase()}`}>
      <div
        role="meter"
        aria-label={`${label} use`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v === null ? undefined : Math.round(v)}
        aria-valuetext={v === null ? 'No reading yet' : `${Math.round(v)}%`}
        className="relative"
        style={{ width: px, height: px * 0.72 }}
      >
        <svg viewBox="0 0 120 86" width={px} height={px * 0.72} className="absolute inset-0 overflow-visible">
          {/* the hub's centre disc, holding the number */}
          <circle cx={cx} cy={cy} r={28} className="fill-fill" />
          <path d={arcPath(cx, cy, 36, A0, A1)} fill="none" className="stroke-label-3" strokeOpacity={0.45} strokeWidth={4} strokeDasharray="1 3.4" />
          <path d={arcPath(cx, cy, r, A0, A1)} fill="none" className="stroke-fill-2" strokeWidth={7} strokeLinecap="round" />
          {v !== null && v > 0.5 && (
            <path d={arcPath(cx, cy, r, A0, ka)} fill="none" style={{ stroke: colour, transition: 'stroke .3s' }} strokeWidth={7} strokeLinecap="round" />
          )}
          {v !== null && (
            <circle data-knob cx={kx} cy={ky} r={6.5} style={{ fill: colour, transition: 'fill .3s' }} stroke="#fff" strokeWidth={3} filter="drop-shadow(0 1px 2px rgba(0,0,0,.35))" />
          )}
        </svg>
        {/* centred on the dial's centre, inside the disc */}
        <div
          className="absolute inset-x-0 flex items-baseline justify-center leading-none tabular-nums"
          style={{ top: cy * scale, transform: 'translateY(-50%)' }}
        >
          <span className={cn('font-semibold', size === 'lg' ? 'text-[24px]' : 'text-[19px]', v === null && 'text-label-3')}>
            {v === null ? '–' : Math.round(v)}
          </span>
          {v !== null && <span className={cn('text-label-2', size === 'lg' ? 'text-[12px]' : 'text-[10px]')}>%</span>}
        </div>
      </div>
      <div className={cn('font-medium text-label', size === 'lg' ? 'text-[13px]' : 'text-[12px]')}>{label}</div>
      <div className="max-w-full truncate text-[11px] text-label-3">{detail ?? ' '}</div>
    </div>
  );
}

// ── Server card ─────────────────────────────────────────

function ServerCard({ srv, onActivate }: { srv: FleetServerSummary; onActivate?: (id: string) => void }) {
  const setActiveServer = useAppStore(s => s.setActiveServer);
  const connectServer = useAppStore(s => s.connectServer);
  const openWindow = useDesktopStore(s => s.openWindow);
  const isConnected = srv.status === 'connected';
  const tone = fleetTone(srv);

  const open = () => {
    setActiveServer(srv.id);
    if (!isConnected) connectServer(srv.id);
    openWindow('dashboard', srv.id, `Dashboard — ${srv.name}`, 'dashboard');
    onActivate?.(srv.id);
  };

  const uptime = shortUptime(srv.system?.uptime);
  const statusText = isConnected ? 'Online' : srv.status === 'connecting' ? 'Connecting' : srv.status === 'error' ? 'Error' : 'Offline';

  // The name is the card's button, stretched over the whole card (so a click anywhere opens
  // it); Connect sits above it. A role="button" card would hide Connect from assistive tech.
  return (
    <Card
      data-testid={`fleet-card-${srv.id}`}
      className="relative p-5 transition-transform duration-150 has-[button:hover]:-translate-y-0.5 has-[button:hover]:outline has-[button:hover]:outline-1 has-[button:hover]:outline-accent-glow has-[.card-open:focus-visible]:outline has-[.card-open:focus-visible]:outline-2 has-[.card-open:focus-visible]:outline-accent-solid"
    >
      {/* Name, address and state */}
      <div className="flex items-center gap-3">
        <Led tone={tone} size={14} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={open}
            aria-label={`Open ${srv.name} (${statusText})`}
            className="card-open block max-w-full truncate text-left text-[17px] font-semibold leading-tight outline-none after:absolute after:inset-0 after:rounded-[22px] after:content-['']"
          >
            {srv.name}
          </button>
          <div className="truncate font-mono text-[11.5px] text-label-3">{srv.host}:{srv.port}</div>
        </div>
        <span className={cn('shrink-0 text-[12px] font-medium', isConnected ? 'text-success' : srv.status === 'error' ? 'text-danger' : 'text-label-3')}>
          {statusText}
        </span>
      </div>

      {/* The three dials */}
      <div className="mt-4 grid grid-cols-3 gap-1">
        <FleetDial label="CPU" value={srv.cpu?.usedPercent} detail={srv.cpu ? `${srv.cpu.cores} ${srv.cpu.cores === 1 ? 'core' : 'cores'}` : undefined} />
        <FleetDial label="Memory" value={srv.memory?.usedPercent} detail={srv.memory ? `${gb(srv.memory.usedMb)} / ${gb(srv.memory.totalMb)} GB` : undefined} />
        <FleetDial label="Disk" value={srv.disk?.usedPercent} detail={srv.disk ? `${srv.disk.usedGb} / ${srv.disk.totalGb} GB` : undefined} />
      </div>

      {srv.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {srv.tags.map(tag => (
            <span key={tag} className="rounded-full bg-fill px-2 py-0.5 text-[11px] text-label-2">{tag}</span>
          ))}
        </div>
      )}

      {/* Footer: what it runs and how fast it answers, or why it can't */}
      <div className="mt-4 flex min-h-8 items-center justify-between gap-3 border-t border-separator pt-3 text-[12px]">
        {srv.error ? (
          <span className="flex min-w-0 items-center gap-1.5 text-danger">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{srv.error}</span>
          </span>
        ) : isConnected ? (
          <span className="truncate text-label-2">{[srv.system?.os, uptime].filter(Boolean).join(' · ') || 'Connected'}</span>
        ) : (
          <span className="text-label-3">{srv.status === 'connecting' ? 'Connecting…' : 'Not connected'}</span>
        )}
        {isConnected && srv.latencyMs != null ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 font-mono text-[11px] text-label-2" title="Round trip for this refresh">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
            {srv.latencyMs} ms
          </span>
        ) : !isConnected && srv.status !== 'connecting' ? (
          <Button size="sm" variant="secondary" className="relative z-10" onClick={open}>
            Connect
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

// ── Fleet summary ───────────────────────────────────────

function FleetSummary({ data }: { data: FleetOverview }) {
  const t = data.totals;
  const memPct = t.totalMemoryMb > 0 ? (t.usedMemoryMb / t.totalMemoryMb) * 100 : null;
  const diskPct = t.totalDiskGb > 0 ? (t.usedDiskGb / t.totalDiskGb) * 100 : null;
  return (
    <Card className="p-5 sm:p-6" data-testid="fleet-summary">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="text-[13px] text-label-2">Servers online</div>
          <div className="mt-1 text-[40px] font-semibold leading-none tabular-nums">
            {t.connected}<span className="text-[24px] text-label-3">/{t.total}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.servers.map(s => (
              <span key={s.id} className="flex items-center gap-2 rounded-full bg-fill px-3 py-1.5 text-[12px]">
                <Led tone={fleetTone(s)} size={9} />
                {s.name}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-6">
          <FleetDial size="lg" label="CPU" value={t.avgCpuPercent} detail={t.connected > 1 ? 'average' : undefined} />
          <FleetDial size="lg" label="Memory" value={memPct} detail={t.totalMemoryMb > 0 ? `${gb(t.usedMemoryMb)} / ${gb(t.totalMemoryMb)} GB` : undefined} />
          <FleetDial size="lg" label="Disk" value={diskPct} detail={t.totalDiskGb > 0 ? `${Math.round(t.usedDiskGb)} / ${Math.round(t.totalDiskGb)} GB` : undefined} />
        </div>
      </div>
    </Card>
  );
}

/** "updated just now / 12 s ago / 3 min ago" */
export function updatedAgo(fetchedAt: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(fetchedAt).getTime()) / 1000));
  if (s < 5) return 'updated just now';
  if (s < 60) return `updated ${s} s ago`;
  return `updated ${Math.round(s / 60)} min ago`;
}

// ── Main View ───────────────────────────────────────────

interface FleetDashboardViewProps {
  /** Optional callback when a server card opens that server's desktop. */
  onServerActivated?: (serverId: string) => void;
}

export function FleetDashboardView({ onServerActivated }: FleetDashboardViewProps = {}) {
  const [data, setData] = useState<FleetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const cpuRetry = useRef(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetchFleetOverview();
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError('Failed to load fleet overview');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet overview');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // CPU needs two samples: when a connected server has none yet, ask again once, 2 s later
  useEffect(() => {
    if (!data || cpuRetry.current) return;
    const waiting = data.servers.some(s => s.status === 'connected' && s.cpu && s.cpu.usedPercent === null);
    if (!waiting) return;
    cpuRetry.current = true;
    const t = setTimeout(() => loadData(true), 2000);
    return () => clearTimeout(t);
  }, [data, loadData]);

  // Auto-refresh
  const autoRefreshInterval = usePreferencesStore(s => s.autoRefreshInterval);
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => loadData(true), Math.max(autoRefreshInterval, 30) * 1000);
    return () => clearInterval(interval);
  }, [loadData, autoRefreshInterval]);

  // Keep "updated … ago" current
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="h-64">
        <LoadingView label="Loading fleet overview…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <AlertCircle className="h-8 w-8 text-danger" strokeWidth={1.75} />
        <p className="text-sm text-label-2">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => loadData()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="h-full space-y-4 overflow-auto px-4 pb-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">Fleet</h2>
          <p className="mt-0.5 text-[13px] text-label-2" data-testid="fleet-subtitle">
            {data.totals.connected} of {data.totals.total} online · {updatedAgo(data.fetchedAt, now)}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => loadData(true)}
              disabled={refreshing}
            >
              <RotateCw className={refreshing ? 'animate-spin' : ''} strokeWidth={1.75} />
              Refresh
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh all server stats</TooltipContent>
        </Tooltip>
      </div>

      {data.servers.length === 0 ? (
        <div className="py-8 text-center text-sm text-label-2">
          No servers yet. Add one from Sessions.
        </div>
      ) : (
        <>
          <FleetSummary data={data} />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {data.servers.map(srv => (
              <ServerCard key={srv.id} srv={srv} onActivate={onServerActivated} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
