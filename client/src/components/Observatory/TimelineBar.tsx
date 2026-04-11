// EX4-E.3: Timeline Bar — Phoenix-style horizontal bar showing span duration relative to trace
// @see docs/phases/phase-ex4.md

import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { getSpanKindColor, TIMELINE_BAR_HEIGHT, TIMELINE_BAR_RADIUS } from './constants';

interface TimelineBarProps {
  spanStartTime: string;
  spanLatencyMs: number | null;
  traceStartTime: string;
  traceLatencyMs: number;
  kind: string;
}

export function TimelineBar({
  spanStartTime,
  spanLatencyMs,
  traceStartTime,
  traceLatencyMs,
  kind,
}: TimelineBarProps) {
  if (!traceLatencyMs || traceLatencyMs === 0) {
    return <div style={{ height: TIMELINE_BAR_HEIGHT }} />;
  }

  const offset = new Date(spanStartTime).getTime() - new Date(traceStartTime).getTime();
  const duration = spanLatencyMs ?? 0;

  const leftPct = Math.max(0, Math.min(100, (offset / traceLatencyMs) * 100));
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, (duration / traceLatencyMs) * 100));

  const color = getSpanKindColor(kind);

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="relative w-full"
            style={{
              height: TIMELINE_BAR_HEIGHT,
              borderRadius: TIMELINE_BAR_RADIUS,
              backgroundColor: 'rgb(var(--border))',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                minWidth: 2,
                backgroundColor: color,
                borderRadius: TIMELINE_BAR_RADIUS,
              }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div>Start: +{(offset / 1000).toFixed(2)}s</div>
          <div>Duration: {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
