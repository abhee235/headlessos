// M2.2: System Dashboard — main view
// @see docs/phases/phase-2.md

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Clock, Zap, AlertCircle } from 'lucide-react';
import type { SystemDashboardData, SystemDashboardResponse } from '../../lib/api';
import { fetchSystemDashboard } from '../../lib/api';
import { DisconnectedState } from '@/components/ui/disconnected-state';
import { DiskCard } from './DiskCard';
import { MemoryCard } from './MemoryCard';
import { NetworkCard } from './NetworkCard';
import { UptimeCard } from './UptimeCard';

interface DashboardViewProps {
  serverId: string;
}

export function DashboardView({ serverId }: DashboardViewProps) {
  const [data, setData] = useState<SystemDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response: SystemDashboardResponse = await fetchSystemDashboard(serverId);
      if (response.success && response.data) {
        setData(response.data);
        setLastUpdated(new Date());
        setLatencyMs(response.totalLatencyMs ?? null);
      } else {
        setError(response.error ?? 'Failed to load dashboard data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverId]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => loadData(true), 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading system data…</span>
        </div>
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
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive mb-3">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-3 py-1.5 text-xs bg-secondary hover:bg-accent text-secondary-foreground rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No dashboard data available</p>
          <button
            onClick={() => loadData()}
            className="mt-3 px-3 py-1.5 text-xs bg-secondary hover:bg-accent text-secondary-foreground rounded"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {data.system.hostname}
          </h2>
          <p className="text-xs text-muted-foreground">
            {data.system.os} · {data.system.kernel} · {data.system.architecture}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {latencyMs !== null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Zap className="w-3 h-3" />
              {latencyMs}ms
            </span>
          )}
          {lastUpdated && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(lastUpdated)}
            </span>
          )}
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UptimeCard system={data.system} />
        <MemoryCard memory={data.memory} />
      </div>

      <DiskCard disks={data.disks} />
      <NetworkCard interfaces={data.network} />
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
