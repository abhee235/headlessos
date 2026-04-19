// EX4-E.1: Trace Detail View — Phoenix-style two-panel layout
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
      <div className="flex items-center justify-center h-full text-[rgb(var(--muted-foreground))]">
        Loading trace...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[rgb(var(--background))]">
      {/* Phoenix-style header — back button + name + horizontal stat columns */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--card))]">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))] truncate">
            {selectedTrace.name}
          </h2>
        </div>

        {/* Phoenix-style horizontal stat columns */}
        <div className="flex items-center gap-4 text-xs">
          {/* Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted-foreground))]">Status</span>
            <SpanStatusIcon status={selectedTrace.status} size={14} />
            <span className="font-medium text-[rgb(var(--foreground))]">{selectedTrace.status}</span>
          </div>

          <div className="w-px h-4 bg-[rgb(var(--border))]/50" />

          {/* Latency */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted-foreground))]">Latency</span>
            <span className="font-mono font-medium text-[rgb(var(--foreground))]">{formatLatency(selectedTrace.latencyMs)}</span>
          </div>

          <div className="w-px h-4 bg-[rgb(var(--border))]/50" />

          {/* Spans */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted-foreground))]">Spans</span>
            <span className="font-mono font-medium text-[rgb(var(--foreground))]">{selectedTrace.totalSpans}</span>
          </div>

          <div className="w-px h-4 bg-[rgb(var(--border))]/50" />

          {/* Tokens */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted-foreground))]">Tokens</span>
            <span className="font-mono font-medium text-[rgb(var(--foreground))]">{formatTokens(selectedTrace.totalTokens)}</span>
          </div>

          <div className="w-px h-4 bg-[rgb(var(--border))]/50" />

          {/* Cost */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted-foreground))]">Cost</span>
            <span className="font-mono font-medium text-[rgb(var(--foreground))]">{formatCost(selectedTrace.totalCostUsd)}</span>
          </div>
        </div>
      </div>

      {/* Two-panel layout: tree | detail — no "Spans" header (TraceTree has its own toolbar) */}
      {spanTree ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel defaultSize="30%" minSize="250px" maxSize="45%">
            <div className="flex flex-col h-full border-r border-[rgb(var(--border))]">
              <TraceTree
                tree={spanTree}
                traceStartTime={selectedTrace.startTime}
                traceLatencyMs={selectedTrace.latencyMs ?? 0}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle className="w-px bg-[rgb(var(--border))]/50 hover:bg-[rgb(var(--primary))]/50 transition-colors" />
          <ResizablePanel defaultSize="70%" minSize="40%">
            <SpanDetailPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex items-center justify-center flex-1 text-[rgb(var(--muted-foreground))] text-sm">
          Loading span tree...
        </div>
      )}
    </div>
  );
}
