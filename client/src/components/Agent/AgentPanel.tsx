// EX2.11: Agent UI Panel
// @see docs/phases/phase-ex2.md — EX2.11
//
// Frontend panel showing the UI generation agent's thinking process,
// tool calls, safety warnings, rate-limit countdowns, and progressive preview.
// Renders events streamed from the UIAgent via WebSocket (EX2.12).
// EX8.6: Lumen glass — step bubbles with semantic tints, token icon colours.

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Brain, Wrench, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight, Square, Clock, Eye, Minimize2, Maximize2, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { BUBBLE_CLASS } from './agent-ui';

// ── Types (mirroring server-side AgentEvent + UIAgentEvent) ──

export type AgentEventType =
  | { type: 'thinking'; message: string }
  | { type: 'tool_result'; tool: string; success: boolean; outputPreview: string; latencyMs: number }
  | { type: 'tool_blocked'; tool: string; reason: string }
  | { type: 'partial_view'; view: unknown }
  | { type: 'generation_complete'; view: unknown }
  | { type: 'reflection'; feedback: string; action: 'approve' | 'fix' }
  | { type: 'safety_warning'; warning: 'consecutive_mistakes' | 'tool_repetition'; tool?: string; message?: string }
  | { type: 'rate_limited'; retryInMs: number; attempt: number }
  | { type: 'context_compacted'; originalTokens: number; compactedTokens: number }
  | { type: 'complete'; view: unknown; meta: AgentMetaType }
  | { type: 'layout_update'; phase: string; view: unknown; widgetId?: string; progress?: number }
  | { type: 'error'; message: string };

export interface AgentMetaType {
  sessionId: string;
  latencyMs: number;
  stepsCompleted: number;
  reflectionLoops: number;
  warning?: string;
  models: Record<string, string>;
}

// ── Step item for timeline display ──

interface TimelineStep {
  id: number;
  event: AgentEventType;
  timestamp: number;
}

// ── Props ──

export interface AgentPanelProps {
  /** Stream of events from the agent */
  events: TimelineStep[];
  /** Whether the agent is currently running */
  isRunning: boolean;
  /** Callback to abort the agent */
  onAbort?: () => void;
  /** Optional class name */
  className?: string;
}

// ── Step Card Component ──

function AgentStepCard({ step, defaultExpanded }: { step: TimelineStep; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const event = step.event;

  const { icon, label, color, content, expandable } = getStepDisplay(event);

  return (
    <div className={cn(BUBBLE_CLASS, 'overflow-hidden', color)}>
      <button
        className={cn(
          'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors duration-150',
          expandable && 'hover:bg-fill',
        )}
        onClick={() => expandable && setExpanded(!expanded)}
        disabled={!expandable}
        data-testid={`step-${event.type}`}
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
        {event.type === 'tool_result' && (
          <Badge variant={event.success ? 'secondary' : 'destructive'} className="font-mono text-[10px]">
            {event.latencyMs}ms
          </Badge>
        )}
        {expandable && (
          expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-label-3" />
            : <ChevronRight className="h-3.5 w-3.5 text-label-3" />
        )}
      </button>

      {expanded && content && (
        <div className="border-t border-border bg-paper px-3.5 py-2.5 text-xs text-label-2">
          {content}
        </div>
      )}
    </div>
  );
}

// ── Rate Limit Countdown Component ──

function RateLimitCountdown({ retryInMs, attempt }: { retryInMs: number; attempt: number }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / retryInMs) * 100, 100);
      setProgress(pct);
      if (pct >= 100) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [retryInMs]);

  return (
    <div className="rounded-[18px] border border-warning/30 bg-warning/10 px-3.5 py-2.5" data-testid="rate-limit-countdown">
      <div className="mb-2 flex items-center gap-2 text-[13px] text-warning">
        <Clock className="h-4 w-4" strokeWidth={1.75} />
        <span>Rate limited. Retrying in {(retryInMs / 1000).toFixed(0)}s... (attempt {attempt})</span>
      </div>
      <Progress value={progress} className="h-1.5" />
    </div>
  );
}

