// EX4-A.2: TraceStore — In-Memory Ring Buffer for LLM Observatory Traces
// @see docs/phases/phase-ex4.md
//
// Stores traces and spans with bounded capacity. Ring buffer evicts oldest
// traces when full. Cumulative token/cost rollup at span-end time.

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  Span,
  Trace,
  TraceSummary,
  SpanTreeNode,
  SpanKind,
  SpanStatus,
  TokenUsage,
  CumulativeUsage,
  ObservatoryStats,
  TraceTrigger,
  ModelRole,
  ObservatoryEvent,
} from 'headlessos-shared/schemas/observatory';

// ── Types ──

export interface StartSpanOpts {
  traceId: string;
  parentSpanId: string | null;
  name: string;
  kind: SpanKind;
  input?: unknown;
  attributes?: Record<string, unknown>;
}

export interface SpanResult {
  status?: SpanStatus;
  output?: unknown;
  error?: string;
  model?: string;
  modelRole?: ModelRole;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  attributes?: Record<string, unknown>;
}

export interface ListOpts {
  limit?: number;
  offset?: number;
  trigger?: TraceTrigger;
  status?: SpanStatus;
  serverId?: string;
}

// ── Model Pricing (shared with usage-tracker) ──

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-6-luna': { input: 0.0001, output: 0.0005 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-5.4': { input: 0.01, output: 0.04 },
  'o4-mini': { input: 0.0011, output: 0.0044 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-4-sonnet': { input: 0.003, output: 0.015 },
};
/** EX10.7: a model not in the table has no known price (local models cost nothing) */
function getPricing(model: string): { input: number; output: number } | undefined {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) return pricing;
  }
  return undefined;
}

function computeCost(model: string, tokenUsage: TokenUsage): number | null {
  const pricing = getPricing(model);
  if (!pricing) return null;
  return (tokenUsage.inputTokens / 1000) * pricing.input +
         (tokenUsage.outputTokens / 1000) * pricing.output;
}

// ── TraceStore ──

export class TraceStore extends EventEmitter {
  private traces = new Map<string, Trace>();
  private spans = new Map<string, Span>();
  private traceSpans = new Map<string, Set<string>>();
  private traceOrder: string[] = [];
  private readonly maxTraces: number;

  constructor(maxTraces = 200) {
    super();
    this.maxTraces = maxTraces;
  }

  // ── Write Operations ──

  startTrace(name: string, opts?: { serverId?: string; trigger?: TraceTrigger }): { trace: Trace; rootSpan: Span } {
    // Evict if at capacity
    while (this.traces.size >= this.maxTraces && this.traceOrder.length > 0) {
      this.evictOldest();
    }

    const traceId = randomUUID();
    const rootSpanId = randomUUID();
    const now = new Date().toISOString();

    const rootSpan: Span = {
      spanId: rootSpanId,
      traceId,
      parentSpanId: null,
      name,
      kind: 'AGENT',
      status: 'RUNNING',
      startTime: now,
      endTime: null,
      latencyMs: null,
      model: null,
      modelRole: null,
      tokenUsage: null,
      costUsd: null,
      input: null,
      output: null,
      error: null,
      cumulative: null,
    };

    const trace: Trace = {
      traceId,
      rootSpanId,
      name,
      status: 'RUNNING',
      startTime: now,
      endTime: null,
      latencyMs: null,
      totalTokens: 0,
      totalCostUsd: 0,
      totalSpans: 1,
      spansByKind: { LLM: 0, CHAIN: 0, AGENT: 1, TOOL: 0 },
      serverId: opts?.serverId ?? null,
      trigger: opts?.trigger ?? null,
    };

    this.traces.set(traceId, trace);
    this.spans.set(rootSpanId, rootSpan);
    this.traceSpans.set(traceId, new Set([rootSpanId]));
    this.traceOrder.push(traceId);

    this.emit('event', { type: 'trace:start', trace } satisfies ObservatoryEvent);

    return { trace, rootSpan };
  }

