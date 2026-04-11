// EX4-E.2: Trace Tree Component — Phoenix-style recursive span hierarchy
// @see docs/phases/phase-ex4.md

import { useState, useCallback } from 'react';
import { useObservatoryStore } from '../../store/observatory-store';
import { TimelineBar } from './TimelineBar';
import { SpanKindIcon } from './SpanKindIcon';
import { SpanKindToken } from './SpanKindToken';
import { ChevronDown, ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
import {
  NESTING_INDENT,
  CONNECTOR_OFFSET,
  CONNECTOR_BORDER_RADIUS,
  L_CONNECTOR_HEIGHT,
  L_CONNECTOR_WIDTH,
  formatLatency,
  formatTokens,
} from './constants';
import type { SpanTreeNode } from 'headlessos-shared/schemas/observatory';

/* ── Helpers ── */

function countTotalSpans(node: SpanTreeNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countTotalSpans(child);
  }
  return count;
}

/* ── SpanRow ── */

interface SpanRowProps {
  node: SpanTreeNode;
  depth: number;
  isLast: boolean;
  parentLines: boolean[];
  selectedSpanId: string | null;
  onSelect: (spanId: string) => void;
  traceStartTime: string;
  traceLatencyMs: number;
}

function SpanRow({ node, depth, isLast, parentLines, selectedSpanId, onSelect, traceStartTime, traceLatencyMs }: SpanRowProps) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children.length > 0;
  const span = node.span;
  const isSelected = selectedSpanId === span.spanId;
  const isError = span.status === 'ERROR';
  const totalDescendants = hasChildren ? countTotalSpans(node) - 1 : 0;

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  }, [expanded]);

  const handleClick = useCallback(() => {
    onSelect(span.spanId);
  }, [span.spanId, onSelect]);

  const connectorColor = isError ? 'rgb(228, 62, 62)' : 'rgb(var(--border))';

  return (
    <>
      {/* Row — Phoenix-style: 4px left border, hover/selected states */}
      <div
        className={`span-node-wrap flex items-center cursor-pointer text-[13px] relative
          ${isSelected
            ? 'bg-[#303030] border-l-[rgb(var(--border))]'
            : 'border-l-transparent hover:bg-[#0E0E0E]'
          }`}
        style={{
          borderLeftWidth: 4,
          borderLeftStyle: 'solid',
          paddingTop: 8,
          paddingBottom: 8,
          paddingRight: 8,
        }}
        onClick={handleClick}
        data-testid={`span-row-${span.spanId}`}
      >
        {/* ── Vertical edge connectors (for ancestor lines) ── */}
        {parentLines.map((showLine, i) =>
          showLine ? (
            <div
              key={`vc-${i}`}
              className="span-tree-edge-connector"
              style={{
                position: 'absolute',
                borderLeft: `1px solid ${connectorColor}`,
                top: 0,
                bottom: 0,
                left: i * NESTING_INDENT + CONNECTOR_OFFSET,
                zIndex: isError ? 1 : 0,
              }}
            />
          ) : null
        )}

        {/* ── L-shaped edge connector (current node) ── */}
        {depth > 0 && (
          <div
            className="span-tree-edge"
            style={{
              position: 'absolute',
              borderLeft: `1px solid ${connectorColor}`,
              borderBottom: `1px solid ${connectorColor}`,
              borderRadius: `0 0 0 ${CONNECTOR_BORDER_RADIUS}px`,
              top: -5,
              left: (depth - 1) * NESTING_INDENT + CONNECTOR_OFFSET,
              width: L_CONNECTOR_WIDTH,
              height: L_CONNECTOR_HEIGHT,
              zIndex: isError ? 1 : 0,
            }}
          />
        )}

        {/* Left section: indentation + icon + name + tokens */}
        <div
          className="flex items-center flex-1 min-w-0 gap-1"
          style={{ marginLeft: depth * NESTING_INDENT + 16 }}
        >
          {/* Expand/collapse chevron — Phoenix-style with rotation */}
          <div className="span-controls flex-shrink-0 w-5 h-5 flex items-center justify-center">
            {hasChildren ? (
              <button
                onClick={handleToggle}
                className="flex items-center justify-center w-5 h-5 rounded text-[rgb(var(--foreground))]"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  transition: 'transform 0.2s, background-color 0.3s',
                  transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="w-5" />
            )}
          </div>

          {/* Kind icon — Phoenix 20×20 SVG */}
          <SpanKindIcon
            kind={span.kind}
            variant={isSelected ? 'fill' : 'outline'}
            size={20}
          />

          {/* Span name */}
          <span className="truncate flex-1 min-w-0 font-medium text-[rgb(var(--foreground))]">
            {span.name}
          </span>

          {/* SpanKindToken badge */}
          <span className="token-count-item flex-shrink-0 ml-1">
            <SpanKindToken kind={span.kind} size="S" />
          </span>

          {/* Token count (LLM spans) */}
          {span.tokenUsage && span.tokenUsage.totalTokens > 0 && (
            <span className="token-count-item ml-1 flex-shrink-0 text-[10px] font-mono text-[rgb(var(--muted-foreground))] bg-[rgb(var(--muted))]/30 rounded px-1 py-0.5">
              {formatTokens(span.tokenUsage.totalTokens)}
            </span>
          )}

          {/* Collapsed child count */}
          {totalDescendants > 0 && !expanded && (
            <span className="token-count-item ml-1 flex-shrink-0 text-[10px] text-[rgb(var(--muted-foreground))] bg-[rgb(var(--muted))]/30 rounded px-1 py-0.5">
              +{totalDescendants}
            </span>
          )}
        </div>

        {/* Right section: latency text + timeline bar */}
        <div className="span-tree-timing flex-shrink-0 flex items-center gap-2" style={{ width: 150 }}>
          <span className="latency-text text-[11px] font-mono text-[rgb(var(--muted-foreground))] text-right" style={{ minWidth: '2.5rem' }}>
            {formatLatency(span.latencyMs)}
          </span>
          <div className="flex-1">
            <TimelineBar
              spanStartTime={span.startTime}
              spanLatencyMs={span.latencyMs}
              traceStartTime={traceStartTime}
              traceLatencyMs={traceLatencyMs}
              kind={span.kind}
            />
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren &&
        node.children.map((child: SpanTreeNode, idx: number) => (
          <SpanRow
            key={child.span.spanId}
            node={child}
            depth={depth + 1}
            isLast={idx === node.children.length - 1}
            parentLines={[...parentLines, idx < node.children.length - 1]}
            selectedSpanId={selectedSpanId}
            onSelect={onSelect}
            traceStartTime={traceStartTime}
            traceLatencyMs={traceLatencyMs}
          />
        ))}

      {/* "Show N hidden spans" when collapsed with children */}
      {!expanded && totalDescendants > 0 && (
        <button
          className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer py-0.5 transition-colors"
          style={{ paddingLeft: (depth + 1) * NESTING_INDENT + 40 }}
          onClick={handleToggle}
        >
          Show {totalDescendants} hidden span{totalDescendants > 1 ? 's' : ''}
        </button>
      )}
    </>
  );
}

