// EX4-E.4: Span Detail Panel — Phoenix-style tabbed detail view
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
      className="p-1 rounded text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]/30 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  if (data === null || data === undefined) {
    return (
      <div className="text-xs text-[rgb(var(--muted-foreground))] p-4 italic">
        No {label} data
      </div>
    );
  }
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return (
    <div className="relative group">
      <pre className="text-xs font-mono bg-[rgb(var(--muted))]/20 rounded-lg p-4 overflow-auto max-h-[500px] whitespace-pre-wrap break-words text-[rgb(var(--foreground))]">
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
    <div className={`rounded-lg border ${roleStyle.border} ${roleStyle.bg} overflow-hidden`}>
      {/* Role header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-inherit">
        <span className="text-[11px] font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wide">
          {role}
        </span>
        <div className="flex items-center gap-2">
          {tokens !== undefined && tokens > 0 && (
            <span className="text-[10px] font-mono text-[rgb(var(--muted-foreground))]">
              {formatTokens(tokens)} tokens
            </span>
          )}
          <CopyButton text={json} />
        </div>
      </div>
      {/* Content */}
      <div className="p-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words text-[rgb(var(--foreground))]">
        {json || <span className="italic text-[rgb(var(--muted-foreground))]">Empty</span>}
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
        <div className="rounded-lg border border-[rgb(var(--border))]/30 bg-zinc-800/50 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[rgb(var(--border))]/30">
            <SpanKindIcon kind="TOOL" variant="outline" size={16} />
            <span className="text-[11px] font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wide">Input</span>
          </div>
          <div className="p-3">
            <JsonBlock data={input} label="tool input" />
          </div>
        </div>
      )}
      {hasOutput && (
        <div className={`rounded-lg border ${OUTPUT_CARD_STYLE.border} ${OUTPUT_CARD_STYLE.bg} overflow-hidden`}>
          <div className={`flex items-center gap-2 px-3 py-1.5 border-b ${OUTPUT_CARD_STYLE.border}`}>
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide">Output</span>
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
    <div className="flex items-start border-b border-[rgb(var(--border))]/30 last:border-b-0">
      <span className="text-xs font-mono text-[rgb(var(--muted-foreground))] py-2 px-3 w-1/3 flex-shrink-0 bg-[rgb(var(--muted))]/15">
        {label}
      </span>
      <span className="text-xs font-mono text-[rgb(var(--foreground))] py-2 px-3 flex-1 break-all">
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
      <div className="rounded-lg border border-[rgb(var(--border))]/30 bg-zinc-800/50 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[rgb(var(--border))]/30">
          <SpanKindIcon kind="AGENT" variant="outline" size={16} />
          <span className="text-[11px] font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wide">
            Input
          </span>
        </div>
        <div className="p-3">
          {inputStr ? (
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words text-[rgb(var(--foreground))]">
              {inputStr}
            </div>
          ) : (
            <div className="text-xs text-[rgb(var(--muted-foreground))] italic">No input recorded</div>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <ArrowRight className="w-4 h-4 text-[rgb(var(--muted-foreground))]/30" />
      </div>

      {/* Output card — green */}
      <div className={`rounded-lg border ${OUTPUT_CARD_STYLE.border} ${OUTPUT_CARD_STYLE.bg} overflow-hidden`}>
        <div className={`flex items-center gap-2 px-3 py-1.5 border-b ${OUTPUT_CARD_STYLE.border}`}>
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide">
            Output
          </span>
        </div>
        <div className="p-3">
          {outputData != null ? (
            <JsonBlock data={outputData} label="output" />
          ) : (
            <div className="text-xs text-[rgb(var(--muted-foreground))] italic">No output recorded</div>
          )}
        </div>
      </div>

      {/* Cumulative stats if available */}
      {span.cumulative && (
        <div className="rounded-lg border border-[rgb(var(--border))]/30 p-3 bg-[rgb(var(--muted))]/10">
          <div className="text-[10px] font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wide mb-2">
            Cumulative Stats
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-[rgb(var(--muted-foreground))]">Spans</div>
              <div className="font-mono font-bold text-[rgb(var(--foreground))]">{span.cumulative.spanCount}</div>
            </div>
            <div>
              <div className="text-[rgb(var(--muted-foreground))]">Tokens</div>
              <div className="font-mono font-bold text-[rgb(var(--foreground))]">{formatTokens(span.cumulative.tokenUsage.totalTokens)}</div>
            </div>
            <div>
              <div className="text-[rgb(var(--muted-foreground))]">Cost</div>
              <div className="font-mono font-bold text-[rgb(var(--foreground))]">${span.cumulative.costUsd.toFixed(4)}</div>
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
      <div className="rounded-lg border border-[rgb(var(--border))]/30 bg-zinc-800/50 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[rgb(var(--border))]/30">
          <SpanKindIcon kind="CHAIN" variant="outline" size={16} />
          <span className="text-[11px] font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wide">
            Input
          </span>
        </div>
        <div className="p-3">
          {inputData != null ? (
            typeof inputData === 'string' ? (
              <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words text-[rgb(var(--foreground))]">
                {inputData}
              </div>
            ) : (
              <JsonBlock data={inputData} label="input" />
            )
          ) : (
            <div className="text-xs text-[rgb(var(--muted-foreground))] italic">No input recorded</div>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <ArrowRight className="w-4 h-4 text-[rgb(var(--muted-foreground))]/30" />
      </div>

      {/* Output card — green */}
      <div className={`rounded-lg border ${OUTPUT_CARD_STYLE.border} ${OUTPUT_CARD_STYLE.bg} overflow-hidden`}>
        <div className={`flex items-center gap-2 px-3 py-1.5 border-b ${OUTPUT_CARD_STYLE.border}`}>
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide">
            Output
          </span>
        </div>
        <div className="p-3">
          {outputData != null ? (
            <JsonBlock data={outputData} label="output" />
          ) : (
            <div className="text-xs text-[rgb(var(--muted-foreground))] italic">No output recorded</div>
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
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[rgb(var(--muted))]/15 border border-[rgb(var(--border))]/30">
            <SpanKindIcon kind="LLM" variant="outline" size={16} />
            <Badge variant="secondary" className="text-xs font-mono">{span.model}</Badge>
            {span.modelRole && (
              <span className="text-[11px] text-[rgb(var(--muted-foreground))]">{span.modelRole}</span>
            )}
            {span.tokenUsage && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] font-mono" style={{ color: 'rgba(254, 119, 99, 1)' }}>
                  ↑{formatTokens(span.tokenUsage.inputTokens)}
                </span>
                <span className="text-[11px] text-[rgb(var(--muted-foreground))]">/</span>
                <span className="text-[11px] font-mono" style={{ color: 'rgba(98, 104, 239, 1)' }}>
                  ↓{formatTokens(span.tokenUsage.outputTokens)}
                </span>
                {span.costUsd !== null && span.costUsd > 0 && (
                  <>
                    <span className="text-[11px] text-[rgb(var(--muted-foreground))]">·</span>
                    <span className="text-[11px] font-mono text-[rgb(var(--muted-foreground))]">
                      ${span.costUsd.toFixed(4)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Token usage bar — Phoenix colors: prompt=salmon, completion=purple */}
        {span.tokenUsage && span.tokenUsage.totalTokens > 0 && (
          <div className="flex rounded-full overflow-hidden h-1.5 bg-[rgb(var(--muted))]/30">
            <div style={{ width: `${(span.tokenUsage.inputTokens / span.tokenUsage.totalTokens) * 100}%`, backgroundColor: 'rgba(254, 119, 99, 1)' }} className="h-full" />
            <div style={{ width: `${(span.tokenUsage.outputTokens / span.tokenUsage.totalTokens) * 100}%`, backgroundColor: 'rgba(98, 104, 239, 1)' }} className="h-full" />
          </div>
        )}

        {/* Chat messages with Phoenix role-based card colors */}
        <ChatMessage role="user" content={inputStr ?? ''} tokens={span.tokenUsage?.inputTokens} />
        <div className="flex justify-center">
          <ArrowRight className="w-4 h-4 text-[rgb(var(--muted-foreground))]/30" />
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
      <div className="rounded-lg border border-[rgb(var(--border))]/30 bg-zinc-800/50 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[rgb(var(--border))]/20 bg-zinc-800/60">
          <SpanKindIcon kind={span.kind} variant="outline" size={14} />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--muted-foreground))]">Input</span>
        </div>
        <div className="p-3">
          <JsonBlock data={span.input} label="input" />
        </div>
      </div>
      <div className={`rounded-lg border overflow-hidden ${OUTPUT_CARD_STYLE}`}>
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-emerald-500/20 bg-emerald-950/40">
          <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Output</span>
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
    <div className="rounded-lg border border-[rgb(var(--border))]/30 overflow-hidden m-4">
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
      <div className="flex items-center justify-center h-full text-[rgb(var(--muted-foreground))] text-sm">
        <div className="text-center space-y-2">
          <SpanKindIcon kind="CHAIN" variant="outline" size={32} />
          <div className="opacity-50">Select a span to view details</div>
        </div>
      </div>
    );
  }

  if (!span) {
    return (
      <div className="flex items-center justify-center h-full text-[rgb(var(--muted-foreground))] text-sm">
        Loading span detail...
      </div>
    );
  }

  const kindColor = getSpanKindColor(span.kind);

  return (
    <div className="flex flex-col h-full">
      {/* ── Phoenix-style Span header ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[rgb(var(--border))]/50 flex-shrink-0">
        <span style={{ color: kindColor }}>
          <SpanKindIcon kind={span.kind} variant="fill" size={18} />
        </span>
        <span className="text-sm font-semibold text-[rgb(var(--foreground))] truncate">{span.name}</span>
        <SpanKindToken kind={span.kind} size="S" />
        <SpanStatusIcon status={span.status} size={14} />

        <div className="ml-auto flex items-center gap-3 text-[11px] text-[rgb(var(--muted-foreground))]">
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
        <div className="flex items-start gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-[13px] text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <pre className="font-mono text-xs whitespace-pre-wrap break-words">{span.error}</pre>
        </div>
      )}

      {/* ── Tab content — kind-colored active indicator ── */}
      <Tabs defaultValue="io" className="flex-1 flex flex-col min-h-0">
        <div className="flex-shrink-0 border-b border-[rgb(var(--border))]/50 px-4">
          <TabsList className="h-8 bg-transparent p-0 gap-0">
            {(['io', 'attributes', 'json'] as const).map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="text-xs h-8 rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                style={{ '--tw-border-opacity': 1 } as React.CSSProperties}
                data-kind-color={kindColor}
              >
                {tab === 'io' ? 'Inputs / Outputs' : tab === 'attributes' ? 'Attributes' : 'JSON'}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Inject kind-colored active tab indicator */}
        <style>{`
          [data-kind-color][data-state="active"] {
            border-bottom-color: ${kindColor} !important;
          }
        `}</style>

        <ScrollArea className="flex-1">
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