  endTrace(traceId: string): Trace | undefined {
    const trace = this.traces.get(traceId);
    if (!trace) return undefined;

    const rootSpan = this.spans.get(trace.rootSpanId);
    if (!rootSpan) return undefined;

    // If root span is still running, end it first
    if (rootSpan.status === 'RUNNING') {
      this.endSpan(rootSpan.spanId);
    }

    // Refresh root span (may have changed in recursive endSpan)
    const updatedRoot = this.spans.get(trace.rootSpanId)!;

    const now = updatedRoot.endTime ?? new Date().toISOString();
    const latencyMs = updatedRoot.latencyMs ?? (new Date(now).getTime() - new Date(trace.startTime).getTime());

    const cumulative = updatedRoot.cumulative;
    const updatedTrace: Trace = {
      ...trace,
      status: updatedRoot.status === 'ERROR' ? 'ERROR' : 'OK',
      endTime: now,
      latencyMs,
      totalTokens: cumulative?.tokenUsage.totalTokens ?? 0,
      totalCostUsd: cumulative?.costUsd ?? 0,
      totalSpans: cumulative?.spanCount ?? this.getTraceSpanCount(traceId),
    };

    // Compute spansByKind
    const spanSet = this.traceSpans.get(traceId);
    if (spanSet) {
      const byKind: Record<string, number> = { LLM: 0, CHAIN: 0, AGENT: 0, TOOL: 0 };
      for (const sid of spanSet) {
        const s = this.spans.get(sid);
        if (s) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
      }
      updatedTrace.spansByKind = byKind;
    }

    this.traces.set(traceId, updatedTrace);
    this.emit('event', { type: 'trace:end', trace: updatedTrace } satisfies ObservatoryEvent);

    return updatedTrace;
  }

  startSpan(opts: StartSpanOpts): Span {
    const now = new Date().toISOString();
    const span: Span = {
      spanId: randomUUID(),
      traceId: opts.traceId,
      parentSpanId: opts.parentSpanId,
      name: opts.name,
      kind: opts.kind,
      status: 'RUNNING',
      startTime: now,
      endTime: null,
      latencyMs: null,
      model: null,
      modelRole: null,
      tokenUsage: null,
      costUsd: null,
      input: opts.input ?? null,
      output: null,
      error: null,
      cumulative: null,
      attributes: opts.attributes,
    };

    this.spans.set(span.spanId, span);

    // Add to trace's span set
    const spanSet = this.traceSpans.get(opts.traceId);
    if (spanSet) {
      spanSet.add(span.spanId);
    }

    // Update trace totalSpans count
    const trace = this.traces.get(opts.traceId);
    if (trace) {
      const updated = { ...trace, totalSpans: trace.totalSpans + 1 };
      const byKind = { ...trace.spansByKind };
      byKind[opts.kind] = (byKind[opts.kind] ?? 0) + 1;
      updated.spansByKind = byKind;
      this.traces.set(opts.traceId, updated);
    }

    this.emit('event', {
      type: 'span:start',
      traceId: opts.traceId,
      span,
    } satisfies ObservatoryEvent);

    return span;
  }

