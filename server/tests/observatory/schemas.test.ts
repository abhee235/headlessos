// EX4-A.1: Observatory Schema Tests
// @see docs/phases/phase-ex4.md

import { describe, it, expect } from 'vitest';
import {
  SpanKindSchema,
  SpanStatusSchema,
  TokenUsageSchema,
  CumulativeUsageSchema,
  TraceTriggerSchema,
  ModelRoleSchema,
  SpanSchema,
  TraceSchema,
  TraceSummarySchema,
  SpanTreeNodeSchema,
  ObservatoryStatsSchema,
  ObservatoryEventSchema,
  TraceListQuerySchema,
  TraceListResponseSchema,
  TraceDetailResponseSchema,
  SpanDetailResponseSchema,
} from 'headlessos-shared/schemas/observatory';
import type { Span, Trace, SpanTreeNode } from 'headlessos-shared/schemas/observatory';

// ── Helpers ──

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    spanId: '00000000-0000-0000-0000-000000000001',
    traceId: '00000000-0000-0000-0000-000000000010',
    parentSpanId: null,
    name: 'test-span',
    kind: 'LLM',
    status: 'OK',
    startTime: '2025-01-01T00:00:00.000Z',
    endTime: '2025-01-01T00:00:01.000Z',
    latencyMs: 1000,
    model: 'gpt-4.1',
    modelRole: 'structured-output',
    tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    costUsd: 0.001,
    input: { messages: [{ role: 'user', content: 'hello' }] },
    output: { text: 'world' },
    error: null,
    cumulative: { tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, costUsd: 0.001, spanCount: 1 },
    ...overrides,
  };
}

function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    traceId: '00000000-0000-0000-0000-000000000010',
    rootSpanId: '00000000-0000-0000-0000-000000000001',
    name: 'UIAgent: test',
    status: 'OK',
    startTime: '2025-01-01T00:00:00.000Z',
    endTime: '2025-01-01T00:00:04.000Z',
    latencyMs: 4000,
    totalTokens: 500,
    totalCostUsd: 0.05,
    totalSpans: 5,
    spansByKind: { LLM: 3, CHAIN: 1, AGENT: 1, TOOL: 0 },
    serverId: 'server-1',
    trigger: 'ui-agent',
    ...overrides,
  };
}

// ── SpanKind ──

describe('SpanKindSchema', () => {
  it('accepts valid span kinds', () => {
    expect(SpanKindSchema.parse('LLM')).toBe('LLM');
    expect(SpanKindSchema.parse('AGENT')).toBe('AGENT');
    expect(SpanKindSchema.parse('CHAIN')).toBe('CHAIN');
    expect(SpanKindSchema.parse('TOOL')).toBe('TOOL');
  });

  it('rejects invalid span kinds', () => {
    expect(() => SpanKindSchema.parse('UNKNOWN')).toThrow();
    expect(() => SpanKindSchema.parse('')).toThrow();
    expect(() => SpanKindSchema.parse(42)).toThrow();
  });
});

// ── SpanStatus ──

describe('SpanStatusSchema', () => {
  it('accepts valid statuses', () => {
    expect(SpanStatusSchema.parse('RUNNING')).toBe('RUNNING');
    expect(SpanStatusSchema.parse('OK')).toBe('OK');
    expect(SpanStatusSchema.parse('ERROR')).toBe('ERROR');
  });

  it('rejects invalid statuses', () => {
    expect(() => SpanStatusSchema.parse('PENDING')).toThrow();
  });
});

// ── TokenUsage ──

