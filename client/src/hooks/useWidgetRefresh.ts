// EX1.12: useWidgetRefresh — manages auto-refresh for widgets with dataSource
// @see docs/phases/phase-ex1.md

import { useState, useEffect, useRef, useCallback } from 'react';
import { refreshWidgetData } from '@/lib/api';

interface DataSource {
  command: string;
  refreshInterval: number;
  parseMode: 'json' | 'text';
}

interface UseWidgetRefreshOptions {
  /** Server ID to run commands against */
  serverId: string | null;
  /** The widget's dataSource config */
  dataSource?: DataSource | null;
  /** Called when new data arrives */
  onData?: (data: unknown, rawOutput: string) => void;
}

interface UseWidgetRefreshResult {
  /** Whether a refresh is currently in progress */
  refreshing: boolean;
  /** Whether auto-refresh is paused */
  paused: boolean;
  /** Pause auto-refresh */
  pause: () => void;
  /** Resume auto-refresh */
  resume: () => void;
  /** Trigger a manual refresh */
  refresh: () => void;
  /** Last error, if any */
  error: string | null;
  /** Timestamp of last successful refresh */
  lastRefreshAt: number | null;
}

/**
 * Hook that manages auto-refresh for widgets with a `dataSource` config.
 * When enabled, periodically runs the specified command and calls `onData`
 * with the result.
 */
export function useWidgetRefresh({
  serverId,
  dataSource,
  onData,
}: UseWidgetRefreshOptions): UseWidgetRefreshResult {
  const [refreshing, setRefreshing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDataRef = useRef(onData);

  // Keep onData ref up-to-date
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  const doRefresh = useCallback(async () => {
    if (!serverId || !dataSource) return;

    setRefreshing(true);
    setError(null);

    try {
      const result = await refreshWidgetData(
        serverId,
        dataSource.command,
        dataSource.parseMode ?? 'text',
      );

      if (result.success) {
        setLastRefreshAt(Date.now());
        onDataRef.current?.(result.data, result.rawOutput);
      } else {
        setError('Refresh failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, [serverId, dataSource]);

  // Set up interval
  useEffect(() => {
    if (!dataSource || !serverId || paused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const interval = Math.max(5000, dataSource.refreshInterval ?? 30000);
    intervalRef.current = setInterval(doRefresh, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [dataSource, serverId, paused, doRefresh]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  return {
    refreshing,
    paused,
    pause,
    resume,
    refresh: doRefresh,
    error,
    lastRefreshAt,
  };
}
