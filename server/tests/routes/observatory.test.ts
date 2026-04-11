// EX4-C.1 + C.2: Observatory REST Routes + WebSocket Tests
// @see docs/phases/phase-ex4.md

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { observatoryRoutes } from '../../src/routes/observatory.js';
import { TraceStore } from '../../src/observatory/trace-store.js';
import type { ObservatoryEvent } from 'headlessos-shared/schemas/observatory';

function createTestTraceStore(): TraceStore {
  return new TraceStore(100);
}

function buildApp(traceStore: TraceStore) {
  const app = Fastify();
  app.register(websocket);
  app.register(observatoryRoutes, { traceStore });
  return app;
}

describe('Observatory REST Routes', () => {
  let traceStore: TraceStore;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    traceStore = createTestTraceStore();
    app = buildApp(traceStore);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── GET /api/observatory/traces ──

  describe('GET /api/observatory/traces', () => {
    it('returns empty list when no traces', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/observatory/traces' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.traces).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns traces after creating some', async () => {
      const { trace: t1 } = traceStore.startTrace('Test Trace 1', { trigger: 'api' });
      traceStore.endTrace(t1.traceId);
      const { trace: t2 } = traceStore.startTrace('Test Trace 2', { trigger: 'ui-agent', serverId: 'srv-1' });
      traceStore.endTrace(t2.traceId);

      const res = await app.inject({ method: 'GET', url: '/api/observatory/traces' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.traces).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('supports pagination with limit and offset', async () => {
      // Create 5 traces
      for (let i = 0; i < 5; i++) {
        const { trace } = traceStore.startTrace(`Trace ${i}`);
        traceStore.endTrace(trace.traceId);
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/observatory/traces?limit=2&offset=1',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.traces).toHaveLength(2);
      expect(body.total).toBe(5);
    });

    it('filters by trigger', async () => {
      const { trace: t1 } = traceStore.startTrace('Agent trace', { trigger: 'ui-agent' });
      traceStore.endTrace(t1.traceId);
      const { trace: t2 } = traceStore.startTrace('DynamicUI trace', { trigger: 'dynamic-ui' });
      traceStore.endTrace(t2.traceId);

      const res = await app.inject({
        method: 'GET',
        url: '/api/observatory/traces?trigger=ui-agent',
      });
      const body = res.json();
      expect(body.traces).toHaveLength(1);
      expect(body.traces[0].trigger).toBe('ui-agent');
      expect(body.total).toBe(1);
    });

    it('filters by status', async () => {
      const { trace: t1 } = traceStore.startTrace('OK trace');
      traceStore.endTrace(t1.traceId);
      // Create a running trace (don't end it)
      traceStore.startTrace('Running trace');

      const res = await app.inject({
        method: 'GET',
        url: '/api/observatory/traces?status=OK',
      });
      const body = res.json();
      expect(body.traces).toHaveLength(1);
      expect(body.traces[0].status).toBe('OK');
    });

    it('filters by serverId', async () => {
      const { trace: t1 } = traceStore.startTrace('Server A', { serverId: 'srv-a' });
      traceStore.endTrace(t1.traceId);
      const { trace: t2 } = traceStore.startTrace('Server B', { serverId: 'srv-b' });
      traceStore.endTrace(t2.traceId);

      const res = await app.inject({
        method: 'GET',
        url: '/api/observatory/traces?serverId=srv-a',
      });
      const body = res.json();
      expect(body.traces).toHaveLength(1);
      expect(body.traces[0].serverId).toBe('srv-a');
    });
  });

  // ── GET /api/observatory/traces/:traceId ──

  describe('GET /api/observatory/traces/:traceId', () => {
    it('returns 404 for non-existent trace', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/observatory/traces/non-existent',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns trace with span tree', async () => {
      const { trace, rootSpan } = traceStore.startTrace('Test trace');
      const childSpan = traceStore.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'Child span',
        kind: 'LLM',
        input: { prompt: 'hello' },
      });
      traceStore.endSpan(childSpan.spanId, { output: { text: 'world' } });
      traceStore.endTrace(trace.traceId);

      const res = await app.inject({
        method: 'GET',
        url: `/api/observatory/traces/${trace.traceId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.trace.traceId).toBe(trace.traceId);
      expect(body.spanTree).toBeDefined();
      expect(body.spanTree.children).toHaveLength(1);
    });

    it('strips input/output from span tree (lazy serialization)', async () => {
      const { trace, rootSpan } = traceStore.startTrace('Test trace');
      const childSpan = traceStore.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'LLM call',
        kind: 'LLM',
        input: { prompt: 'expensive data' },
      });
      traceStore.endSpan(childSpan.spanId, {
        output: { response: 'big response' },
        model: 'gpt-4.1',
        tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      });
      traceStore.endTrace(trace.traceId);

      const res = await app.inject({
        method: 'GET',
        url: `/api/observatory/traces/${trace.traceId}`,
      });
      const body = res.json();

      // Root span should have input/output stripped
      expect(body.spanTree.span.input).toBeNull();
      expect(body.spanTree.span.output).toBeNull();

      // Child span should also have input/output stripped
      const child = body.spanTree.children[0];
      expect(child.span.input).toBeNull();
      expect(child.span.output).toBeNull();

      // But other fields should be present
      expect(child.span.model).toBe('gpt-4.1');
      expect(child.span.tokenUsage.totalTokens).toBe(300);
    });
  });

  // ── GET /api/observatory/spans/:spanId ──

  describe('GET /api/observatory/spans/:spanId', () => {
    it('returns 404 for non-existent span', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/observatory/spans/non-existent',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns full span detail with input/output', async () => {
      const { trace, rootSpan } = traceStore.startTrace('Test');
      const span = traceStore.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'LLM call',
        kind: 'LLM',
        input: { prompt: 'hello world', systemPrompt: 'you are helpful' },
      });
      traceStore.endSpan(span.spanId, {
        output: { text: 'response text', tokens: 42 },
        model: 'gpt-4.1-mini',
        tokenUsage: { inputTokens: 50, outputTokens: 42, totalTokens: 92 },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/observatory/spans/${span.spanId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.span.spanId).toBe(span.spanId);
      expect(body.span.input).toEqual({ prompt: 'hello world', systemPrompt: 'you are helpful' });
      expect(body.span.output).toEqual({ text: 'response text', tokens: 42 });
      expect(body.span.model).toBe('gpt-4.1-mini');
    });
  });

  // ── GET /api/observatory/stats ──

  describe('GET /api/observatory/stats', () => {
    it('returns empty stats when no traces', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/observatory/stats' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalTraces).toBe(0);
      expect(body.totalSpans).toBe(0);
      expect(body.totalTokens).toBe(0);
      expect(body.totalCostUsd).toBe(0);
    });

    it('returns aggregated stats', async () => {
      const { trace, rootSpan } = traceStore.startTrace('Test', { trigger: 'ui-agent' });
      const span = traceStore.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'LLM',
        kind: 'LLM',
      });
      traceStore.endSpan(span.spanId, {
        model: 'gpt-4.1',
        tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      });
      traceStore.endTrace(trace.traceId);

      const res = await app.inject({ method: 'GET', url: '/api/observatory/stats' });
      const body = res.json();
      expect(body.totalTraces).toBe(1);
      expect(body.totalSpans).toBe(2); // root + child
      expect(body.totalTokens).toBeGreaterThan(0);
      expect(body.tracesByTrigger['ui-agent']).toBe(1);
      expect(body.spansByKind['LLM']).toBe(1);
      expect(body.spansByKind['AGENT']).toBe(1);
    });
  });

  // ── POST /api/observatory/clear ──

  describe('POST /api/observatory/clear', () => {
    it('clears all traces', async () => {
      traceStore.startTrace('Trace 1');
      traceStore.startTrace('Trace 2');

      const clearRes = await app.inject({ method: 'POST', url: '/api/observatory/clear' });
      expect(clearRes.statusCode).toBe(200);
      expect(clearRes.json()).toEqual({ success: true });

      const listRes = await app.inject({ method: 'GET', url: '/api/observatory/traces' });
      expect(listRes.json().traces).toHaveLength(0);
      expect(listRes.json().total).toBe(0);
    });
  });

  // ── WS /ws/observatory ──

  describe('WebSocket /ws/observatory', () => {
    it('broadcasts trace:start events to connected clients', async () => {
      // Start listening on a dynamic port
      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      const port = (app.server.address() as import('net').AddressInfo).port;

      const { WebSocket } = await import('ws');
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/observatory`);

      const messages: ObservatoryEvent[] = [];
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Create a trace — should emit trace:start + span:start (root span)
      traceStore.startTrace('WS test trace', { trigger: 'api' });

      // Small delay for event propagation
      await new Promise(r => setTimeout(r, 50));

      expect(messages.length).toBeGreaterThanOrEqual(1);
      const traceStartEvent = messages.find(m => m.type === 'trace:start');
      expect(traceStartEvent).toBeDefined();
      expect(traceStartEvent!.type).toBe('trace:start');

      ws.close();
    });

    it('strips input/output from span events', async () => {
      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      const port = (app.server.address() as import('net').AddressInfo).port;

      const { WebSocket } = await import('ws');
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/observatory`);

      const messages: ObservatoryEvent[] = [];
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Create a trace with a span that has input/output
      const { trace, rootSpan } = traceStore.startTrace('WS detail test');
      const span = traceStore.startSpan({
        traceId: trace.traceId,
        parentSpanId: rootSpan.spanId,
        name: 'LLM call',
        kind: 'LLM',
        input: { prompt: 'secret data' },
      });
      traceStore.endSpan(span.spanId, { output: { big: 'response' } });

      await new Promise(r => setTimeout(r, 50));

      // Find span:start and span:end events for our child span
      const spanStartEvents = messages.filter(
        m => m.type === 'span:start' && 'span' in m && m.span.name === 'LLM call'
      );
      const spanEndEvents = messages.filter(
        m => m.type === 'span:end' && 'span' in m && m.span.name === 'LLM call'
      );

      if (spanStartEvents.length > 0) {
        const evt = spanStartEvents[0] as Extract<ObservatoryEvent, { type: 'span:start' }>;
        expect(evt.span.input).toBeNull();
      }
      if (spanEndEvents.length > 0) {
        const evt = spanEndEvents[0] as Extract<ObservatoryEvent, { type: 'span:end' }>;
        expect(evt.span.output).toBeNull();
      }

      ws.close();
    });

    it('handles multiple clients receiving same events', async () => {
      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      const port = (app.server.address() as import('net').AddressInfo).port;

      const { WebSocket } = await import('ws');
      const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws/observatory`);
      const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws/observatory`);

      const msgs1: ObservatoryEvent[] = [];
      const msgs2: ObservatoryEvent[] = [];

      await Promise.all([
        new Promise<void>((resolve) => ws1.on('open', () => resolve())),
        new Promise<void>((resolve) => ws2.on('open', () => resolve())),
      ]);

      ws1.on('message', (data) => msgs1.push(JSON.parse(data.toString())));
      ws2.on('message', (data) => msgs2.push(JSON.parse(data.toString())));

      traceStore.startTrace('Multi-client test');
      await new Promise(r => setTimeout(r, 50));

      expect(msgs1.length).toBeGreaterThanOrEqual(1);
      expect(msgs2.length).toBeGreaterThanOrEqual(1);
      expect(msgs1.length).toBe(msgs2.length);

      ws1.close();
      ws2.close();
    });

    it('does not error when no clients are connected', async () => {
      // Just emit events with no WS clients — should not throw
      expect(() => {
        const { trace } = traceStore.startTrace('No clients trace');
        traceStore.endTrace(trace.traceId);
      }).not.toThrow();
    });

    it('removes disconnected clients cleanly', async () => {
      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      const port = (app.server.address() as import('net').AddressInfo).port;

      const { WebSocket } = await import('ws');
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/observatory`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Close client
      ws.close();
      await new Promise(r => setTimeout(r, 50));

      // Emit another event — should not throw
      expect(() => {
        traceStore.startTrace('After disconnect');
      }).not.toThrow();
    });
  });
});
