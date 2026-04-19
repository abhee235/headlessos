// EX4-B.3: DynamicUIGenerator Instrumentation Tests
// @see docs/phases/phase-ex4.md — EX4-B.3
//
// Verifies that DynamicUIGenerator.generate() creates Observatory traces
// with proper child spans for classification and LLM generation.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraceStore } from '../../src/observatory/trace-store.js';
import { initObservatory } from '../../src/observatory/context.js';
import type { Span } from 'headlessos-shared/schemas/observatory';

function createTraceStore(): TraceStore {
  const store = new TraceStore({ maxTraces: 50 });
  initObservatory(store);
  return store;
}

function getSpansForTrace(store: TraceStore, traceId: string): Span[] {
  return store.getTraceSpans(traceId) ?? [];
}

describe('DynamicUIGenerator tracing (EX4-B.3)', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = createTraceStore();
  });

  it('generate() creates a trace with CHAIN root and LLMGenerate span', async () => {
    const { DynamicUIGenerator } = await import('../../src/dynamic-ui/generator.js');

    const mockView = {
      title: 'Disk Usage',
      sidebarItems: [{ id: 'disk', label: 'Disk' }],
      sections: {
        disk: { layout: 'stack', gap: 'md', children: [] },
      },
    };

    const mockLLM = {
      parseText: vi.fn().mockResolvedValue({
        data: mockView,
        model: 'gpt-4.1',
        tokensUsed: { input: 500, output: 300 },
      }),
    };

    const generator = new DynamicUIGenerator({
      llmProvider: mockLLM as any,
    });

    const result = await generator.generate({
      tool: 'df',
      command: 'df -h',
      rawOutput: '/dev/sda1  50G  40G  10G  80% /',
      serverId: 'server-1',
    });

    expect(result.source).toBe('llm');

    // Verify trace
    const traces = store.listTraces();
    expect(traces.traces.length).toBe(1);
    expect(traces.traces[0].name).toContain('DynamicUI');
    expect(traces.traces[0].status).toBe('OK');

    // Root span should be CHAIN (not AGENT, since we set kind: 'CHAIN')
    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    const rootSpan = spans.find(s => s.parentSpanId === null);
    expect(rootSpan).toBeDefined();
    expect(rootSpan!.kind).toBe('CHAIN');

    // LLMGenerate span should exist
    const llmSpan = spans.find(s => s.name === 'LLMGenerate');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.kind).toBe('LLM');
    expect(llmSpan!.status).toBe('OK');
  });

  it('generate() creates DesignClassifier.classify span when classifier is available', async () => {
    const { DynamicUIGenerator } = await import('../../src/dynamic-ui/generator.js');

    const mockView = {
      title: 'Test',
      sidebarItems: [{ id: 'test', label: 'Test' }],
      sections: {
        test: { layout: 'stack', gap: 'md', children: [] },
      },
    };

    const mockClassification = {
      contentType: 'metrics-overview',
      layoutPattern: 'dashboard-metrics',
      expectedWidgets: ['stat-card', 'progress-bar'],
      sectionCount: 1,
      useVisualization: false,
      designNotes: 'Simple metrics view',
    };

    const mockLLM = {
      parseText: vi.fn().mockResolvedValue({
        data: mockView,
        model: 'gpt-4.1',
        tokensUsed: { input: 500, output: 300 },
      }),
    };

    const mockClassifierLLM = {
      parseText: vi.fn().mockResolvedValue({
        data: mockClassification,
        model: 'gpt-4.1-mini',
        tokensUsed: { input: 200, output: 100 },
      }),
    };

    const generator = new DynamicUIGenerator({
      llmProvider: mockLLM as any,
      classifierProvider: mockClassifierLLM as any,
    });

    await generator.generate({
      tool: 'df',
      command: 'df -h',
      rawOutput: '/dev/sda1  50G  40G  10G  80% /',
      serverId: 'server-1',
    });

    const traces = store.listTraces();
    const spans = getSpansForTrace(store, traces.traces[0].traceId);

    const classifierSpan = spans.find(s => s.name === 'DesignClassifier.classify');
    expect(classifierSpan).toBeDefined();
    expect(classifierSpan!.kind).toBe('CHAIN');
    expect(classifierSpan!.status).toBe('OK');
  });

  it('generate() returns cache hit without creating trace spans for LLM', async () => {
    const { DynamicUIGenerator } = await import('../../src/dynamic-ui/generator.js');

    const mockView = {
      title: 'Cached',
      sidebarItems: [{ id: 'test', label: 'Test' }],
      sections: {
        test: { layout: 'stack', gap: 'md', children: [] },
      },
    };

    const mockOutputCache = {
      get: vi.fn().mockReturnValue(mockView),
      set: vi.fn(),
    };

    const generator = new DynamicUIGenerator({
      outputCache: mockOutputCache as any,
    });

    const result = await generator.generate({
      tool: 'df',
      command: 'df -h',
      rawOutput: 'cached output',
      serverId: 'server-1',
    });

    expect(result.source).toBe('cache');

    // A trace IS created (withTrace wraps generate), but no LLM spans
    const traces = store.listTraces();
    expect(traces.traces.length).toBe(1);

    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    const llmSpans = spans.filter(s => s.name === 'LLMGenerate');
    expect(llmSpans.length).toBe(0);
  });

  it('generate() trace records serverId in trigger metadata', async () => {
    const { DynamicUIGenerator } = await import('../../src/dynamic-ui/generator.js');

    const mockLLM = {
      parseText: vi.fn().mockResolvedValue({
        data: {
          title: 'Test',
          sidebarItems: [{ id: 'x', label: 'X' }],
          sections: { x: { layout: 'stack', gap: 'md', children: [] } },
        },
        model: 'gpt-4.1',
        tokensUsed: { input: 100, output: 50 },
      }),
    };

    const generator = new DynamicUIGenerator({ llmProvider: mockLLM as any });

    await generator.generate({
      tool: 'test',
      command: 'test cmd',
      rawOutput: 'output',
      serverId: 'my-server-123',
    });

    const traces = store.listTraces();
    expect(traces.traces[0].trigger).toBe('dynamic-ui');
  });

  it('LLMGenerate span records token usage via setSpanAttributes', async () => {
    const { DynamicUIGenerator } = await import('../../src/dynamic-ui/generator.js');

    const mockLLM = {
      parseText: vi.fn().mockResolvedValue({
        data: {
          title: 'Test',
          sidebarItems: [{ id: 'x', label: 'X' }],
          sections: { x: { layout: 'stack', gap: 'md', children: [] } },
        },
        model: 'gpt-4.1',
        tokensUsed: { input: 1000, output: 500 },
      }),
    };

    const generator = new DynamicUIGenerator({ llmProvider: mockLLM as any });

    await generator.generate({
      tool: 'test',
      command: 'test tokens',
      rawOutput: 'some output',
      serverId: 'server-1',
    });

    const traces = store.listTraces();
    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    const llmSpan = spans.find(s => s.name === 'LLMGenerate');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.model).toBe('gpt-4.1');
    expect(llmSpan!.tokenUsage).toEqual({ inputTokens: 1000, outputTokens: 500, totalTokens: 1500 });
  });
});
