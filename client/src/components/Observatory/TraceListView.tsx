// EX4-D.2: Trace List View — Phoenix-style trace table
// @see docs/phases/phase-ex4.md

import { useObservatoryStore } from '../../store/observatory-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw, Trash2 } from 'lucide-react';
import { SpanStatusIcon } from './SpanKindIcon';
import { formatTokens, formatCost, formatLatency, getStatusColor } from './constants';
import type { TraceTrigger, SpanStatus } from 'headlessos-shared/schemas/observatory';

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
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[rgb(var(--border))]">
        <span className="text-sm font-medium text-[rgb(var(--foreground))]">
          Traces ({totalTraces})
        </span>

        {/* Trigger filter */}
        <div className="flex gap-1 ml-4">
          <Button
            size="sm"
            variant={filters.trigger ? 'ghost' : 'secondary'}
            className="h-6 text-xs"
            onClick={() => setFilter({ trigger: undefined })}
          >
            All
          </Button>
          {TRIGGER_LABELS.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={filters.trigger === t ? 'secondary' : 'ghost'}
              className="h-6 text-xs"
              onClick={() => setFilter({ trigger: t as TraceTrigger })}
            >
              {t}
            </Button>
          ))}
        </div>

        {/* Status filter — with SpanStatusIcon */}
        <div className="flex gap-1 ml-2">
          {STATUS_LABELS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filters.status === s ? 'secondary' : 'ghost'}
              className="h-6 text-xs"
              onClick={() =>
                setFilter({ status: filters.status === s ? undefined : s })
              }
            >
              <SpanStatusIcon status={s} size={10} />
              <span className="ml-1">{s}</span>
            </Button>
          ))}
        </div>

        <div className="flex-1" />

        <Button size="sm" variant="ghost" className="h-7" onClick={fetchTraces}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={clearTraces}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Content */}
      {loading && traces.length === 0 ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-full text-[rgb(var(--destructive))] text-sm">
          {error}
        </div>
      ) : traces.length === 0 ? (
        <div className="flex items-center justify-center h-full text-[rgb(var(--muted-foreground))] text-sm">
          No traces yet. Generate a Dynamic UI or run an agent to see traces here.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Trigger</TableHead>
                <TableHead className="w-16 text-right">Spans</TableHead>
                <TableHead className="w-20 text-right">Tokens</TableHead>
                <TableHead className="w-20 text-right">Cost</TableHead>
                <TableHead className="w-20 text-right">Latency</TableHead>
                <TableHead className="w-20 text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {traces.map((trace) => (
                <TableRow
                  key={trace.traceId}
                  className="cursor-pointer hover:bg-[rgb(var(--accent))]/50"
                  onClick={() => selectTrace(trace.traceId)}
                >
                  <TableCell>
                    <SpanStatusIcon status={trace.status} size={14} />
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {trace.name}
                  </TableCell>
                  <TableCell>
                    {trace.trigger && (
                      <Badge
                        variant={TRIGGER_VARIANTS[trace.trigger] ?? 'outline'}
                        className="text-xs"
                      >
                        {trace.trigger}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-[rgb(var(--muted-foreground))]">
                    {trace.totalSpans}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">
                    {formatTokens(trace.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">
                    {formatCost(trace.totalCostUsd)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">
                    {formatLatency(trace.latencyMs)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-[rgb(var(--muted-foreground))]">
                    {formatTimeAgo(trace.startTime)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
