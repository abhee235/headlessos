// EX2.11: Agent UI Panel
// @see docs/phases/phase-ex2.md — EX2.11
//
// Frontend panel showing the UI generation agent's thinking process,
// tool calls, safety warnings, rate-limit countdowns, and progressive preview.
// Renders events streamed from the UIAgent via WebSocket (EX2.12).

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Brain, Wrench, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight, Square, Clock, Eye, Minimize2, Maximize2, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

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
    <div className={cn('border border-border/40 rounded-md overflow-hidden', color)}>
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors text-sm"
        onClick={() => expandable && setExpanded(!expanded)}
        disabled={!expandable}
        data-testid={`step-${event.type}`}
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
        {event.type === 'tool_result' && (
          <Badge variant={event.success ? 'outline' : 'destructive'} className="text-xs px-1 py-0">
            {event.latencyMs}ms
          </Badge>
        )}
        {expandable && (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && content && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/30 bg-muted/10">
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
    <div className="border border-yellow-500/30 rounded-md px-3 py-2 bg-yellow-500/5" data-testid="rate-limit-countdown">
      <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400 mb-1">
        <Clock className="w-4 h-4" />
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
      className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground border-t border-border/40"
      data-testid="agent-meta"
    >
      <span className="flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
        Done
      </span>
      <span>{meta.stepsCompleted} steps</span>
      <span>{(meta.latencyMs / 1000).toFixed(1)}s</span>
      {modelList && <span className="text-muted-foreground/70">{modelList}</span>}
      {meta.warning && (
        <Badge variant="warning" className="text-xs">
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
          'flex items-center gap-2 px-3 py-2 border border-border/60 rounded-lg bg-card',
          className,
        )}
        data-testid="agent-panel-collapsed"
      >
        <Bot className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium flex-1">UI Agent</span>
        {isRunning && <Spinner className="w-4 h-4 text-primary" />}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed(false)}>
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col border border-border/60 rounded-lg bg-card overflow-hidden',
        className,
      )}
      data-testid="agent-panel"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <Bot className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium flex-1">UI Agent</span>
        {isRunning && (
          <Button variant="destructive" size="sm" className="h-6 text-xs px-2" onClick={onAbort} data-testid="abort-button">
            <Square className="w-3 h-3 mr-1" />
            Abort
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed(true)}>
          <Minimize2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1 max-h-80" ref={scrollRef}>
        <div className="p-2 space-y-1.5">
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
            <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
              <Spinner className="w-4 h-4" />
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
        icon: <Brain className="w-4 h-4 text-blue-400" />,
        label: event.message,
        color: '',
        content: null,
        expandable: false,
      };

    case 'tool_result':
      return {
        icon: event.success
          ? <Wrench className="w-4 h-4 text-green-400" />
          : <Wrench className="w-4 h-4 text-red-400" />,
        label: `${event.tool}()`,
        color: event.success ? '' : 'border-red-500/20',
        content: <pre className="whitespace-pre-wrap break-all font-mono">{event.outputPreview}</pre>,
        expandable: true,
      };

    case 'tool_blocked':
      return {
        icon: <ShieldAlert className="w-4 h-4 text-yellow-400" />,
        label: `${event.tool}() — blocked`,
        color: 'border-yellow-500/20 bg-yellow-500/5',
        content: <span>{event.reason}</span>,
        expandable: true,
      };

    case 'generation_complete':
      return {
        icon: <CheckCircle2 className="w-4 h-4 text-green-400" />,
        label: 'Schema generated — Zod validation passed',
        color: 'border-green-500/20 bg-green-500/5',
        content: null,
        expandable: false,
      };

    case 'partial_view':
      return {
        icon: <Eye className="w-4 h-4 text-emerald-400" />,
        label: 'View updated — progressive render',
        color: 'border-emerald-500/20 bg-emerald-500/5',
        content: null,
        expandable: false,
      };

    case 'reflection':
      return {
        icon: event.action === 'approve'
          ? <Search className="w-4 h-4 text-green-400" />
          : <Search className="w-4 h-4 text-yellow-400" />,
        label: event.action === 'approve'
          ? `Reflection: Approved — ${event.feedback}`
          : `Reflection: Fix needed — ${event.feedback}`,
        color: event.action === 'approve' ? 'border-green-500/20' : 'border-yellow-500/20',
        content: <span>{event.feedback}</span>,
        expandable: true,
      };

    case 'safety_warning':
      return {
        icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
        label: event.warning === 'tool_repetition'
          ? `Tool repetition: ${event.tool} called repeatedly`
          : event.message ?? 'Safety warning',
        color: 'border-yellow-500/20 bg-yellow-500/5',
        content: event.message ? <span>{event.message}</span> : null,
        expandable: !!event.message,
      };

    case 'rate_limited':
      // Handled separately by RateLimitCountdown
      return {
        icon: <Clock className="w-4 h-4 text-yellow-400" />,
        label: `Rate limited — retrying in ${event.retryInMs}ms`,
        color: '',
        content: null,
        expandable: false,
      };

    case 'context_compacted':
      return {
        icon: <Package className="w-4 h-4 text-blue-400" />,
        label: `Context compacted: ${event.originalTokens} → ${event.compactedTokens} tokens`,
        color: 'border-blue-500/10',
        content: null,
        expandable: false,
      };

    case 'error':
      return {
        icon: <XCircle className="w-4 h-4 text-destructive" />,
        label: event.message,
        color: 'border-destructive/20 bg-destructive/5',
        content: null,
        expandable: false,
      };

    case 'complete':
      return {
        icon: <CheckCircle2 className="w-4 h-4 text-success" />,
        label: 'Generation complete',
        color: '',
        content: null,
        expandable: false,
      };

    default:
      return {
        icon: <Bot className="w-4 h-4" />,
        label: 'Unknown event',
        color: '',
        content: null,
        expandable: false,
      };
  }
}
