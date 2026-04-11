// EX4-B.1: ModelRouter Span Instrumentation Tests
// @see docs/phases/phase-ex4.md

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelRouter } from '../../src/llm/model-router.js';
import { ServiceContainer } from '../../src/services/container.js';
import { TraceStore } from '../../src/observatory/trace-store.js';
import { initObservatory, withTrace, getTraceStore } from '../../src/observatory/context.js';
import type { LLMUsageTracker } from '../../src/llm/usage-tracker.js';

// ── Mock OpenAIProvider ──
vi.mock('../../src/llm/providers/openai.js', () => {
  return {
    OpenAIProvider: vi.fn().mockImplementation((_apiKey: string, model = 'gpt-4.1') => ({
      name: 'openai',
      model,
      parseText: vi.fn().mockResolvedValue({
        data: 'mock-parsed',
        tokensUsed: { input: 100, output: 50 },
        latencyMs: 200,
        model,
      }),
      chatWithTools: vi.fn().mockResolvedValue({
        message: { role: 'assistant', content: 'mock response' },
        tokensUsed: { input: 200, output: 100 },
        latencyMs: 500,
        model,
        finishReason: 'stop',
      }),
    })),
  };
});

function createMockUsageTracker(): LLMUsageTracker {
  return {
    recordCall: vi.fn(),
    getSummary: vi.fn().mockReturnValue({ totalCalls: 0 }),
    reset: vi.fn(),
    totalCallCount: 0,
  } as unknown as LLMUsageTracker;
}

describe('ModelRouter Span Instrumentation', () => {
  let store: TraceStore;
  let router: ModelRouter;
  let container: ServiceContainer;

  beforeEach(async () => {
    store = new TraceStore(50);
    initObservatory(store);

    const tracker = createMockUsageTracker();
    router = new ModelRouter('model-router', {
      apiKey: 'test-key',
      usageTracker: tracker,
    });

    container = new ServiceContainer();
    container.register('model-router', router);
    await container.boot();
  });

  afterEach(async () => {
    await container.shutdown();
    store.clear();
    initObservatory(null as unknown as TraceStore);
  });

  it('reason() creates LLM span within trace', async () => {
    let traceId: string | undefined;

    await withTrace('test', { trigger: 'ui-agent' }, async () => {
      traceId = getTraceStore()?.listTraces().traces[0]?.traceId;
      const { z } = await import('zod');
      await router.reason({
        rawOutput: 'test output',
        command: 'test-cmd',
        schema: z.string(),
      });
    });

    // Find the trace
    const traces = store.listTraces();
    const trace = traces.traces[0];
    expect(trace).toBeDefined();

    const spans = store.getTraceSpans(trace.traceId);
    const llmSpan = spans.find(s => s.name === 'ModelRouter.reason');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.kind).toBe('LLM');
    expect(llmSpan!.status).toBe('OK');
    expect(llmSpan!.model).toBeTruthy();
  });

  it('chat() creates LLM span within trace', async () => {
    await withTrace('test', {}, async () => {
      await router.chat({
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
      });
    });

    const traces = store.listTraces();
    const spans = store.getTraceSpans(traces.traces[0].traceId);
    const llmSpan = spans.find(s => s.name === 'ModelRouter.chat');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.kind).toBe('LLM');
  });

  it('fast() creates LLM span within trace', async () => {
    await withTrace('test', {}, async () => {
      const { z } = await import('zod');
      await router.fast({
        rawOutput: 'output',
        command: 'fast-cmd',
        schema: z.string(),
      });
    });

    const traces = store.listTraces();
    const spans = store.getTraceSpans(traces.traces[0].traceId);
    const llmSpan = spans.find(s => s.name === 'ModelRouter.fast');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.kind).toBe('LLM');
  });

  it('summarize() creates LLM span within trace', async () => {
    await withTrace('test', {}, async () => {
      await router.summarize('some text to summarize');
    });

    const traces = store.listTraces();
    const spans = store.getTraceSpans(traces.traces[0].traceId);
    const llmSpan = spans.find(s => s.name === 'ModelRouter.summarize');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.kind).toBe('LLM');
  });

  it('no span created when outside trace context', async () => {
    const { z } = await import('zod');
    await router.reason({
      rawOutput: 'test',
      command: 'test',
      schema: z.string(),
    });

    // No traces should exist
    expect(store.getSize().traces).toBe(0);
  });

  it('spans are children of the current span', async () => {
    await withTrace('parent-test', {}, async () => {
      const { z } = await import('zod');
      await router.reason({
        rawOutput: 'test',
        command: 'test',
        schema: z.string(),
      });
    });

    const traces = store.listTraces();
    const tree = store.getSpanTree(traces.traces[0].traceId);
    expect(tree).toBeDefined();
    // Root (AGENT) → ModelRouter.reason (LLM)
    expect(tree!.children).toHaveLength(1);
    expect(tree!.children[0].span.name).toBe('ModelRouter.reason');
  });

  it('cumulative tokens roll up to trace level', async () => {
    await withTrace('rollup-test', {}, async () => {
      const { z } = await import('zod');
      await router.reason({
        rawOutput: 'test',
        command: 'test',
        schema: z.string(),
      });
      await router.fast({
        rawOutput: 'test',
        command: 'fast-test',
        schema: z.string(),
      });
    });

    const traces = store.listTraces();
    const trace = traces.traces[0];
    // Trace should have tokens from both LLM calls
    expect(trace.totalTokens).toBeGreaterThan(0);
    expect(trace.totalSpans).toBe(3); // root + 2 LLM
  });
});
