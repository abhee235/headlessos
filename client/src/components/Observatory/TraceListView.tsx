// EX4-D.2: Trace List View — Phoenix-style trace table
// EX8.6: Lumen list view — segmented filters, card-framed table, sticky 11px header, 34px rows
// @see docs/phases/phase-ex4.md

import { useObservatoryStore } from '../../store/observatory-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { RotateCw, Trash2 } from 'lucide-react';
import { SpanStatusIcon } from './SpanKindIcon';
import { formatTokens, formatCost, formatLatency, getStatusColor } from './constants';
import type { TraceTrigger, SpanStatus } from 'headlessos-shared/schemas/observatory';
import { SEGMENT_WELL, segmentItemClass } from '@/components/ui/segmented';

// ── Helpers ──

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TRIGGER_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  'ui-agent': 'default',
  'dynamic-ui': 'secondary',
  'investigation-agent': 'outline',
  api: 'outline',
  manual: 'outline',
};

const TRIGGER_LABELS: string[] = ['ui-agent', 'dynamic-ui', 'investigation-agent', 'api', 'manual'];

/** Segmented filter well + its pill segments */
// EX8.14: filters use the shared segmented look (ui/segmented.tsx)
const FILTER_WELL_CLASS = SEGMENT_WELL;
/** List-view header / cell recipes */
const HEAD_CLASS = 'sticky top-0 z-[1] h-[34px] bg-mat-thick px-3 text-[11px] font-bold uppercase tracking-[.06em] text-label-3 first:pl-4 last:pr-4';
const CELL_CLASS = 'h-[34px] px-3 py-1.5 first:pl-4 last:pr-4';
const STATUS_LABELS: SpanStatus[] = ['OK', 'ERROR', 'RUNNING'];

export function TraceListView() {
  const {
    traces,
    totalTraces,
    loading,
    error,
    filters,
    setFilter,
    fetchTraces,
    selectTrace,
    clearTraces,
  } = useObservatoryStore();

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3">
        <span className="mr-2 text-[15px] font-bold text-foreground">
          Traces ({totalTraces})
        </span>

        {/* Trigger filter */}
        <div className={FILTER_WELL_CLASS}>
          <button
            type="button"
            aria-pressed={!filters.trigger}
            className={segmentItemClass(!filters.trigger)}
            onClick={() => setFilter({ trigger: undefined })}
          >
            All
          </button>
          {TRIGGER_LABELS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={filters.trigger === t}
              className={segmentItemClass(filters.trigger === t)}
              onClick={() => setFilter({ trigger: t as TraceTrigger })}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Status filter — with SpanStatusIcon */}
        <div className={FILTER_WELL_CLASS}>
          {STATUS_LABELS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filters.status === s}
              className={segmentItemClass(filters.status === s, 'gap-1.5')}
              onClick={() =>
                setFilter({ status: filters.status === s ? undefined : s })
              }
            >
              <SpanStatusIcon status={s} size={12} />
              <span>{s}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <Button size="icon" variant="ghost" onClick={fetchTraces}>
          <RotateCw strokeWidth={1.75} />
        </Button>
        <Button size="icon" variant="ghost" className="text-destructive" onClick={clearTraces}>
          <Trash2 strokeWidth={1.75} />
        </Button>
      </div>

      {/* Content */}
      {loading && traces.length === 0 ? (
        <div className="space-y-2 px-4 pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[34px] w-full rounded-[10px]" />
          ))}
        </div>
      ) : error ? (
        <div className="flex h-full items-center justify-center px-4 pb-4 text-sm text-danger">
          {error}
        </div>
      ) : traces.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 pb-4 text-sm text-label-2">
          No traces yet. Generate a Dynamic UI or run an agent to see traces here.
        </div>
      ) : (
        <div className="mx-4 mb-3 min-h-0 flex-1 overflow-hidden rounded-[20px] border border-edge-2 bg-mat-thin">
          <div className="h-full overflow-auto">
            <table className="w-full caption-bottom text-[13px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(HEAD_CLASS, 'w-10')} />
                  <TableHead className={HEAD_CLASS}>Name</TableHead>
                  <TableHead className={cn(HEAD_CLASS, 'w-28')}>Trigger</TableHead>
                  <TableHead className={cn(HEAD_CLASS, 'w-16 text-right')}>Spans</TableHead>
                  <TableHead className={cn(HEAD_CLASS, 'w-20 text-right')}>Tokens</TableHead>
                  <TableHead className={cn(HEAD_CLASS, 'w-20 text-right')}>Cost</TableHead>
                  <TableHead className={cn(HEAD_CLASS, 'w-20 text-right')}>Latency</TableHead>
                  <TableHead className={cn(HEAD_CLASS, 'w-20 text-right')}>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traces.map((trace) => (
                  <TableRow
                    key={trace.traceId}
                    className="cursor-pointer transition-colors duration-150 hover:bg-fill active:bg-fill-2"
                    onClick={() => selectTrace(trace.traceId)}
                  >
                    <TableCell className={CELL_CLASS}>
                      <SpanStatusIcon status={trace.status} size={14} />
                    </TableCell>
                    <TableCell className={cn(CELL_CLASS, 'font-semibold')}>
                      {trace.name}
                    </TableCell>
                    <TableCell className={CELL_CLASS}>
                      {trace.trigger && (
                        <Badge variant={TRIGGER_VARIANTS[trace.trigger] ?? 'outline'} className="whitespace-nowrap">
                          {trace.trigger}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={cn(CELL_CLASS, 'text-right text-xs text-label-2')}>
                      {trace.totalSpans}
                    </TableCell>
                    <TableCell className={cn(CELL_CLASS, 'text-right font-mono text-xs')}>
                      {formatTokens(trace.totalTokens)}
                    </TableCell>
                    <TableCell className={cn(CELL_CLASS, 'text-right font-mono text-xs')}>
                      {formatCost(trace.totalCostUsd)}
                    </TableCell>
                    <TableCell className={cn(CELL_CLASS, 'text-right font-mono text-xs')}>
                      {formatLatency(trace.latencyMs)}
                    </TableCell>
                    <TableCell className={cn(CELL_CLASS, 'text-right text-xs text-label-2')}>
                      {formatTimeAgo(trace.startTime)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