// ── Agent Meta Footer ──

function AgentMetaFooter({ meta }: { meta: AgentMetaType }) {
  const modelList = Object.entries(meta.models)
    .map(([role, model]) => `${model}`)
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .join(' + ');

  return (
    <div
      className="flex min-h-9 items-center gap-3 border-t border-border px-3.5 py-2 text-xs text-label-2"
      data-testid="agent-meta"
    >
      <span className="flex items-center gap-1 font-semibold text-success">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        Done
      </span>
      <span>{meta.stepsCompleted} steps</span>
      <span>{(meta.latencyMs / 1000).toFixed(1)}s</span>
      {modelList && <span className="truncate font-mono text-label-3">{modelList}</span>}
      {meta.warning && (
        <Badge variant="warning">
          {meta.warning}
        </Badge>
      )}
    </div>
  );
}

// ── Main Panel Component ──

export function AgentPanel({ events, isRunning, onAbort, className }: AgentPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const completeMeta = events.find((e) => e.event.type === 'complete')?.event as
    | (AgentEventType & { type: 'complete' })
    | undefined;

  // Auto-scroll to bottom as events arrive
  useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, collapsed]);

  if (collapsed) {
    return (
      <div
        className={cn(
          'flex h-11 items-center gap-2.5 rounded-full border border-edge bg-mat-thin pl-4 pr-1.5',
          className,
        )}
        data-testid="agent-panel-collapsed"
      >
        <Bot className="h-[18px] w-[18px] text-accent-solid" strokeWidth={1.75} />
        <span className="flex-1 text-[13px] font-semibold">UI Agent</span>
        {isRunning && <Spinner className="h-4 w-4 text-accent-solid" />}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCollapsed(false)}>
          <Maximize2 strokeWidth={1.75} />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-[22px] border border-edge bg-mat-thin',
        className,
      )}
      data-testid="agent-panel"
    >
      {/* Header */}
      <div className="flex h-11 items-center gap-2.5 border-b border-border pl-3.5 pr-1.5">
        <Bot className="h-[18px] w-[18px] text-accent-solid" strokeWidth={1.75} />
        <span className="flex-1 text-[13px] font-semibold">UI Agent</span>
        {isRunning && (
          <Button variant="destructive" size="sm" className="h-7 gap-1.5 px-3" onClick={onAbort} data-testid="abort-button">
            <Square strokeWidth={1.75} />
            Abort
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCollapsed(true)}>
          <Minimize2 strokeWidth={1.75} />
        </Button>
      </div>

      {/* Timeline */}
      <ScrollArea className="max-h-80 flex-1" ref={scrollRef}>
        <div className="space-y-2 p-2.5">
          {events.map((step) => {
            // Rate limit countdown gets special rendering
            if (step.event.type === 'rate_limited') {
              return <RateLimitCountdown key={step.id} retryInMs={step.event.retryInMs} attempt={step.event.attempt} />;
            }
            // Complete event is rendered in the footer
            if (step.event.type === 'complete') return null;

            return <AgentStepCard key={step.id} step={step} />;
          })}

          {isRunning && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] text-label-2">
              <Spinner className="h-4 w-4 text-accent-solid" />
              <span>Working...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer: Meta */}
      {completeMeta && <AgentMetaFooter meta={completeMeta.meta} />}
    </div>
  );
}

// ── Display Helpers ──

const STEP_ICON_CLASS = 'h-4 w-4 shrink-0';