describe('TokenUsageSchema', () => {
  it('accepts valid token usage', () => {
    const result = TokenUsageSchema.parse({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(result.inputTokens).toBe(100);
    expect(result.totalTokens).toBe(150);
  });

  it('rejects negative values', () => {
    expect(() => TokenUsageSchema.parse({ inputTokens: -1, outputTokens: 50, totalTokens: 49 })).toThrow();
  });

  it('rejects non-integer values', () => {
    expect(() => TokenUsageSchema.parse({ inputTokens: 1.5, outputTokens: 50, totalTokens: 51 })).toThrow();
  });
});

// ── CumulativeUsage ──

describe('CumulativeUsageSchema', () => {
  it('accepts valid cumulative usage', () => {
    const result = CumulativeUsageSchema.parse({
      tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      costUsd: 0.05,
      spanCount: 3,
    });
    expect(result.spanCount).toBe(3);
  });

  it('rejects zero spanCount', () => {
    expect(() =>
      CumulativeUsageSchema.parse({
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        costUsd: 0,
        spanCount: 0,
      }),
    ).toThrow();
  });
});

// ── Span ──

describe('SpanSchema', () => {
  it('accepts a valid LLM span', () => {
    const span = makeSpan();
    const result = SpanSchema.parse(span);
    expect(result.spanId).toBe(span.spanId);
    expect(result.kind).toBe('LLM');
    expect(result.model).toBe('gpt-4.1');
  });

  it('accepts a RUNNING span with null endTime', () => {
    const span = makeSpan({ status: 'RUNNING', endTime: null, latencyMs: null });
    const result = SpanSchema.parse(span);
    expect(result.status).toBe('RUNNING');
    expect(result.endTime).toBeNull();
  });

  it('accepts a CHAIN span without LLM-specific fields', () => {
    const span = makeSpan({
      kind: 'CHAIN',
      model: null,
      modelRole: null,
      tokenUsage: null,
      costUsd: null,
    });
    const result = SpanSchema.parse(span);
    expect(result.kind).toBe('CHAIN');
    expect(result.model).toBeNull();
  });

  it('accepts a span with error', () => {
    const span = makeSpan({ status: 'ERROR', error: 'Connection timeout' });
    const result = SpanSchema.parse(span);
    expect(result.error).toBe('Connection timeout');
  });

  it('accepts span with unknown input/output types', () => {
    const span = makeSpan({
      input: ['system msg', 'user msg'],
      output: { json: true, data: [1, 2, 3] },
    });
    const result = SpanSchema.parse(span);
    expect(result.input).toEqual(['system msg', 'user msg']);
  });

  it('accepts span with null input/output', () => {
    const span = makeSpan({ input: null, output: null });
    const result = SpanSchema.parse(span);
    expect(result.input).toBeNull();
    expect(result.output).toBeNull();
  });

  it('rejects invalid UUID for spanId', () => {
    expect(() => SpanSchema.parse(makeSpan({ spanId: 'not-a-uuid' }))).toThrow();
  });

  it('accepts span with attributes', () => {
    const span = makeSpan({ attributes: { retryCount: 2, source: 'test' } });
    const result = SpanSchema.parse(span);
    expect(result.attributes).toEqual({ retryCount: 2, source: 'test' });
  });
});

// ── Trace ──

describe('TraceSchema', () => {
  it('accepts a valid trace', () => {
    const trace = makeTrace();
    const result = TraceSchema.parse(trace);
    expect(result.traceId).toBe(trace.traceId);
    expect(result.totalTokens).toBe(500);
  });

  it('accepts a running trace with null endTime', () => {
    const trace = makeTrace({ status: 'RUNNING', endTime: null, latencyMs: null });
    const result = TraceSchema.parse(trace);
    expect(result.status).toBe('RUNNING');
  });

  it('accepts a trace with null serverId', () => {
    const trace = makeTrace({ serverId: null });
    const result = TraceSchema.parse(trace);
    expect(result.serverId).toBeNull();
  });

  it('accepts all trigger types', () => {
    for (const trigger of ['ui-agent', 'investigation-agent', 'dynamic-ui', 'api'] as const) {
      const trace = makeTrace({ trigger });
      expect(TraceSchema.parse(trace).trigger).toBe(trigger);
    }
  });
});

// ── TraceSummary (same shape as Trace) ──

describe('TraceSummarySchema', () => {
  it('accepts the same shape as TraceSchema', () => {
    const trace = makeTrace();
    const result = TraceSummarySchema.parse(trace);
    expect(result.traceId).toBe(trace.traceId);
  });
});

// ── SpanTreeNode (recursive) ──

describe('SpanTreeNodeSchema', () => {
  it('accepts a leaf node', () => {
    const node: SpanTreeNode = { span: makeSpan(), children: [] };
    const result = SpanTreeNodeSchema.parse(node);
    expect(result.span.spanId).toBe(node.span.spanId);
    expect(result.children).toEqual([]);
  });

  it('accepts a nested tree', () => {
    const tree: SpanTreeNode = {
      span: makeSpan({ kind: 'AGENT', name: 'root' }),
      children: [
        {
          span: makeSpan({ spanId: '00000000-0000-0000-0000-000000000002', kind: 'CHAIN', name: 'planner' }),
          children: [
            {
              span: makeSpan({ spanId: '00000000-0000-0000-0000-000000000003', kind: 'LLM', name: 'reason' }),
              children: [],
            },
          ],
        },
        {
          span: makeSpan({ spanId: '00000000-0000-0000-0000-000000000004', kind: 'CHAIN', name: 'executor' }),
          children: [],
        },
      ],
    };
    const result = SpanTreeNodeSchema.parse(tree);
    expect(result.children).toHaveLength(2);
    expect(result.children[0].children).toHaveLength(1);
    expect(result.children[0].children[0].span.name).toBe('reason');
  });

  it('accepts deeply nested tree (4 levels)', () => {
    const deep: SpanTreeNode = {
      span: makeSpan({ kind: 'AGENT' }),
      children: [{
        span: makeSpan({ spanId: '00000000-0000-0000-0000-000000000002', kind: 'CHAIN' }),
        children: [{
          span: makeSpan({ spanId: '00000000-0000-0000-0000-000000000003', kind: 'LLM' }),
          children: [{
            span: makeSpan({ spanId: '00000000-0000-0000-0000-000000000004', kind: 'TOOL' }),
            children: [],
          }],
        }],
      }],
    };
    const result = SpanTreeNodeSchema.parse(deep);
    expect(result.children[0].children[0].children[0].span.kind).toBe('TOOL');
  });
});

// ── ObservatoryStats ──

describe('ObservatoryStatsSchema', () => {
  it('accepts valid stats', () => {
    const stats = {
      totalTraces: 10,
      totalSpans: 100,
      totalTokens: 50000,
      totalCostUsd: 1.25,
      averageLatencyMs: 2500,
      tracesByTrigger: { 'ui-agent': 5, 'dynamic-ui': 5 },
      spansByKind: { LLM: 40, CHAIN: 30, TOOL: 20, AGENT: 10 },
      tokensByModel: { 'gpt-4.1': 30000, 'gpt-4.1-mini': 20000 },
      costByModel: { 'gpt-4.1': 1.0, 'gpt-4.1-mini': 0.25 },
      recentTraces: [makeTrace()],
    };
    const result = ObservatoryStatsSchema.parse(stats);
    expect(result.totalTraces).toBe(10);
    expect(result.recentTraces).toHaveLength(1);
  });

  it('accepts empty stats', () => {
    const stats = {
      totalTraces: 0,
      totalSpans: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      averageLatencyMs: 0,
      tracesByTrigger: {},
      spansByKind: {},
      tokensByModel: {},
      costByModel: {},
      recentTraces: [],
    };
    const result = ObservatoryStatsSchema.parse(stats);
    expect(result.totalTraces).toBe(0);
  });
});

// ── WebSocket Events ──

describe('ObservatoryEventSchema', () => {
  it('accepts trace:start event', () => {
    const event = { type: 'trace:start' as const, trace: makeTrace() };
    const result = ObservatoryEventSchema.parse(event);
    expect(result.type).toBe('trace:start');
  });

  it('accepts trace:end event', () => {
    const event = { type: 'trace:end' as const, trace: makeTrace() };
    const result = ObservatoryEventSchema.parse(event);
    expect(result.type).toBe('trace:end');
  });

  it('accepts span:start event', () => {
    const event = {
      type: 'span:start' as const,
      traceId: '00000000-0000-0000-0000-000000000010',
      span: makeSpan(),
    };
    const result = ObservatoryEventSchema.parse(event);
    expect(result.type).toBe('span:start');
  });

  it('accepts span:end event', () => {
    const event = {
      type: 'span:end' as const,
      traceId: '00000000-0000-0000-0000-000000000010',
      span: makeSpan(),
    };
    const result = ObservatoryEventSchema.parse(event);
    expect(result.type).toBe('span:end');
  });

  it('rejects unknown event type', () => {
    expect(() =>
      ObservatoryEventSchema.parse({ type: 'unknown', trace: makeTrace() }),
    ).toThrow();
  });
});

// ── API Schemas ──

describe('TraceListQuerySchema', () => {
  it('applies defaults for empty query', () => {
    const result = TraceListQuerySchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('coerces string numbers', () => {
    const result = TraceListQuerySchema.parse({ limit: '20', offset: '10' });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(10);
  });

  it('accepts filter params', () => {
    const result = TraceListQuerySchema.parse({
      trigger: 'ui-agent',
      status: 'ERROR',
      serverId: 'srv-1',
    });
    expect(result.trigger).toBe('ui-agent');
    expect(result.status).toBe('ERROR');
  });

  it('rejects limit above max', () => {
    expect(() => TraceListQuerySchema.parse({ limit: 500 })).toThrow();
  });
});

describe('TraceListResponseSchema', () => {
  it('accepts valid response', () => {
    const result = TraceListResponseSchema.parse({
      traces: [makeTrace()],
      total: 1,
    });
    expect(result.traces).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe('TraceDetailResponseSchema', () => {
  it('accepts valid trace detail', () => {
    const result = TraceDetailResponseSchema.parse({
      trace: makeTrace(),
      spanTree: { span: makeSpan(), children: [] },
    });
    expect(result.trace.traceId).toBe('00000000-0000-0000-0000-000000000010');
  });
});

describe('SpanDetailResponseSchema', () => {
  it('accepts valid span detail', () => {
    const result = SpanDetailResponseSchema.parse({
      span: makeSpan(),
    });
    expect(result.span.spanId).toBe('00000000-0000-0000-0000-000000000001');
  });
});

// ── ModelRole & TraceTrigger ──

describe('ModelRoleSchema', () => {
  it('accepts all valid roles', () => {
    for (const role of ['reasoning', 'structured-output', 'fast', 'weak']) {
      expect(ModelRoleSchema.parse(role)).toBe(role);
    }
  });

  it('rejects invalid role', () => {
    expect(() => ModelRoleSchema.parse('custom')).toThrow();
  });
});

describe('TraceTriggerSchema', () => {
  it('accepts all valid triggers', () => {
    for (const trigger of ['ui-agent', 'investigation-agent', 'dynamic-ui', 'api']) {
      expect(TraceTriggerSchema.parse(trigger)).toBe(trigger);
    }
  });
});