/* ── TraceTree ── */

interface TraceTreeProps {
  tree: SpanTreeNode;
  traceStartTime: string;
  traceLatencyMs: number;
}

export function TraceTree({ tree, traceStartTime, traceLatencyMs }: TraceTreeProps) {
  const selectedSpanId = useObservatoryStore((s) => s.selectedSpanId);
  const selectSpan = useObservatoryStore((s) => s.selectSpan);
  const [allExpanded, setAllExpanded] = useState<boolean | null>(null);

  const handleExpandAll = useCallback(() => setAllExpanded(true), []);
  const handleCollapseAll = useCallback(() => setAllExpanded(false), []);

  // Key forces re-render of tree when expand/collapse all is toggled
  const treeKey = allExpanded === null ? 'default' : allExpanded ? 'expanded' : 'collapsed';

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ containerType: 'inline-size' }}
      data-testid="trace-tree"
    >
      {/* ── Toolbar — Phoenix-style ── */}
      <div className="flex items-center justify-between px-2 border-b border-[rgb(var(--border))]"
        style={{ height: 40, flexShrink: 0 }}
      >
        <span className="text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider">
          Spans
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExpandAll}
            className="flex items-center justify-center w-7 h-7 rounded text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]/30 transition-colors"
            title="Expand all"
          >
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCollapseAll}
            className="flex items-center justify-center w-7 h-7 rounded text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]/30 transition-colors"
            title="Collapse all"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Tree List ── */}
      <div className="flex-1 overflow-auto" key={treeKey}>
        <SpanRow
          node={tree}
          depth={0}
          isLast
          parentLines={[]}
          selectedSpanId={selectedSpanId}
          onSelect={selectSpan}
          traceStartTime={traceStartTime}
          traceLatencyMs={traceLatencyMs}
        />
      </div>

      {/* ── Container query styles (injected once) ── */}
      <style>{`
        @container (width < 300px) {
          .span-controls, .latency-text, .token-count-item,
          .span-tree-edge-connector, .span-tree-edge, .span-tree-timing {
            display: none !important;
            visibility: hidden;
            width: 0 !important;
          }
          .span-node-wrap {
            padding-left: 12px !important;
          }
        }
        @container (width < 500px) {
          .span-tree-timing {
            display: none !important;
            visibility: hidden;
            width: 0 !important;
          }
        }
        @container (width > 800px) {
          .span-tree-timing {
            width: 33% !important;
          }
        }
      `}</style>
    </div>
  );
}
