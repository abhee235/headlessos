// EX1.12: RefreshableWidget — wraps a widget with auto-refresh indicator
// @see docs/phases/phase-ex1.md

import { RefreshCw, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RefreshableWidgetProps {
  children: React.ReactNode;
  /** Whether a refresh is in progress */
  refreshing?: boolean;
  /** Whether refresh is paused */
  paused?: boolean;
  /** Pause callback */
  onPause?: () => void;
  /** Resume callback */
  onResume?: () => void;
  /** Manual refresh callback */
  onRefresh?: () => void;
  /** Show the refresh controls */
  showControls?: boolean;
}

export function RefreshableWidget({
  children,
  refreshing = false,
  paused = false,
  onPause,
  onResume,
  onRefresh,
  showControls = true,
}: RefreshableWidgetProps) {
  return (
    <div className="relative group">
      {/* Subtle pulse overlay during refresh */}
      {refreshing && (
        <div className="absolute inset-0 z-10 pointer-events-none rounded-lg bg-primary/5 animate-pulse" />
      )}

      {children}

      {/* Refresh controls — shown on hover */}
      {showControls && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 z-20">
          {paused ? (
            <button
              onClick={onResume}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
              title="Resume auto-refresh"
            >
              <Play className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={onPause}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
              title="Pause auto-refresh"
            >
              <Pause className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={onRefresh}
            className={cn(
              'p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground',
              refreshing && 'animate-spin',
            )}
            title="Refresh now"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
