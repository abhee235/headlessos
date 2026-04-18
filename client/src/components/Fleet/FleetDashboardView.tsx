// M11.1: Fleet Dashboard — Multi-server overview with aggregate stats
// @see docs/PROGRESS.md

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  HardDrive,
  MemoryStick,
  Server,
  Clock,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { fetchFleetOverview, type FleetOverview, type FleetServerSummary } from '../../lib/api';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore } from '../../store/window-store';
import { usePreferencesStore } from '../../store/preferences-store';
import { Progress } from '@/components/ui/progress';
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
      className="cursor-pointer transition-all hover:ring-1 hover:ring-primary/30 hover:shadow-md"
      onClick={handleOpenDashboard}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isConnected
                ? 'bg-success'
                : srv.status === 'connecting'
                  ? 'bg-warning animate-pulse'
                  : 'bg-muted-foreground/30'
            }`}
          />
          <CardTitle className="text-sm font-semibold truncate">{srv.name}</CardTitle>
        </div>
        <Badge
          variant={isConnected ? 'success' : 'secondary'}
          className="text-[10px] shrink-0"
        >
          {isConnected ? 'Online' : 'Offline'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Host info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Server className="w-3 h-3 shrink-0" />
          <span className="truncate">{srv.host}:{srv.port}</span>
        </div>

        {/* System info */}
        {srv.system && (
          <div className="space-y-1">
            <div className="text-[11px] text-foreground/70 font-medium truncate">
              {srv.system.hostname} · {srv.system.os}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-2.5 h-2.5" />
              <span>{srv.system.uptime}</span>
            </div>
          </div>
        )}

        {/* Memory bar */}
        {srv.memory && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1 text-muted-foreground">
                <MemoryStick className="w-3 h-3" />
                <span>Memory</span>
              </div>
              <span className="font-medium text-foreground/80">
                {srv.memory.usedPercent}%
              </span>
            </div>
            <Progress
              value={srv.memory.usedPercent}
              className="h-1.5"
            />
            <div className="text-[10px] text-muted-foreground">
              {srv.memory.usedMb} MB / {srv.memory.totalMb} MB
            </div>
          </div>
        )}

        {/* Disk bar */}
        {srv.disk && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1 text-muted-foreground">
                <HardDrive className="w-3 h-3" />
                <span>Disk</span>
              </div>
              <span className="font-medium text-foreground/80">
                {srv.disk.usedPercent}%
              </span>
            </div>
            <Progress
              value={srv.disk.usedPercent}
              className="h-1.5"
            />
            <div className="text-[10px] text-muted-foreground">
              {srv.disk.usedGb} GB / {srv.disk.totalGb} GB
            </div>
          </div>
        )}

        {/* Tags */}
        {srv.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {srv.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                <Tag className="w-2 h-2 mr-0.5" />
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Disconnected state */}
        {!isConnected && !srv.system && (
          <div className="flex items-center gap-2 py-2 text-muted-foreground">
            <WifiOff className="w-4 h-4" />
            <span className="text-xs">Not connected — click to connect</span>
          </div>
        )}

        {/* Error */}
        {srv.error && (
          <div className="flex items-center gap-1.5 text-destructive text-[11px]">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span className="truncate">{srv.error}</span>
          </div>
        )}

        {/* Latency */}
        {srv.latencyMs != null && (
          <div className="text-[10px] text-muted-foreground text-right">
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          <div>
            <div className="text-lg font-bold">{totals.connected}/{totals.total}</div>
            <div className="text-[11px] text-muted-foreground">Servers Online</div>
          </div>
        </div>
      </Card>
      <Card className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-success" />
          <div>
            <div className="text-lg font-bold">{totals.connected}</div>
            <div className="text-[11px] text-muted-foreground">Connected</div>
          </div>
        </div>
      </Card>
      <Card className="py-3 px-4">
        <div className="flex items-center gap-2">
          <MemoryStick className="w-4 h-4 text-primary" />
          <div>
            <div className="text-lg font-bold">{memPercent}%</div>
            <div className="text-[11px] text-muted-foreground">
              Memory ({Math.round(totals.usedMemoryMb / 1024 * 10) / 10}/{Math.round(totals.totalMemoryMb / 1024 * 10) / 10} GB)
            </div>
          </div>
        </div>
      </Card>
      <Card className="py-3 px-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-warning" />
          <div>
            <div className="text-lg font-bold">{diskPercent}%</div>
            <div className="text-[11px] text-muted-foreground">
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
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading fleet overview…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-8 h-8 text-destructive/60" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => loadData()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 space-y-4 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Fleet Overview</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => loadData(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh all server stats</TooltipContent>
        </Tooltip>
      </div>

      {/* Totals */}
      <TotalsBar totals={data.totals} />

      {/* Server grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data.servers.map(srv => (
          <ServerCard key={srv.id} srv={srv} onActivate={onServerActivated} />
        ))}
      </div>

      {data.servers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No servers configured. Add servers in Settings.
        </div>
      )}
    </div>
  );
}
