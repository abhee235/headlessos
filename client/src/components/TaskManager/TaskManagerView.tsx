// M7.1: Task Manager — Windows 11-style Task Manager
// Main container with sidebar navigation and tab views
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  MemoryStick,
  Users,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import type {
  TaskManagerData,
  TaskManagerResponse,
} from '../../lib/api';
import { fetchTaskManager } from '../../lib/api';
import { useDesktopStore } from '../../store/window-store';
import { DisconnectedState } from '@/components/ui/disconnected-state';
import { cn } from '@/lib/utils';
import { ProcessesTab } from './ProcessesTab';
import { PerformanceTab } from './PerformanceTab';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'processes' | 'performance';

interface SidebarEntry {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: SidebarEntry[] = [
  { id: 'processes', label: 'Processes', icon: Activity },
  { id: 'performance', label: 'Performance', icon: Cpu },
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

  // Auto-refresh every 3 seconds (paused while a context menu is open)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!pauseRefreshRef.current) loadData(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading task manager…</span>
        </div>
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
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive mb-3">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-3 py-1.5 text-xs bg-secondary hover:bg-accent text-foreground rounded-md"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex h-full bg-background">
      {/* ── Sidebar — Finder-inspired ── */}
      <nav className="w-50 shrink-0 border-r border-border/40 overflow-y-auto pt-1.5">
        <div className="px-4 pt-2.5 pb-1.5 text-[11px] font-semibold text-foreground/50 tracking-wide">
          Task Manager
        </div>
        <div className="px-3 pb-2">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const isActive = tab === entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => setTab(entry.id)}
                className={cn(
                  'flex items-center gap-2 w-full px-2.5 py-2 text-[13px] rounded-md transition-colors outline-none',
                  isActive
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-foreground hover:bg-accent/50',
                )}
              >
                <Icon size={20} strokeWidth={1.6} className={cn('shrink-0', isActive && 'text-primary')} />
                {entry.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Content area ── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {tab === 'processes' && (
          <ProcessesTab
            processes={data.processes}
            serverId={serverId}
            onRefresh={() => loadData(true)}
            refreshing={refreshing}
            onContextMenuOpenChange={(open: boolean) => { pauseRefreshRef.current = open; }}
          />
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
