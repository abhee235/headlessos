// EX8.6: Task Manager — shared LumenOS v3 pieces (meters, sparklines, chart styling)
// Used by TaskManagerView (sidebar meters, summary tiles), ProcessesTab (CPU/memory
// columns) and PerformanceTab (metric cards, charts, cores).
// @see docs/phases/phase-ex8.md

import { useId, type CSSProperties } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { cn } from '../../lib/utils';

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatBytesPerSec(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`;
}

export function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

// ─── Series colours (data-viz tokens only) ───────────────────────────────────

/** Raw CSS vars for recharts strokes/fills; the matching Tailwind classes for HTML marks. */
export const SERIES = {
  cpu: { color: 'var(--chart-1)', bg: 'bg-chart-1' },
  memory: { color: 'var(--chart-3)', bg: 'bg-chart-3' },
  disk: { color: 'var(--chart-5)', bg: 'bg-chart-5' },
  network: { color: 'var(--chart-4)', bg: 'bg-chart-4' },
} as const;

/** Load bar fill: accent below 75%, warning from 75%, destructive from 90%. */
export function loadFill(pct: number): string {
  if (pct >= 90) return 'bg-destructive';
  if (pct >= 75) return 'bg-warning';
  return 'bg-accent-solid';
}

/** Shared recharts axis / grid / tooltip styling — gridlines on var(--border). */
export const chartTick = { fontSize: 11, fill: 'var(--lumen-label3)' };
export const chartTooltipStyle: CSSProperties = {
  background: 'var(--lumen-mat-thick)',
  border: '1px solid var(--lumen-edge)',
  borderRadius: 10,
  backdropFilter: 'blur(24px)',
  color: 'var(--lumen-label)',
  fontSize: 12,
  padding: '6px 10px',
};

// ─── Meter: 6px recessed track + fill ────────────────────────────────────────

interface MeterProps {
  /** 0–100 */
  value: number;
  /** Fill class; defaults to the accent/warning/destructive load colour */
  fillClassName?: string;
  className?: string;
}

export function Meter({ value, fillClassName, className }: MeterProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-chip', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', fillClassName ?? loadFill(pct))}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Sparkline: tiny area chart, no axes ─────────────────────────────────────

interface SparklineProps {
  data: Array<Record<string, number>>;
  dataKey: string;
  color: string;
  /** Fixed y-domain (e.g. [0, 100] for percentages); auto otherwise */
  domain?: [number, number];
  className?: string;
}

export function Sparkline({ data, dataKey, color, domain, className }: SparklineProps) {
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div className={cn('h-7 w-full', className)}>
      {data.length > 1 && (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <YAxis hide domain={domain ?? [0, 'auto']} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
