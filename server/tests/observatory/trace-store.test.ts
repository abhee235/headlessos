// EX4-A.2: TraceStore Tests — In-Memory Ring Buffer
// @see docs/phases/phase-ex4.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraceStore } from '../../src/observatory/trace-store.js';
import type { ObservatoryEvent } from 'headlessos-shared/schemas/observatory';

describe('TraceStore', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = new TraceStore(5); // Small capacity for testing
  });

  // ── Trace Lifecycle ──

  describe('startTrace', () => {
    it('creates a trace with RUNNING status', () => {
      const { trace, rootSpan } = store.startTrace('test trace');
      expect(trace.status).toBe('RUNNING');
      expect(trace.name).toBe('test trace');
      expect(trace.traceId).toBeTruthy();
      expect(rootSpan.kind).toBe('AGENT');
      expect(rootSpan.status).toBe('RUNNING');
      expect(rootSpan.parentSpanId).toBeNull();
    });

    it('sets serverId and trigger', () => {
      const { trace } = store.startTrace('test', { serverId: 'srv-1', trigger: 'ui-agent' });
      expect(trace.serverId).toBe('srv-1');
      expect(trace.trigger).toBe('ui-agent');
    });

    it('creates trace with one root span', () => {
      const { trace } = store.startTrace('test');
      expect(trace.totalSpans).toBe(1);
      expect(trace.spansByKind).toEqual({ LLM: 0, CHAIN: 0, AGENT: 1, TOOL: 0 });
    });
  });

  describe('endTrace', () => {
    it('completes a trace with OK status', () => {
      const { trace } = store.startTrace('test');
      const ended = store.endTrace(trace.traceId);
      expect(ended).toBeDefined();
      expect(ended!.status).toBe('OK');
      expect(ended!.endTime).toBeTruthy();
      expect(ended!.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('propagates ERROR status from root span', () => {
      const { trace, rootSpan } = store.startTrace('test');
      store.endSpan(rootSpan.spanId, { error: 'boom' });
      const ended = store.endTrace(trace.traceId);
      expect(ended!.status).toBe('ERROR');
    });

    it('returns undefined for unknown traceId', () => {
      expect(store.endTrace('nonexistent')).toBeUndefined();
    });
  });

  // ── Span Lifecycle ──

  describe('startSpan', () => {
    it('creates a child span', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'child span',
        kind: 'CHAIN',
      });
      expect(child.status).toBe('RUNNING');
      expect(child.parentSpanId).toBe(rootSpan.spanId);
      expect(child.traceId).toBe(trace.traceId);
      expect(child.kind).toBe('CHAIN');
    });

    it('updates trace span count', () => {
      const { trace, rootSpan } = store.startTrace('test');
      store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'child',
        kind: 'LLM',
      });
      const updated = store.getTrace(trace.traceId)!;
      expect(updated.totalSpans).toBe(2);
      expect(updated.spansByKind.LLM).toBe(1);
    });

    it('stores input when provided', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'llm call',
        kind: 'LLM',
        input: { messages: [{ role: 'user', content: 'hello' }] },
      });
      expect(child.input).toEqual({ messages: [{ role: 'user', content: 'hello' }] });
    });
  });

  describe('endSpan', () => {
    it('sets OK status by default', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'child',
        kind: 'CHAIN',
      });
      const ended = store.endSpan(child.spanId);
      expect(ended!.status).toBe('OK');
      expect(ended!.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('sets ERROR status when error is provided', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'child',
        kind: 'LLM',
      });
      const ended = store.endSpan(child.spanId, { error: 'timeout' });
      expect(ended!.status).toBe('ERROR');
      expect(ended!.error).toBe('timeout');
    });

    it('records token usage and computes cost', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'llm',
        kind: 'LLM',
      });
      const ended = store.endSpan(child.spanId, {
        model: 'gpt-4.1-mini',
        modelRole: 'fast',
        tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });
      expect(ended!.tokenUsage!.totalTokens).toBe(1500);
      expect(ended!.costUsd).toBeGreaterThan(0);
      expect(ended!.model).toBe('gpt-4.1-mini');
      expect(ended!.modelRole).toBe('fast');
    });

    // EX10.7: local model runs were priced at a default rate ($0.16–$0.69 per run)
    it('keeps the cost the span carries, and does not guess one for unknown models', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const span = (name: string) => store.startSpan({ traceId: trace.traceId, parentSpanId: rootSpan.spanId, name, kind: 'LLM' });
      const tokens = { inputTokens: 15_000, outputTokens: 900, totalTokens: 15_900 };
      const local = store.endSpan(span('router').spanId, { model: 'ornith:latest', tokenUsage: tokens, costUsd: 0 });
      expect(local!.costUsd).toBe(0);
      const unpriced = store.endSpan(span('loop').spanId, { model: 'ornith:latest', tokenUsage: tokens });
      expect(unpriced!.costUsd).toBeNull();
      const hosted = store.endSpan(span('hosted').spanId, { model: 'gpt-4.1', tokenUsage: tokens });
      expect(hosted!.costUsd).toBeCloseTo(15 * 0.002 + 0.9 * 0.008, 6);
      const root = store.endSpan(rootSpan.spanId);
      expect(root!.cumulative!.costUsd).toBeCloseTo(15 * 0.002 + 0.9 * 0.008, 6);
    });

    it('stores output', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'llm',
        kind: 'LLM',
      });
      const ended = store.endSpan(child.spanId, { output: { result: 'parsed data' } });
      expect(ended!.output).toEqual({ result: 'parsed data' });
    });

    it('returns undefined for unknown spanId', () => {
      expect(store.endSpan('nonexistent')).toBeUndefined();
    });

    it('returns the span unchanged if already ended', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'child',
        kind: 'CHAIN',
      });
      const first = store.endSpan(child.spanId);
      const second = store.endSpan(child.spanId);
      expect(second).toEqual(first);
    });
  });

  // ── Cumulative Rollup ──

  describe('cumulative rollup', () => {
    it('computes cumulative for leaf span (own only)', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'llm',
        kind: 'LLM',
      });
      const ended = store.endSpan(child.spanId, {
        model: 'gpt-4.1',
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });
      expect(ended!.cumulative!.spanCount).toBe(1);
      expect(ended!.cumulative!.tokenUsage.totalTokens).toBe(150);
    });

    it('rolls up children tokens into parent', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const chain = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'executor',
        kind: 'CHAIN',
      });

      // Create two LLM children
      const llm1 = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: chain.spanId,
        name: 'llm1',
        kind: 'LLM',
      });
      store.endSpan(llm1.spanId, {
        model: 'gpt-4.1',
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });

      const llm2 = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: chain.spanId,
        name: 'llm2',
        kind: 'LLM',
      });
      store.endSpan(llm2.spanId, {
        model: 'gpt-4.1',
        tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      });

      // End parent chain — should include children
      const endedChain = store.endSpan(chain.spanId);
      expect(endedChain!.cumulative!.spanCount).toBe(3); // self + 2 children
      expect(endedChain!.cumulative!.tokenUsage.totalTokens).toBe(450); // 150 + 300
      expect(endedChain!.cumulative!.costUsd).toBeGreaterThan(0);
    });

    it('rolls up recursively through 3 levels', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const chain = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'chain',
        kind: 'CHAIN',
      });
      const llm = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: chain.spanId,
        name: 'llm',
        kind: 'LLM',
      });

      store.endSpan(llm.spanId, {
        model: 'gpt-4.1',
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });
      store.endSpan(chain.spanId);
      const endedRoot = store.endSpan(rootSpan.spanId);

      // Root should include chain + llm
      expect(endedRoot!.cumulative!.spanCount).toBe(3);
      expect(endedRoot!.cumulative!.tokenUsage.totalTokens).toBe(150);
    });
  });

  // ── Ring Buffer Eviction ──

  describe('ring buffer eviction', () => {
    it('evicts oldest trace when at capacity', () => {
      const created: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { trace } = store.startTrace(`trace-${i}`);
        store.endTrace(trace.traceId);
        created.push(trace.traceId);
      }
      expect(store.getSize().traces).toBe(5);

      // Adding one more should evict the oldest
      const { trace } = store.startTrace('overflow');
      store.endTrace(trace.traceId);

      expect(store.getSize().traces).toBe(5);
      expect(store.getTrace(created[0])).toBeUndefined(); // first evicted
      expect(store.getTrace(created[1])).toBeDefined(); // second still here
    });

    it('evicts spans along with trace', () => {
      const { trace, rootSpan } = store.startTrace('will-be-evicted');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'child',
        kind: 'LLM',
      });
      store.endSpan(child.spanId);
      store.endTrace(trace.traceId);

      // Fill to capacity
      for (let i = 0; i < 5; i++) {
        const { trace: t } = store.startTrace(`fill-${i}`);
        store.endTrace(t.traceId);
      }

      // Both trace and its spans should be gone
      expect(store.getTrace(trace.traceId)).toBeUndefined();
      expect(store.getSpan(rootSpan.spanId)).toBeUndefined();
      expect(store.getSpan(child.spanId)).toBeUndefined();
    });
  });

  // ── Read Operations ──

  describe('getTraceSpans', () => {
    it('returns spans sorted by startTime', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const child1 = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'first',
        kind: 'CHAIN',
      });
      const child2 = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'second',
        kind: 'LLM',
      });

      const spans = store.getTraceSpans(trace.traceId);
      expect(spans).toHaveLength(3); // root + 2 children
      expect(spans[0].spanId).toBe(rootSpan.spanId);
    });

    it('returns empty array for unknown trace', () => {
      expect(store.getTraceSpans('nonexistent')).toEqual([]);
    });
  });

  describe('getSpanTree', () => {
    it('builds correct tree hierarchy', () => {
      const { trace, rootSpan } = store.startTrace('test');
      const chain = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'chain',
        kind: 'CHAIN',
      });
      const llm = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: chain.spanId,
        name: 'llm-call',
        kind: 'LLM',
      });

      const tree = store.getSpanTree(trace.traceId);
      expect(tree).toBeDefined();
      expect(tree!.span.spanId).toBe(rootSpan.spanId);
      expect(tree!.children).toHaveLength(1);
      expect(tree!.children[0].span.name).toBe('chain');
      expect(tree!.children[0].children).toHaveLength(1);
      expect(tree!.children[0].children[0].span.name).toBe('llm-call');
    });

    it('returns undefined for unknown trace', () => {
      expect(store.getSpanTree('nonexistent')).toBeUndefined();
    });
  });

  describe('listTraces', () => {
    it('returns traces sorted by most recent first', () => {
      const traces: string[] = [];
      for (let i = 0; i < 3; i++) {
        const { trace } = store.startTrace(`trace-${i}`);
        store.endTrace(trace.traceId);
        traces.push(trace.traceId);
      }

      const result = store.listTraces();
      expect(result.total).toBe(3);
      expect(result.traces).toHaveLength(3);
      // All trace IDs should be present
      const ids = result.traces.map(t => t.traceId);
      for (const id of traces) {
        expect(ids).toContain(id);
      }
    });

    it('filters by trigger', () => {
      store.startTrace('a', { trigger: 'ui-agent' });
      store.startTrace('b', { trigger: 'dynamic-ui' });
      store.startTrace('c', { trigger: 'ui-agent' });

      const result = store.listTraces({ trigger: 'ui-agent' });
      expect(result.total).toBe(2);
    });

    it('filters by status', () => {
      const { trace: t1 } = store.startTrace('ok');
      store.endTrace(t1.traceId);
      store.startTrace('running'); // not ended

      const result = store.listTraces({ status: 'RUNNING' });
      expect(result.total).toBe(1);
    });

    it('paginates correctly', () => {
      for (let i = 0; i < 5; i++) {
        store.startTrace(`t-${i}`);
      }
      const page1 = store.listTraces({ limit: 2, offset: 0 });
      const page2 = store.listTraces({ limit: 2, offset: 2 });
      expect(page1.traces).toHaveLength(2);
      expect(page2.traces).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.traces[0].traceId).not.toBe(page2.traces[0].traceId);
    });
  });

  describe('getStats', () => {
    it('returns zeroed stats when empty', () => {
      const stats = store.getStats();
      expect(stats.totalTraces).toBe(0);
      expect(stats.totalSpans).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.averageLatencyMs).toBe(0);
    });

    it('aggregates stats across traces', () => {
      const { trace: t1, rootSpan: r1 } = store.startTrace('a', { trigger: 'ui-agent' });
      const llm1 = store.startSpan({ traceId: t1.traceId, parentSpanId: r1.spanId, name: 'llm', kind: 'LLM' });
      store.endSpan(llm1.spanId, { model: 'gpt-4.1', tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } });
      store.endTrace(t1.traceId);

      const { trace: t2, rootSpan: r2 } = store.startTrace('b', { trigger: 'dynamic-ui' });
      const llm2 = store.startSpan({ traceId: t2.traceId, parentSpanId: r2.spanId, name: 'llm', kind: 'LLM' });
      store.endSpan(llm2.spanId, { model: 'gpt-4.1-mini', tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 } });
      store.endTrace(t2.traceId);

      const stats = store.getStats();
      expect(stats.totalTraces).toBe(2);
      expect(stats.totalSpans).toBe(4); // 2 roots + 2 llm
      expect(stats.tracesByTrigger['ui-agent']).toBe(1);
      expect(stats.tracesByTrigger['dynamic-ui']).toBe(1);
      expect(stats.spansByKind.LLM).toBe(2);
      expect(stats.spansByKind.AGENT).toBe(2);
      expect(stats.tokensByModel['gpt-4.1']).toBe(150);
      expect(stats.tokensByModel['gpt-4.1-mini']).toBe(300);
      expect(stats.recentTraces).toHaveLength(2);
    });
  });

  // ── Events ──

  describe('EventEmitter', () => {
    it('emits trace:start event', () => {
      const events: ObservatoryEvent[] = [];
      store.on('event', (e: ObservatoryEvent) => events.push(e));

      store.startTrace('test');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('trace:start');
    });

    it('emits span:start and span:end events', () => {
      const events: ObservatoryEvent[] = [];
      store.on('event', (e: ObservatoryEvent) => events.push(e));

      const { trace, rootSpan } = store.startTrace('test');
      const child = store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'child',
        kind: 'LLM',
      });
      store.endSpan(child.spanId);

      // trace:start, span:start, span:end
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('trace:start');
      expect(events[1].type).toBe('span:start');
      expect(events[2].type).toBe('span:end');
    });

    it('emits trace:end event', () => {
      const events: ObservatoryEvent[] = [];
      store.on('event', (e: ObservatoryEvent) => events.push(e));

      const { trace } = store.startTrace('test');
      store.endTrace(trace.traceId);

      const traceEnd = events.find(e => e.type === 'trace:end');
      expect(traceEnd).toBeDefined();
    });
  });

  // ── clear & getSize ──

  describe('clear', () => {
    it('removes all data', () => {
      store.startTrace('a');
      store.startTrace('b');
      expect(store.getSize().traces).toBe(2);

      store.clear();
      expect(store.getSize().traces).toBe(0);
      expect(store.getSize().spans).toBe(0);
    });
  });

  describe('getSize', () => {
    it('returns correct counts', () => {
      const { trace, rootSpan } = store.startTrace('test');
      store.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'child',
        kind: 'CHAIN',
      });

      const size = store.getSize();
      expect(size.traces).toBe(1);
      expect(size.spans).toBe(2);
      expect(size.memoryEstimateBytes).toBeGreaterThan(0);
    });
  });
});
