// EX1.12: RefreshableWidget — wraps a widget with auto-refresh indicator
// EX8.6: Lumen hover controls (glass pill of round icon buttons)
// @see docs/phases/phase-ex1.md

import { RefreshCw, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONTROL_CLASS =
  'grid h-6 w-6 place-items-center rounded-full text-label-2 transition-colors duration-150 hover:bg-fill hover:text-foreground';

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
    <div className="group relative h-full">
      {/* Subtle pulse overlay during refresh */}
      {refreshing && (
        <div className="pointer-events-none absolute inset-0 z-10 animate-pulse rounded-[22px] bg-accent-solid/6" />
      )}

      {children}

      {/* Refresh controls — shown on hover */}
      {showControls && (
        <div className="glass-subtle absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-full p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          {paused ? (
            <button
              onClick={onResume}
              className={CONTROL_CLASS}
              title="Resume auto-refresh"
            >
              <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : (
            <button
              onClick={onPause}
              className={CONTROL_CLASS}
              title="Pause auto-refresh"
            >
              <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
          <button
            onClick={onRefresh}
            className={cn(
              CONTROL_CLASS,
              refreshing && 'animate-spin',
            )}
            title="Refresh now"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}