function getStepDisplay(event: AgentEventType): {
  icon: React.ReactNode;
  label: string;
  color: string;
  content: React.ReactNode | null;
  expandable: boolean;
} {
  switch (event.type) {
    case 'thinking':
      return {
        icon: <Brain className={STEP_ICON_CLASS + ' text-accent-solid'} strokeWidth={1.75} />,
        label: event.message,
        color: '',
        content: null,
        expandable: false,
      };

    case 'tool_result':
      return {
        icon: event.success
          ? <Wrench className={STEP_ICON_CLASS + ' text-success'} strokeWidth={1.75} />
          : <Wrench className={STEP_ICON_CLASS + ' text-danger'} strokeWidth={1.75} />,
        label: `${event.tool}()`,
        color: event.success ? '' : 'border-danger/30',
        content: <pre className="whitespace-pre-wrap break-all font-mono">{event.outputPreview}</pre>,
        expandable: true,
      };

    case 'tool_blocked':
      return {
        icon: <ShieldAlert className={STEP_ICON_CLASS + ' text-warning'} strokeWidth={1.75} />,
        label: `${event.tool}() — blocked`,
        color: 'border-warning/30 bg-warning/10',
        content: <span>{event.reason}</span>,
        expandable: true,
      };

    case 'generation_complete':
      return {
        icon: <CheckCircle2 className={STEP_ICON_CLASS + ' text-success'} strokeWidth={1.75} />,
        label: 'Schema generated — Zod validation passed',
        color: 'border-success/30 bg-success/10',
        content: null,
        expandable: false,
      };

    case 'partial_view':
      return {
        icon: <Eye className={STEP_ICON_CLASS + ' text-accent-solid'} strokeWidth={1.75} />,
        label: 'View updated — progressive render',
        color: 'border-accent-solid/30 bg-accent-soft',
        content: null,
        expandable: false,
      };

    case 'reflection':
      return {
        icon: event.action === 'approve'
          ? <Search className={STEP_ICON_CLASS + ' text-success'} strokeWidth={1.75} />
          : <Search className={STEP_ICON_CLASS + ' text-warning'} strokeWidth={1.75} />,
        label: event.action === 'approve'
          ? `Reflection: Approved — ${event.feedback}`
          : `Reflection: Fix needed — ${event.feedback}`,
        color: event.action === 'approve' ? 'border-success/30' : 'border-warning/30',
        content: <span>{event.feedback}</span>,
        expandable: true,
      };

    case 'safety_warning':
      return {
        icon: <AlertTriangle className={STEP_ICON_CLASS + ' text-warning'} strokeWidth={1.75} />,
        label: event.warning === 'tool_repetition'
          ? `Tool repetition: ${event.tool} called repeatedly`
          : event.message ?? 'Safety warning',
        color: 'border-warning/30 bg-warning/10',
        content: event.message ? <span>{event.message}</span> : null,
        expandable: !!event.message,
      };

    case 'rate_limited':
      // Handled separately by RateLimitCountdown
      return {
        icon: <Clock className={STEP_ICON_CLASS + ' text-warning'} strokeWidth={1.75} />,
        label: `Rate limited — retrying in ${event.retryInMs}ms`,
        color: '',
        content: null,
        expandable: false,
      };

    case 'context_compacted':
      return {
        icon: <Package className={STEP_ICON_CLASS + ' text-chart-3'} strokeWidth={1.75} />,
        label: `Context compacted: ${event.originalTokens} → ${event.compactedTokens} tokens`,
        color: '',
        content: null,
        expandable: false,
      };

    case 'error':
      return {
        icon: <XCircle className={STEP_ICON_CLASS + ' text-danger'} strokeWidth={1.75} />,
        label: event.message,
        color: 'border-danger/30 bg-danger/10',
        content: null,
        expandable: false,
      };

    case 'complete':
      return {
        icon: <CheckCircle2 className={STEP_ICON_CLASS + ' text-success'} strokeWidth={1.75} />,
        label: 'Generation complete',
        color: '',
        content: null,
        expandable: false,
      };

    default:
      return {
        icon: <Bot className={STEP_ICON_CLASS + ' text-label-2'} strokeWidth={1.75} />,
        label: 'Unknown event',
        color: '',
        content: null,
        expandable: false,
      };
  }
}
