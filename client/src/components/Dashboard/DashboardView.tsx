// M2.2: System Dashboard — main view
// EX8.6: LumenOS v3 — host header with a status dot, latency / updated chips and a
// spinning refresh button; Processor · Memory · System on top, Disk · Network below.
// CPU load and network rates come from the existing Task Manager endpoint, fetched
// alongside the system dashboard on the same refresh timer.
// @see docs/phases/phase-2.md, docs/phases/phase-ex8.md

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { RefreshCw, Clock, Zap, AlertCircle } from 'lucide-react';
import { LoadingView } from '@/components/ui/loading-view';
import { Button } from '@/components/ui/button';
import type { CpuStatsData, SystemDashboardData } from '../../lib/api';
import { fetchSystemDashboard, fetchTaskManager } from '../../lib/api';
import { usePreferencesStore } from '../../store/preferences-store';
import { DisconnectedState } from '@/components/ui/disconnected-state';
import { cn } from '@/lib/utils';
import { DiskCard } from './DiskCard';
import { MemoryCard } from './MemoryCard';
import { NetworkCard, type NetRatePoint } from './NetworkCard';
import { ProcessorCard } from './ProcessorCard';
import { UptimeCard } from './UptimeCard';

interface DashboardViewProps {
  serverId: string;
}

/** Network throughput samples kept for the Network card's area chart. */
const NET_HISTORY = 40;

export function DashboardView({ serverId }: DashboardViewProps) {
  const [data, setData] = useState<SystemDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cpu, setCpu] = useState<CpuStatsData | null>(null);
  const [netHistory, setNetHistory] = useState<NetRatePoint[]>([]);
  const prevNetRef = useRef<{ rx: number; tx: number; at: number } | null>(null);

  // A different server starts a fresh CPU / throughput series
  useEffect(() => {
    setCpu(null);
    setNetHistory([]);
    prevNetRef.current = null;
  }, [serverId]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    // allSettled: a Task Manager failure never blanks the dashboard, and vice versa
    const [sysResult, tmResult] = await Promise.allSettled([
      fetchSystemDashboard(serverId),
      fetchTaskManager(serverId),
    ]);

    if (sysResult.status === 'fulfilled') {
      const response = sysResult.value;
      if (response.success && response.data) {
        setData(response.data);
        setLastUpdated(new Date());
        setLatencyMs(response.totalLatencyMs ?? null);
      } else {
        setError(response.error ?? 'Failed to load dashboard data');
      }
    } else {
      const err = sysResult.reason;
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    }

    if (tmResult.status === 'fulfilled' && tmResult.value.success && tmResult.value.data) {
      const tm = tmResult.value.data;
      setCpu(tm.cpu);

      // Throughput = byte-counter delta / wall time between samples
      const rx = tm.networkIo.reduce((s, n) => s + n.rxBytes, 0);
      const tx = tm.networkIo.reduce((s, n) => s + n.txBytes, 0);
      const at = Date.now();
      const prev = prevNetRef.current;
      const secs = prev ? (at - prev.at) / 1000 : 0;
      // Samples closer than 1s (overlapping loads) would give a spiky rate — keep the
      // older baseline and wait for the next one.
      if (!prev || secs >= 1) {
        if (prev) {
          const point: NetRatePoint = {
            time: at,
            rx: Math.max(0, rx - prev.rx) / secs,
            tx: Math.max(0, tx - prev.tx) / secs,
          };
          setNetHistory((h) => [...h, point].slice(-NET_HISTORY));
        }
        prevNetRef.current = { rx, tx, at };
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [serverId]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh based on preference
  const autoRefreshInterval = usePreferencesStore(s => s.autoRefreshInterval);
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => loadData(true), autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [loadData, autoRefreshInterval]);

  // Loading state
  if (loading) {
    return (
      <div className="h-64">
        <LoadingView label="Loading system data…" />
      </div>
    );
  }

  // Disconnected state
  const isDisconnected = error && /not connected/i.test(error);
  if (isDisconnected) {
    return (
      <DisconnectedState
        serverId={serverId}
        onReconnected={() => loadData()}
        message="The SSH connection to this server was lost. Reconnect to view the dashboard."
      />
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-danger" strokeWidth={1.75} />
          <p className="mb-3 text-[13px] text-danger">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => loadData()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-2 h-8 w-8 text-label-3" strokeWidth={1.75} />
          <p className="text-[13px] text-label-2">No dashboard data available</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => loadData()}>
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success ring-4 ring-success/20" aria-hidden />
            <h2 className="truncate text-[30px] font-bold leading-tight tracking-[-0.02em] text-foreground">
              {data.system.hostname}
            </h2>
          </div>
          <p className="truncate pl-[22px] text-[13px] text-label-2">
            {data.system.os} · {data.system.kernel} · {data.system.architecture}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1.5">
          {latencyMs !== null && (
            <HeaderChip icon={<Zap strokeWidth={1.75} />} title="Latency">
              {latencyMs} ms
            </HeaderChip>
          )}
          {lastUpdated && (
            <HeaderChip icon={<Clock strokeWidth={1.75} />} title="Last updated">
              {formatTimeAgo(lastUpdated)}
            </HeaderChip>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="disabled:opacity-100"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw
              strokeWidth={1.75}
              className={cn('text-label-2', refreshing && 'animate-spin motion-reduce:animate-none')}
            />
          </Button>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
        <ProcessorCard cpu={cpu} />
        <MemoryCard memory={data.memory} />
        <UptimeCard system={data.system} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <DiskCard disks={data.disks} />
        <NetworkCard interfaces={data.network} history={netHistory} />
      </div>
    </div>
  );
}

/** Glass pill in the header (latency, last updated). */
function HeaderChip({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-edge bg-mat px-3.5 text-[13px] font-medium tabular-nums text-foreground shadow-[var(--lumen-spec)] [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:text-label-2"
    >
      {icon}
      {children}
    </span>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