  endSpan(spanId: string, result?: SpanResult): Span | undefined {
    const span = this.spans.get(spanId);
    if (!span) return undefined;
    if (span.status !== 'RUNNING') return span; // already ended

    const now = new Date().toISOString();
    const latencyMs = new Date(now).getTime() - new Date(span.startTime).getTime();

    const status = result?.error ? 'ERROR' : (result?.status ?? 'OK');
    const tokenUsage = result?.tokenUsage ?? span.tokenUsage ?? null;
    const model = result?.model ?? span.model;
    // EX10.7: a cost the span already carries wins (the router sets 0 for local models);
    // otherwise known models are priced and unknown ones left unpriced, never guessed
    const setCost = result?.costUsd ?? span.costUsd;
    const costUsd = typeof setCost === 'number' ? setCost : (model && tokenUsage) ? computeCost(model, tokenUsage) : null;

    // Compute cumulative for this span
    const childCumulative = this.computeChildrenCumulative(spanId, span.traceId);

    const ownTokens: TokenUsage = tokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const ownCost = costUsd ?? 0;

    const cumulative: CumulativeUsage = {
      tokenUsage: {
        inputTokens: ownTokens.inputTokens + childCumulative.inputTokens,
        outputTokens: ownTokens.outputTokens + childCumulative.outputTokens,
        totalTokens: ownTokens.totalTokens + childCumulative.totalTokens,
      },
      costUsd: ownCost + childCumulative.costUsd,
      spanCount: 1 + childCumulative.spanCount,
    };

    const updatedSpan: Span = {
      ...span,
      status,
      endTime: now,
      latencyMs,
      model: model ?? null,
      modelRole: result?.modelRole ?? span.modelRole,
      tokenUsage,
      costUsd: costUsd ?? null,
      output: span.output ?? result?.output ?? null,
      error: result?.error ?? null,
      cumulative,
      attributes: result?.attributes
        ? { ...span.attributes, ...result.attributes }
        : span.attributes,
    };

    this.spans.set(spanId, updatedSpan);

    this.emit('event', {
      type: 'span:end',
      traceId: span.traceId,
      span: updatedSpan,
    } satisfies ObservatoryEvent);

    return updatedSpan;
  }

