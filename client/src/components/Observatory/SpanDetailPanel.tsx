// EX4-E.4: Span Detail Panel — Phoenix-style tabbed detail view
// EX8.6: Lumen glass — bubbles for I/O cards, bg-paper JSON panes, segmented tabs
// @see docs/phases/phase-ex4.md

import { useObservatoryStore } from '../../store/observatory-store';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SpanKindIcon } from './SpanKindIcon';
import { SpanStatusIcon } from './SpanKindIcon';
import { SpanKindToken } from './SpanKindToken';
import {
  Clock, Coins, ArrowRight, AlertTriangle, Copy, Check,
} from 'lucide-react';
import {
  formatLatency, formatTokens, getSpanKindColor,
  getRoleStyle, OUTPUT_CARD_STYLE,
} from './constants';
import type { Span } from 'headlessos-shared/schemas/observatory';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

/** Neutral I/O card (input side) */
const IO_CARD_CLASS = 'overflow-hidden rounded-[18px] border border-edge bg-mat-thin';
/** I/O card header row */
const IO_HEAD_CLASS = 'flex items-center gap-2 border-b px-3.5 py-2';
/** 11px uppercase card heading */
const IO_LABEL_CLASS = 'text-[11px] font-bold uppercase tracking-[.06em]';
/** Muted italic empty hint */
const EMPTY_CLASS = 'text-xs italic text-label-3';

/* ---------- Sub-components ---------- */

/** Copy-to-clipboard button */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      className="grid h-6 w-6 place-items-center rounded-full text-label-2 transition-colors duration-150 hover:bg-fill hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  if (data === null || data === undefined) {
    return (
      <div className={cn(EMPTY_CLASS, 'p-4')}>
        No {label} data
      </div>
    );
  }
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return (
    <div className="relative group">
      <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap break-words rounded-[14px] border border-edge bg-paper px-4 py-3 font-mono text-xs text-foreground">
        {json}
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={json} />
      </div>
    </div>
  );
}

/** Chat-style message card — Phoenix role-based colors */
function ChatMessage({ role, content, tokens }: { role: string; content: string; tokens?: number }) {
  const roleStyle = getRoleStyle(role);
  const json = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  return (
    <div className={cn('overflow-hidden rounded-[18px] border', roleStyle.border, roleStyle.bg)}>
      {/* Role header */}
      <div className={cn('flex items-center justify-between py-1.5 pl-3.5 pr-1.5 border-b', roleStyle.border)}>
        <span className={cn(IO_LABEL_CLASS, 'text-label-2')}>
          {role}
        </span>
        <div className="flex items-center gap-2">
          {tokens !== undefined && tokens > 0 && (
            <span className="font-mono text-[10px] text-label-3">
              {formatTokens(tokens)} tokens
            </span>
          )}
          <CopyButton text={json} />
        </div>
      </div>
      {/* Content */}
      <div className="whitespace-pre-wrap break-words px-3.5 py-3 text-[13px] leading-relaxed text-foreground">
        {json || <span className="italic text-label-3">Empty</span>}
      </div>
    </div>
  );
}

