// EX4-D.1: Observatory View — main entry point
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
    <div className="flex flex-col h-full bg-[rgb(var(--background))]">
      {/* Stats panel at top */}
      <StatsPanel />

      {/* Trace list fills remaining space */}
      <div className="flex-1 overflow-hidden">
        <TraceListView />
      </div>

      {/* WS status indicator */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-t border-[rgb(var(--border))] text-xs text-[rgb(var(--muted-foreground))]">
        {status === 'connected' && (
          <>
            <Wifi className="w-3 h-3 text-emerald-500" />
            <span>Live</span>
          </>
        )}
        {status === 'connecting' && (
          <>
            <Spinner className="w-3 h-3" />
            <span>Connecting...</span>
          </>
        )}
        {status === 'disconnected' && (
          <>
            <WifiOff className="w-3 h-3 text-red-500" />
            <span>Disconnected</span>
          </>
        )}
      </div>
    </div>
  );
}