  // ── Read Operations ──

  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  getTraceSpans(traceId: string): Span[] {
    const spanIds = this.traceSpans.get(traceId);
    if (!spanIds) return [];
    const spans: Span[] = [];
    for (const id of spanIds) {
      const span = this.spans.get(id);
      if (span) spans.push(span);
    }
    return spans.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  getSpanTree(traceId: string): SpanTreeNode | undefined {
    const spans = this.getTraceSpans(traceId);
    if (spans.length === 0) return undefined;

    const trace = this.traces.get(traceId);
    if (!trace) return undefined;

    // Build tree from flat list
    const nodeMap = new Map<string, SpanTreeNode>();
    for (const span of spans) {
      nodeMap.set(span.spanId, { span, children: [] });
    }

    let root: SpanTreeNode | undefined;
    for (const span of spans) {
      const node = nodeMap.get(span.spanId)!;
      if (span.parentSpanId && nodeMap.has(span.parentSpanId)) {
        nodeMap.get(span.parentSpanId)!.children.push(node);
      } else if (span.spanId === trace.rootSpanId || !span.parentSpanId) {
        root = node;
      }
    }

    // Sort children by startTime
    if (root) {
      this.sortTreeChildren(root);
    }

    return root;
  }

  listTraces(opts?: ListOpts): { traces: TraceSummary[]; total: number } {
    let traces = [...this.traces.values()];

    // Apply filters
    if (opts?.trigger) {
      traces = traces.filter(t => t.trigger === opts.trigger);
    }
    if (opts?.status) {
      traces = traces.filter(t => t.status === opts.status);
    }
    if (opts?.serverId) {
      traces = traces.filter(t => t.serverId === opts.serverId);
    }

    // Sort by most recent first
    traces.sort((a, b) => b.startTime.localeCompare(a.startTime));

    const total = traces.length;
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    return {
      traces: traces.slice(offset, offset + limit),
      total,
    };
  }

  getStats(): ObservatoryStats {
    const allTraces = [...this.traces.values()];
    const allSpans = [...this.spans.values()];

    let totalTokens = 0;
    let totalCostUsd = 0;
    let totalLatencyMs = 0;
    let completedTraces = 0;
    const tracesByTrigger: Record<string, number> = {};
    const spansByKind: Record<string, number> = {};
    const tokensByModel: Record<string, number> = {};
    const costByModel: Record<string, number> = {};

    for (const trace of allTraces) {
      totalTokens += trace.totalTokens;
      totalCostUsd += trace.totalCostUsd;
      if (trace.latencyMs !== null) {
        totalLatencyMs += trace.latencyMs;
        completedTraces++;
      }
      const trigger = trace.trigger ?? 'unknown';
      tracesByTrigger[trigger] = (tracesByTrigger[trigger] ?? 0) + 1;
    }

    for (const span of allSpans) {
      spansByKind[span.kind] = (spansByKind[span.kind] ?? 0) + 1;
      if (span.tokenUsage && span.model) {
        tokensByModel[span.model] = (tokensByModel[span.model] ?? 0) + span.tokenUsage.totalTokens;
        costByModel[span.model] = (costByModel[span.model] ?? 0) + (span.costUsd ?? 0);
      }
    }

    // Recent traces (last 10)
    const recent = allTraces
      .sort((a, b) => b.startTime.localeCompare(a.startTime))
      .slice(0, 10);

    return {
      totalTraces: allTraces.length,
      totalSpans: allSpans.length,
      totalTokens,
      totalCostUsd,
      averageLatencyMs: completedTraces > 0
        ? Math.round(totalLatencyMs / completedTraces)
        : 0,
      tracesByTrigger,
      spansByKind,
      tokensByModel,
      costByModel,
      recentTraces: recent,
    };
  }

  // ── Lifecycle ──

  clear(): void {
    this.traces.clear();
    this.spans.clear();
    this.traceSpans.clear();
    this.traceOrder = [];
  }

  getSize(): { traces: number; spans: number; memoryEstimateBytes: number } {
    // Rough estimate: each span ~500 bytes metadata + variable content
    const avgSpanBytes = 500;
    const avgTraceBytes = 200;
    return {
      traces: this.traces.size,
      spans: this.spans.size,
      memoryEstimateBytes: this.spans.size * avgSpanBytes + this.traces.size * avgTraceBytes,
    };
  }

  // ── Internal ──

  private evictOldest(): void {
    const oldestId = this.traceOrder.shift();
    if (!oldestId) return;

    // Remove all spans for this trace
    const spanIds = this.traceSpans.get(oldestId);
    if (spanIds) {
      for (const sid of spanIds) {
        this.spans.delete(sid);
      }
    }

    this.traceSpans.delete(oldestId);
    this.traces.delete(oldestId);
  }

  private computeChildrenCumulative(
    parentSpanId: string,
    traceId: string,
  ): { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; spanCount: number } {
    const spanIds = this.traceSpans.get(traceId);
    if (!spanIds) return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, spanCount: 0 };

    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let costUsd = 0;
    let spanCount = 0;

    for (const sid of spanIds) {
      const span = this.spans.get(sid);
      if (!span || span.parentSpanId !== parentSpanId) continue;

      // Use cumulative if already computed (child was ended before parent)
      if (span.cumulative) {
        inputTokens += span.cumulative.tokenUsage.inputTokens;
        outputTokens += span.cumulative.tokenUsage.outputTokens;
        totalTokens += span.cumulative.tokenUsage.totalTokens;
        costUsd += span.cumulative.costUsd;
        spanCount += span.cumulative.spanCount;
      } else {
        // Child still running — use what we have
        const tokens = span.tokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        inputTokens += tokens.inputTokens;
        outputTokens += tokens.outputTokens;
        totalTokens += tokens.totalTokens;
        costUsd += span.costUsd ?? 0;
        spanCount += 1;
      }
    }

    return { inputTokens, outputTokens, totalTokens, costUsd, spanCount };
  }

  private getTraceSpanCount(traceId: string): number {
    return this.traceSpans.get(traceId)?.size ?? 0;
  }

  private sortTreeChildren(node: SpanTreeNode): void {
    node.children.sort((a, b) => a.span.startTime.localeCompare(b.span.startTime));
    for (const child of node.children) {
      this.sortTreeChildren(child);
    }
  }
}
