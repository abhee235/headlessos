// EX4-E.1: Trace Detail View — Phoenix-style two-panel layout
// EX8.6: header on the glass with stat pills; span tree in a glass-subtle inset pane
// @see docs/phases/phase-ex4.md

import { useEffect } from 'react';
import { useObservatoryStore } from '../../store/observatory-store';
import { TraceTree } from './TraceTree';
import { SpanDetailPanel } from './SpanDetailPanel';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { SpanStatusIcon } from './SpanKindIcon';
import { formatLatency, formatTokens, formatCost } from './constants';

/** Header stat pill: 10px uppercase label + value */
function StatPill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-1.5 rounded-full border border-edge bg-mat-thin px-3 shadow-[var(--lumen-spec)]">
      <span className="text-[10px] font-bold uppercase tracking-[.06em] text-label-3">{label}</span>
      {children}
    </div>
  );
}

export function TraceDetailView({ onBack }: { onBack: () => void }) {
  const selectedTrace = useObservatoryStore((s) => s.selectedTrace);
  const spanTree = useObservatoryStore((s) => s.selectedSpanTree);
  const selectedSpanId = useObservatoryStore((s) => s.selectedSpanId);
  const selectSpan = useObservatoryStore((s) => s.selectSpan);

  // Auto-select root span when tree loads and no span is selected
  useEffect(() => {
    if (spanTree && !selectedSpanId) {
      selectSpan(spanTree.span.spanId);
    }
  }, [spanTree, selectedSpanId, selectSpan]);

  if (!selectedTrace) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-label-2">
        Loading trace...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Phoenix-style header — back button + name + horizontal stat pills */}
      <div className="flex shrink-0 items-center gap-3 px-4 pb-3">
        <Button size="icon" variant="secondary" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft strokeWidth={1.75} />
        </Button>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold text-foreground">
            {selectedTrace.name}
          </h2>
        </div>

        {/* Stat pills */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
          <StatPill label="Status">
            <SpanStatusIcon status={selectedTrace.status} size={14} />
            <span className="font-semibold text-foreground">{selectedTrace.status}</span>
          </StatPill>
          <StatPill label="Latency">
            <span className="font-mono font-medium text-foreground">{formatLatency(selectedTrace.latencyMs)}</span>
          </StatPill>
          <StatPill label="Spans">
            <span className="font-mono font-medium text-foreground">{selectedTrace.totalSpans}</span>
          </StatPill>
          <StatPill label="Tokens">
            <span className="font-mono font-medium text-foreground">{formatTokens(selectedTrace.totalTokens)}</span>
          </StatPill>
          <StatPill label="Cost">
            <span className="font-mono font-medium text-foreground">{formatCost(selectedTrace.totalCostUsd)}</span>
          </StatPill>
        </div>
      </div>

      {/* Two-panel layout: tree | detail — no "Spans" header (TraceTree has its own toolbar) */}
      {spanTree ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="30%" minSize="250px" maxSize="45%">
            <div className="glass-subtle mb-2 ml-2 flex h-[calc(100%-8px)] flex-col overflow-hidden rounded-[14px]">
              <TraceTree
                tree={spanTree}
                traceStartTime={selectedTrace.startTime}
                traceLatencyMs={selectedTrace.latencyMs ?? 0}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle className="mx-1 w-1 rounded-full bg-transparent transition-colors duration-150 hover:bg-accent-soft" />
          <ResizablePanel defaultSize="70%" minSize="40%">
            <SpanDetailPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-label-2">
          Loading span tree...
        </div>
      )}
    </div>
  );
}
