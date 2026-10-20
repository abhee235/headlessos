// M7.1: Task Manager — main container with sidebar navigation and tab views
// EX8.6: LumenOS v3 restyle — PaneSidebar with pinned CPU / Memory / Disk meters,
// summary tiles above the process table.
// @see docs/phases/phase-7.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, AlertCircle, List, type LucideIcon } from 'lucide-react';
import { LoadingView } from '@/components/ui/loading-view';
import { Button } from '@/components/ui/button';
import { PaneSidebar, PaneSidebarItem } from '@/components/ui/pane-sidebar';
import type {
  TaskManagerData,
  TaskManagerResponse,
} from '../../lib/api';
import { fetchTaskManager } from '../../lib/api';
import { DisconnectedState } from '@/components/ui/disconnected-state';
import { ProcessesTab } from './ProcessesTab';
import { PerformanceTab } from './PerformanceTab';
import { Meter, SERIES, Sparkline, formatBytesPerSec, formatMb } from './parts';

/** Task Manager live refresh period */
const LIVE_REFRESH_MS = 2000;

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'processes' | 'performance';

interface SidebarEntry {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: SidebarEntry[] = [
  { id: 'processes', label: 'Processes', icon: List },
  { id: 'performance', label: 'Performance', icon: Activity },
];

// ─── Task Manager View ──────────────────────────────────────────────────────

interface TaskManagerViewProps {
  serverId: string;
}

export function TaskManagerView({ serverId }: TaskManagerViewProps) {
  const [tab, setTab] = useState<TabId>('processes');
  const [data, setData] = useState<TaskManagerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Performance history (keep last 60 data points = 60 seconds at 1s refresh)
  const [cpuHistory, setCpuHistory] = useState<Array<Record<string, number>>>([]);
  const [memHistory, setMemHistory] = useState<Array<{ time: number; value: number }>>([]);
  const [netHistory, setNetHistory] = useState<Array<{ time: number; rx: number; tx: number }>>([]);
  const [diskHistory, setDiskHistory] = useState<Array<{ time: number; read: number; write: number }>>([]);
  const prevNetRef = useRef<{ rxBytes: number; txBytes: number } | null>(null);
  const prevDiskRef = useRef<{ readBytes: number; writeBytes: number } | null>(null);
  const tickRef = useRef(0);
  const pauseRefreshRef = useRef(false);

  const MAX_HISTORY = 60;

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res: TaskManagerResponse = await fetchTaskManager(serverId);
        if (res.success && res.data) {
          setData(res.data);

          const now = tickRef.current++;

          // CPU history — overall + per-core
          setCpuHistory((prev) => {
            const point: Record<string, number> = { time: now, value: res.data!.cpu.overallPercent };
            for (const core of res.data!.cpu.cores) {
              point[`core${core.id}`] = core.percent;
            }
            const next = [...prev, point];
            return next.slice(-MAX_HISTORY);
          });

          // Memory history
          const memPercent =
            res.data.memory.totalMb > 0
              ? (res.data.memory.usedMb / res.data.memory.totalMb) * 100
              : 0;
          setMemHistory((prev) => {
            const next = [...prev, { time: now, value: Math.round(memPercent * 10) / 10 }];
            return next.slice(-MAX_HISTORY);
          });

          // Network I/O delta (bytes/sec)
          const totalRx = res.data.networkIo.reduce((s, n) => s + n.rxBytes, 0);
          const totalTx = res.data.networkIo.reduce((s, n) => s + n.txBytes, 0);
          if (prevNetRef.current) {
            const rxDelta = Math.max(0, totalRx - prevNetRef.current.rxBytes);
            const txDelta = Math.max(0, totalTx - prevNetRef.current.txBytes);
            setNetHistory((prev) => {
              const next = [...prev, { time: now, rx: rxDelta, tx: txDelta }];
              return next.slice(-MAX_HISTORY);
            });
          }
          prevNetRef.current = { rxBytes: totalRx, txBytes: totalTx };

          // Disk I/O delta
          const totalRead = res.data.diskIo.reduce((s, d) => s + d.readBytes, 0);
          const totalWrite = res.data.diskIo.reduce((s, d) => s + d.writeBytes, 0);
          if (prevDiskRef.current) {
            const readDelta = Math.max(0, totalRead - prevDiskRef.current.readBytes);
            const writeDelta = Math.max(0, totalWrite - prevDiskRef.current.writeBytes);
            setDiskHistory((prev) => {
              const next = [...prev, { time: now, read: readDelta, write: writeDelta }];
              return next.slice(-MAX_HISTORY);
            });
          }
          prevDiskRef.current = { readBytes: totalRead, writeBytes: totalWrite };
        } else {
          setError(res.error ?? 'Failed to fetch data');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch task manager data');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [serverId],
  );

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Live refresh every 2 seconds (paused while a context menu is open).
  // The server caps concurrent SSH channels, so this can't exhaust MaxSessions.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!pauseRefreshRef.current) loadData(true);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="h-full">
        <LoadingView label="Loading task manager…" />
      </div>
    );
  }

  // ── Disconnected state ──
  const isDisconnected = error && /not connected/i.test(error);
  if (isDisconnected) {
    return (
      <DisconnectedState
        serverId={serverId}
        onReconnected={() => loadData()}
        message="The SSH connection to this server was lost. Reconnect to view task manager."
      />
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
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

  if (!data) return null;

  // ── Derived values for the sidebar meters and summary tiles ──
  const memPct = data.memory.totalMb > 0 ? (data.memory.usedMb / data.memory.totalMb) * 100 : 0;
  const diskRates = diskHistory.map((d) => d.read + d.write);
  const diskNow = diskRates[diskRates.length - 1] ?? 0;
  const diskPeak = Math.max(1, ...diskRates);
  const netSeries = netHistory.map((n) => ({ time: n.time, value: n.rx + n.tx }));
  const netNow = netSeries[netSeries.length - 1]?.value ?? 0;
  const { running, total } = data.cpu.processes;

  return (
    <div className="flex h-full">
      {/* ── Sidebar ── */}
      <PaneSidebar
        width={208}
        aria-label="Task Manager"
        footer={
          <div className="flex flex-col gap-3 pb-1">
            <SidebarMeter
              label="CPU"
              value={`${Math.round(data.cpu.overallPercent)}%`}
              pct={data.cpu.overallPercent}
            />
            <SidebarMeter
              label="Memory"
              value={`${Math.round(memPct)}%`}
              pct={memPct}
              fillClassName={SERIES.memory.bg}
            />
            <SidebarMeter
              label="Disk"
              value={formatBytesPerSec(diskNow)}
              pct={(diskNow / diskPeak) * 100}
              fillClassName={SERIES.disk.bg}
              title="Disk I/O, relative to the peak over the last minute"
            />
          </div>
        }
      >
        {TABS.map((entry) => (
          <PaneSidebarItem
            key={entry.id}
            icon={entry.icon}
            label={entry.label}
            active={tab === entry.id}
            onClick={() => setTab(entry.id)}
          />
        ))}
      </PaneSidebar>

      {/* ── Content area ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-3.5 pb-2">
        {tab === 'processes' && (
          <>
            <div className="mb-3 grid shrink-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
              <SummaryTile label="CPU" value={`${data.cpu.overallPercent.toFixed(1)}%`}>
                <Sparkline data={cpuHistory} dataKey="value" color={SERIES.cpu.color} domain={[0, 100]} />
              </SummaryTile>
              <SummaryTile label="Memory" value={formatMb(data.memory.usedMb)}>
                <Sparkline data={memHistory} dataKey="value" color={SERIES.memory.color} domain={[0, 100]} />
              </SummaryTile>
              <SummaryTile label="Running" value={`${running} of ${total}`}>
                <Meter value={total > 0 ? (running / total) * 100 : 0} fillClassName="bg-success" className="mb-1" />
              </SummaryTile>
              <SummaryTile label="Network" value={formatBytesPerSec(netNow)}>
                <Sparkline data={netSeries} dataKey="value" color={SERIES.network.color} />
              </SummaryTile>
            </div>
            <div className="min-h-0 flex-1">
              <ProcessesTab
                processes={data.processes}
                serverId={serverId}
                onRefresh={() => loadData(true)}
                refreshing={refreshing}
                onContextMenuOpenChange={(open: boolean) => { pauseRefreshRef.current = open; }}
              />
            </div>
          </>
        )}
        {tab === 'performance' && (
          <PerformanceTab
            cpu={data.cpu}
            memory={data.memory}
            networkIo={data.networkIo}
            diskIo={data.diskIo}
            cpuHistory={cpuHistory}
            memHistory={memHistory}
            netHistory={netHistory}
            diskHistory={diskHistory}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sidebar meter: label + value on one line, 6px bar underneath ───────────

function SidebarMeter({
  label,
  value,
  pct,
  fillClassName,
  title,
}: {
  label: string;
  value: string;
  pct: number;
  fillClassName?: string;
  title?: string;
}) {
  return (
    <div title={title}>
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="text-label-2">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <Meter value={pct} fillClassName={fillClassName} />
    </div>
  );
}

// ─── Summary tile: label, big number, sparkline / meter ─────────────────────

function SummaryTile({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="lumen-card flex min-w-0 flex-col rounded-[20px] px-4 pb-3 pt-3.5">
      <span className="text-[13px] text-label-2">{label}</span>
      <span className="mt-0.5 truncate text-[24px] font-bold leading-tight tracking-[-0.02em] tabular-nums">
        {value}
      </span>
      <div className="mt-auto pt-2">{children}</div>
    </div>
  );
}
