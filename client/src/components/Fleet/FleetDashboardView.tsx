// M11.1: Fleet Dashboard — Multi-server overview with aggregate stats
// EX8.6: Lumen cards, big-number totals, 6px threshold meters, token status colours
// @see docs/PROGRESS.md

import { useEffect, useState, useCallback } from 'react';
import {
  RotateCw,
  Wifi,
  WifiOff,
  HardDrive,
  MemoryStick,
  Server,
  Clock,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';
import { fetchFleetOverview, type FleetOverview, type FleetServerSummary } from '../../lib/api';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore } from '../../store/window-store';
import { usePreferencesStore } from '../../store/preferences-store';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Meter, toneForPercent } from '@/components/DynamicUI/widgets/widget-card';
import { cn } from '@/lib/utils';

/** Icon chip used by the totals cards */
const TOTAL_ICON_CLASS = 'grid h-9 w-9 shrink-0 place-items-center rounded-full border';

// ── Server Card ─────────────────────────────────────────

function ServerCard({ srv, onActivate }: { srv: FleetServerSummary; onActivate?: (id: string) => void }) {
  const setActiveServer = useAppStore(s => s.setActiveServer);
  const connectServer = useAppStore(s => s.connectServer);
  const openWindow = useDesktopStore(s => s.openWindow);
  const isConnected = srv.status === 'connected';

  const handleOpenDashboard = () => {
    setActiveServer(srv.id);
    if (!isConnected) {
      connectServer(srv.id);
    }
    openWindow('dashboard', srv.id, `Dashboard — ${srv.name}`, 'dashboard');
    onActivate?.(srv.id);
  };

  return (
    <Card
      className="cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:outline hover:outline-1 hover:outline-accent-glow"
      onClick={handleOpenDashboard}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              isConnected
                ? 'bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_18%,transparent)]'
                : srv.status === 'connecting'
                  ? 'animate-pulse bg-warning'
                  : 'bg-label-3',
            )}
          />
          <CardTitle className="truncate text-[15px]">{srv.name}</CardTitle>
        </div>
        <Badge
          variant={isConnected ? 'success' : 'secondary'}
          className="shrink-0"
        >
          {isConnected ? 'Online' : 'Offline'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {/* Host info */}
        <div className="flex items-center gap-2 text-xs text-label-2">
          <Server className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="truncate font-mono">{srv.host}:{srv.port}</span>
        </div>

        {/* System info */}
        {srv.system && (
          <div className="space-y-1">
            <div className="truncate text-xs font-semibold text-foreground">
              {srv.system.hostname} · {srv.system.os}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-label-3">
              <Clock className="h-3 w-3" strokeWidth={1.75} />
              <span>{srv.system.uptime}</span>
            </div>
          </div>
        )}

        {/* Memory bar */}
        {srv.memory && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-label-2">
                <MemoryStick className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Memory</span>
              </div>
              <span className="font-semibold text-foreground">
                {srv.memory.usedPercent}%
              </span>
            </div>
            <Meter value={srv.memory.usedPercent} tone={toneForPercent(srv.memory.usedPercent)} aria-label="Memory" />
            <div className="text-[11px] text-label-3">
              {srv.memory.usedMb} MB / {srv.memory.totalMb} MB
            </div>
          </div>
        )}

        {/* Disk bar */}
        {srv.disk && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-label-2">
                <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Disk</span>
              </div>
              <span className="font-semibold text-foreground">
                {srv.disk.usedPercent}%
              </span>
            </div>
            <Meter value={srv.disk.usedPercent} tone={toneForPercent(srv.disk.usedPercent)} aria-label="Disk" />
            <div className="text-[11px] text-label-3">
              {srv.disk.usedGb} GB / {srv.disk.totalGb} GB
            </div>
          </div>
        )}

        {/* Tags */}
        {srv.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {srv.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                <Tag className="h-2.5 w-2.5" strokeWidth={1.75} />
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Disconnected state */}
        {!isConnected && !srv.system && (
          <div className="flex items-center gap-2 py-2 text-label-2">
            <WifiOff className="h-4 w-4" strokeWidth={1.75} />
            <span className="text-xs">Not connected — click to connect</span>
          </div>
        )}

        {/* Error */}
        {srv.error && (
          <div className="flex items-center gap-1.5 text-xs text-danger">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{srv.error}</span>
          </div>
        )}

        {/* Latency */}
        {srv.latencyMs != null && (
          <div className="text-right font-mono text-[11px] text-label-3">
            {srv.latencyMs}ms
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Aggregate Totals Bar ────────────────────────────────

function TotalsBar({ totals }: { totals: FleetOverview['totals'] }) {
  const memPercent = totals.totalMemoryMb > 0
    ? Math.round((totals.usedMemoryMb / totals.totalMemoryMb) * 100)
    : 0;
  const diskPercent = totals.totalDiskGb > 0
    ? Math.round((totals.usedDiskGb / totals.totalDiskGb) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={cn(TOTAL_ICON_CLASS, 'border-accent-solid/30 bg-accent-solid/14 text-accent-text')}>
            <Server className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="text-[28px] font-bold leading-none tracking-[-0.02em]">{totals.connected}/{totals.total}</div>
            <div className="mt-1 truncate text-xs text-label-2">Servers Online</div>
          </div>
        </div>
      </Card>
      <Card className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={cn(TOTAL_ICON_CLASS, 'border-success/30 bg-success/14 text-success')}>
            <Wifi className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="text-[28px] font-bold leading-none tracking-[-0.02em]">{totals.connected}</div>
            <div className="mt-1 truncate text-xs text-label-2">Connected</div>
          </div>
        </div>
      </Card>
      <Card className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={cn(TOTAL_ICON_CLASS, 'border-accent-solid/30 bg-accent-solid/14 text-accent-text')}>
            <MemoryStick className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="text-[28px] font-bold leading-none tracking-[-0.02em]">{memPercent}%</div>
            <div className="mt-1 truncate text-xs text-label-2">
              Memory ({Math.round(totals.usedMemoryMb / 1024 * 10) / 10}/{Math.round(totals.totalMemoryMb / 1024 * 10) / 10} GB)
            </div>
          </div>
        </div>
      </Card>
      <Card className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={cn(TOTAL_ICON_CLASS, 'border-warning/30 bg-warning/14 text-warning')}>
            <HardDrive className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="text-[28px] font-bold leading-none tracking-[-0.02em]">{diskPercent}%</div>
            <div className="mt-1 truncate text-xs text-label-2">
              Disk ({totals.usedDiskGb}/{totals.totalDiskGb} GB)
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Main View ───────────────────────────────────────────

interface FleetDashboardViewProps {
  /** Optional callback when a server card's Open Dashboard is clicked. */
  onServerActivated?: (serverId: string) => void;
}

export function FleetDashboardView({ onServerActivated }: FleetDashboardViewProps = {}) {
  const [data, setData] = useState<FleetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  // Auto-refresh
  const autoRefreshInterval = usePreferencesStore(s => s.autoRefreshInterval);
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => loadData(true), Math.max(autoRefreshInterval, 30) * 1000);
    return () => clearInterval(interval);
  }, [loadData, autoRefreshInterval]);

  if (loading) {
    return (
      <div className="h-64">
        <LoadingView label="Loading fleet overview…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">Fleet Overview</h2>
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

      {/* Totals */}
      <TotalsBar totals={data.totals} />

      {/* Server grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.servers.map(srv => (
          <ServerCard key={srv.id} srv={srv} onActivate={onServerActivated} />
        ))}
      </div>

      {data.servers.length === 0 && (
        <div className="py-8 text-center text-sm text-label-2">
          No servers configured. Add servers in Settings.
        </div>
      )}
    </div>
  );
}
