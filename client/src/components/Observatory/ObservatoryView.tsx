// EX4-D.1: Observatory View — main entry point
// EX8.6: transparent on the window glass, token status colours
// @see docs/phases/phase-ex4.md

import { useEffect } from 'react';
import { useObservatoryStore } from '../../store/observatory-store';
import { useObservatorySocket } from '../../hooks/useObservatorySocket';
import { TraceListView } from './TraceListView';
import { StatsPanel } from './StatsPanel';
import { TraceDetailView } from './TraceDetailView';
import { Wifi, WifiOff } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

export function ObservatoryView() {
  const {
    selectedTraceId,
    fetchTraces,
    fetchStats,
    clearSelection,
  } = useObservatoryStore();

  const { status } = useObservatorySocket();

  // Initial data fetch
  useEffect(() => {
    fetchTraces();
    fetchStats();
  }, [fetchTraces, fetchStats]);

  if (selectedTraceId) {
    return <TraceDetailView onBack={clearSelection} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Stats panel at top */}
      <StatsPanel />

      {/* Trace list fills remaining space */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <TraceListView />
      </div>

      {/* WS status indicator */}
      <div className="flex min-h-9 shrink-0 items-center gap-1.5 border-t border-border px-4 py-1.5 text-xs text-label-2">
        {status === 'connected' && (
          <>
            <Wifi className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
            <span>Live</span>
          </>
        )}
        {status === 'connecting' && (
          <>
            <Spinner className="h-[18px] w-[18px] text-accent-solid" />
            <span>Connecting...</span>
          </>
        )}
        {status === 'disconnected' && (
          <>
            <WifiOff className="h-3.5 w-3.5 text-danger" strokeWidth={1.75} />
            <span>Disconnected</span>
          </>
        )}
      </div>
    </div>
  );
}