/** Tool call display — Phoenix-style with green output card */
function ToolCallBlock({ input, output }: { input: unknown; output: unknown }) {
  const hasInput = input !== null && input !== undefined;
  const hasOutput = output !== null && output !== undefined;
  return (
    <div className="space-y-3">
      {hasInput && (
        <div className={IO_CARD_CLASS}>
          <div className={cn(IO_HEAD_CLASS, 'border-border')}>
            <SpanKindIcon kind="TOOL" variant="outline" size={16} />
            <span className={cn(IO_LABEL_CLASS, 'text-label-2')}>Input</span>
          </div>
          <div className="p-3">
            <JsonBlock data={input} label="tool input" />
          </div>
        </div>
      )}
      {hasOutput && (
        <div className={cn('overflow-hidden rounded-[18px] border', OUTPUT_CARD_STYLE.border, OUTPUT_CARD_STYLE.bg)}>
          <div className={cn(IO_HEAD_CLASS, OUTPUT_CARD_STYLE.border)}>
            <span className={cn(IO_LABEL_CLASS, 'text-success')}>Output</span>
          </div>
          <div className="p-3">
            <JsonBlock data={output} label="tool result" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Attribute row */
function AttrRow({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  return (
    <div className="flex items-start border-b border-border last:border-b-0">
      <span className="w-1/3 flex-shrink-0 bg-fill px-3.5 py-2 font-mono text-xs text-label-2">
        {label}
      </span>
      <span className="flex-1 break-all px-3.5 py-2 font-mono text-xs text-foreground">
        {value === null || value === undefined ? '—' : String(value)}
      </span>
    </div>
  );
}

/* ---------- I/O Tab Content ---------- */

/** Render structured input/output for AGENT spans (Phoenix-style session overview) */
function AgentIOContent({ span }: { span: Span }) {
  const inputStr = span.input != null
    ? (typeof span.input === 'string' ? span.input : JSON.stringify(span.input, null, 2))
    : null;
  const outputData = span.output;

  return (
    <div className="space-y-4 p-4">
      {/* Input card — neutral */}
      <div className={IO_CARD_CLASS}>
        <div className={cn(IO_HEAD_CLASS, 'border-border')}>
          <SpanKindIcon kind="AGENT" variant="outline" size={16} />
          <span className={cn(IO_LABEL_CLASS, 'text-label-2')}>
            Input
          </span>
        </div>
        <div className="p-3">
          {inputStr ? (
            <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
              {inputStr}
            </div>
          ) : (
            <div className={EMPTY_CLASS}>No input recorded</div>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <ArrowRight className="h-4 w-4 rotate-90 text-label-3" strokeWidth={1.75} />
      </div>

      {/* Output card — green */}
      <div className={cn('overflow-hidden rounded-[18px] border', OUTPUT_CARD_STYLE.border, OUTPUT_CARD_STYLE.bg)}>
        <div className={cn(IO_HEAD_CLASS, OUTPUT_CARD_STYLE.border)}>
          <span className={cn(IO_LABEL_CLASS, 'text-success')}>
            Output
          </span>
        </div>
        <div className="p-3">
          {outputData != null ? (
            <JsonBlock data={outputData} label="output" />
          ) : (
            <div className={EMPTY_CLASS}>No output recorded</div>
          )}
        </div>
      </div>

      {/* Cumulative stats if available */}
      {span.cumulative && (
        <div className="lumen-card rounded-[20px] px-4 py-3.5">
          <div className={cn(IO_LABEL_CLASS, 'mb-2.5 text-label-3')}>
            Cumulative Stats
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-label-2">Spans</div>
              <div className="mt-0.5 font-mono text-lg font-bold tracking-[-0.02em] text-foreground">{span.cumulative.spanCount}</div>
            </div>
            <div>
              <div className="text-label-2">Tokens</div>
              <div className="mt-0.5 font-mono text-lg font-bold tracking-[-0.02em] text-foreground">{formatTokens(span.cumulative.tokenUsage.totalTokens)}</div>
            </div>
            <div>
              <div className="text-label-2">Cost</div>
              <div className="mt-0.5 font-mono text-lg font-bold tracking-[-0.02em] text-foreground">${span.cumulative.costUsd.toFixed(4)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Render structured input/output for CHAIN spans */
function ChainIOContent({ span }: { span: Span }) {
  const inputData = span.input;
  const outputData = span.output;

  return (
    <div className="space-y-4 p-4">
      {/* Input card — neutral */}
      <div className={IO_CARD_CLASS}>
        <div className={cn(IO_HEAD_CLASS, 'border-border')}>
          <SpanKindIcon kind="CHAIN" variant="outline" size={16} />
          <span className={cn(IO_LABEL_CLASS, 'text-label-2')}>
            Input
          </span>
        </div>
        <div className="p-3">
          {inputData != null ? (
            typeof inputData === 'string' ? (
              <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                {inputData}
              </div>
            ) : (
              <JsonBlock data={inputData} label="input" />
            )
          ) : (
            <div className={EMPTY_CLASS}>No input recorded</div>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <ArrowRight className="h-4 w-4 rotate-90 text-label-3" strokeWidth={1.75} />
      </div>

      {/* Output card — green */}
      <div className={cn('overflow-hidden rounded-[18px] border', OUTPUT_CARD_STYLE.border, OUTPUT_CARD_STYLE.bg)}>
        <div className={cn(IO_HEAD_CLASS, OUTPUT_CARD_STYLE.border)}>
          <span className={cn(IO_LABEL_CLASS, 'text-success')}>
            Output
          </span>
        </div>
        <div className="p-3">
          {outputData != null ? (
            <JsonBlock data={outputData} label="output" />
          ) : (
            <div className={EMPTY_CLASS}>No output recorded</div>
          )}
        </div>
      </div>
    </div>
  );
}

function IOTabContent({ span }: { span: Span }) {
  // For AGENT spans — show Phoenix-style session overview
  if (span.kind === 'AGENT') {
    return <AgentIOContent span={span} />;
  }

  // For CHAIN spans — show structured pipeline I/O
  if (span.kind === 'CHAIN') {
    return <ChainIOContent span={span} />;
  }

  // For LLM spans — show chat-style messages with Phoenix role colors
  if (span.kind === 'LLM') {
    const inputStr = typeof span.input === 'string' ? span.input : JSON.stringify(span.input, null, 2);
    const outputStr = typeof span.output === 'string' ? span.output : JSON.stringify(span.output, null, 2);

    return (
      <div className="space-y-4 p-4">
        {/* Model & Cost header bar */}
        {span.model && (
          <div className="flex items-center gap-3 rounded-[14px] border border-edge bg-mat-thin px-3 py-2">
            <SpanKindIcon kind="LLM" variant="outline" size={16} />
            <Badge variant="secondary" className="text-xs font-mono">{span.model}</Badge>
            {span.modelRole && (
              <span className="text-[11px] text-label-2">{span.modelRole}</span>
            )}
            {span.tokenUsage && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="font-mono text-[11px] text-chart-4">
                  ↑{formatTokens(span.tokenUsage.inputTokens)}
                </span>
                <span className="text-[11px] text-label-3">/</span>
                <span className="font-mono text-[11px] text-chart-1">
                  ↓{formatTokens(span.tokenUsage.outputTokens)}
                </span>
                {span.costUsd !== null && span.costUsd > 0 && (
                  <>
                    <span className="text-[11px] text-label-3">·</span>
                    <span className="font-mono text-[11px] text-label-2">
                      ${span.costUsd.toFixed(4)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Token usage bar — prompt = chart-4, completion = chart-1 */}
        {span.tokenUsage && span.tokenUsage.totalTokens > 0 && (
          <div className="flex h-1.5 overflow-hidden rounded-full bg-chip">
            <div style={{ width: `${(span.tokenUsage.inputTokens / span.tokenUsage.totalTokens) * 100}%` }} className="h-full bg-chart-4" />
            <div style={{ width: `${(span.tokenUsage.outputTokens / span.tokenUsage.totalTokens) * 100}%` }} className="h-full bg-chart-1" />
          </div>
        )}

        {/* Chat messages with Phoenix role-based card colors */}
        <ChatMessage role="user" content={inputStr ?? ''} tokens={span.tokenUsage?.inputTokens} />
        <div className="flex justify-center">
          <ArrowRight className="h-4 w-4 rotate-90 text-label-3" strokeWidth={1.75} />
        </div>
        <ChatMessage role="assistant" content={outputStr ?? ''} tokens={span.tokenUsage?.outputTokens} />
      </div>
    );
  }

  // For TOOL spans — show tool call format
  if (span.kind === 'TOOL') {
    return (
      <div className="p-4">
        <ToolCallBlock input={span.input} output={span.output} />
      </div>
    );
  }

  // Default: input + output blocks with Phoenix styling
  return (
    <div className="p-4 space-y-4">
      <div className={IO_CARD_CLASS}>
        <div className={cn(IO_HEAD_CLASS, 'border-border')}>
          <SpanKindIcon kind={span.kind} variant="outline" size={14} />
          <span className={cn(IO_LABEL_CLASS, 'text-label-2')}>Input</span>
        </div>
        <div className="p-3">
          <JsonBlock data={span.input} label="input" />
        </div>
      </div>
      <div className={cn('overflow-hidden rounded-[18px] border', OUTPUT_CARD_STYLE.border, OUTPUT_CARD_STYLE.bg)}>
        <div className={cn(IO_HEAD_CLASS, OUTPUT_CARD_STYLE.border)}>
          <ArrowRight className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
          <span className={cn(IO_LABEL_CLASS, 'text-success')}>Output</span>
        </div>
        <div className="p-3">
          <JsonBlock data={span.output} label="output" />
        </div>
      </div>
    </div>
  );
}

/* ---------- Attributes Tab Content ---------- */

function AttributesTabContent({ span }: { span: Span }) {
  const entries: Array<[string, string | number | boolean | null | undefined]> = [];

  // Standard attributes
  entries.push(['span.id', span.spanId]);
  entries.push(['span.kind', span.kind]);
  entries.push(['span.status', span.status]);
  entries.push(['span.name', span.name]);
  entries.push(['span.latency_ms', span.latencyMs]);
  entries.push(['span.start_time', span.startTime]);
  if (span.endTime) entries.push(['span.end_time', span.endTime]);
  if (span.parentSpanId) entries.push(['span.parent_id', span.parentSpanId]);
  if (span.model) entries.push(['llm.model', span.model]);
  if (span.modelRole) entries.push(['llm.model_role', span.modelRole]);
  if (span.tokenUsage) {
    entries.push(['llm.tokens.input', span.tokenUsage.inputTokens]);
    entries.push(['llm.tokens.output', span.tokenUsage.outputTokens]);
    entries.push(['llm.tokens.total', span.tokenUsage.totalTokens]);
  }
  if (span.costUsd !== null && span.costUsd !== undefined) {
    entries.push(['llm.cost_usd', span.costUsd]);
  }

  // Custom attributes
  if (span.attributes && typeof span.attributes === 'object') {
    for (const [k, v] of Object.entries(span.attributes as Record<string, unknown>)) {
      entries.push([k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]);
    }
  }

  return (
    <div className="m-4 overflow-hidden rounded-[18px] border border-edge bg-mat-thin">
      {entries.map(([key, val]) => (
        <AttrRow key={key} label={key} value={val} />
      ))}
    </div>
  );
}

/* ---------- Main Component ---------- */

export function SpanDetailPanel() {
  const span = useObservatoryStore((s) => s.selectedSpan);
  const selectedSpanId = useObservatoryStore((s) => s.selectedSpanId);

  if (!selectedSpanId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-label-2">
        <div className="flex flex-col items-center space-y-2 text-center">
          <SpanKindIcon kind="CHAIN" variant="outline" size={32} />
          <div className="text-label-3">Select a span to view details</div>
        </div>
      </div>
    );
  }

  if (!span) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-label-2">
        Loading span detail...
      </div>
    );
  }

  const kindColor = getSpanKindColor(span.kind);

  return (
    <div className="flex flex-col h-full">
      {/* ── Phoenix-style Span header ── */}
      <div className="flex flex-shrink-0 items-center gap-2 px-4 pb-2.5 pt-1">
        <span style={{ color: kindColor }}>
          <SpanKindIcon kind={span.kind} variant="fill" size={18} />
        </span>
        <span className="truncate text-[15px] font-bold text-foreground">{span.name}</span>
        <SpanKindToken kind={span.kind} size="S" />
        <SpanStatusIcon status={span.status} size={14} />

        <div className="ml-auto flex items-center gap-3 text-[11px] text-label-2">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatLatency(span.latencyMs)}
          </span>
          {span.tokenUsage && (
            <span className="flex items-center gap-1 font-mono">
              {formatTokens(span.tokenUsage.totalTokens)} tokens
            </span>
          )}
          {span.costUsd !== null && span.costUsd !== undefined && span.costUsd > 0 && (
            <span className="flex items-center gap-1">
              <Coins className="w-3 h-3" />
              ${span.costUsd.toFixed(4)}
            </span>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {span.error && (
        <div className="mx-4 mb-2.5 flex items-start gap-2.5 rounded-[14px] border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
          <pre className="font-mono text-xs whitespace-pre-wrap break-words">{span.error}</pre>
        </div>
      )}

      {/* ── Tab content — kind-colored active indicator ── */}
      <Tabs defaultValue="io" className="flex-1 flex flex-col min-h-0">
        <div className="flex-shrink-0 border-b border-border px-4 pb-2.5">
          <TabsList>
            {(['io', 'attributes', 'json'] as const).map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {tab === 'io' ? 'Inputs / Outputs' : tab === 'attributes' ? 'Attributes' : 'JSON'}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="io" className="mt-0 data-[state=inactive]:hidden">
            <IOTabContent span={span} />
          </TabsContent>
          <TabsContent value="attributes" className="mt-0 data-[state=inactive]:hidden">
            <AttributesTabContent span={span} />
          </TabsContent>
          <TabsContent value="json" className="mt-0 p-4 data-[state=inactive]:hidden">
            <JsonBlock data={span} label="span" />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
