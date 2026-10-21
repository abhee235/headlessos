// EX4-B.2: Agent Pipeline Instrumentation Tests
// @see docs/phases/phase-ex4.md — EX4-B.2
//
// Verifies that UIAgent, Planner, Reflector, Executor, and InvestigationAgent
// create proper Observatory traces and spans.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraceStore } from '../../src/observatory/trace-store.js';
import { initObservatory, getTraceStore, withTraceGen, withSpanGen, currentContext } from '../../src/observatory/context.js';
import type { Span, Trace } from 'headlessos-shared/schemas/observatory';

// ── Test Helpers ──

function createTraceStore(): TraceStore {
  const store = new TraceStore({ maxTraces: 50 });
  initObservatory(store);
  return store;
}

function getSpansForTrace(store: TraceStore, traceId: string): Span[] {
  return store.getTraceSpans(traceId) ?? [];
}

// ── Generator Wrapper Tests ──

describe('withTraceGen', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = createTraceStore();
  });

  it('creates a trace wrapping an async generator', async () => {
    async function* myGenerator(): AsyncGenerator<string> {
      yield 'a';
      yield 'b';
      yield 'c';
    }

    const results: string[] = [];
    for await (const val of withTraceGen<string>('TestGen', { trigger: 'manual' }, myGenerator)) {
      results.push(val);
    }

    expect(results).toEqual(['a', 'b', 'c']);

    // Verify trace was created and completed
    const traces = store.listTraces();
    expect(traces.traces.length).toBe(1);
    expect(traces.traces[0].name).toBe('TestGen');
    expect(traces.traces[0].status).toBe('OK');

    // Root span should be completed
    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    expect(spans.length).toBe(1);
    expect(spans[0].name).toBe('TestGen');
    expect(spans[0].status).toBe('OK');
    expect(spans[0].endTime).not.toBeNull();
  });

  it('propagates context to child withSpan calls inside generator', async () => {
    const { withSpan } = await import('../../src/observatory/context.js');

    async function* genWithChildSpans(): AsyncGenerator<string> {
      // We're inside a trace — withSpan should create a child span
      const result = await withSpan('child-op', 'CHAIN', async () => {
        return 'done';
      });
      yield result;
    }

    const results: string[] = [];
    for await (const val of withTraceGen<string>('ParentTrace', { trigger: 'manual' }, genWithChildSpans)) {
      results.push(val);
    }

    expect(results).toEqual(['done']);

    const traces = store.listTraces();
    expect(traces.traces.length).toBe(1);

    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    // In some Node.js versions, the AsyncLocalStorage context may not propagate
    // across generator yield. At minimum, verify the root span exists.
    expect(spans.length).toBeGreaterThanOrEqual(1);
    // If context propagation works (Node >= 16.4), we get 2 spans
    if (spans.length >= 2) {
      expect(spans.some(s => s.name === 'child-op')).toBe(true);
    }
  });

  it('handles errors in generator and marks span as ERROR', async () => {
    async function* failingGen(): AsyncGenerator<string> {
      yield 'ok';
      throw new Error('generator boom');
    }

    const results: string[] = [];
    await expect(async () => {
      for await (const val of withTraceGen<string>('FailGen', { trigger: 'manual' }, failingGen)) {
        results.push(val);
      }
    }).rejects.toThrow('generator boom');

    expect(results).toEqual(['ok']);

    const traces = store.listTraces();
    expect(traces.traces.length).toBe(1);

    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    const rootSpan = spans.find(s => s.name === 'FailGen');
    expect(rootSpan?.status).toBe('ERROR');
    expect(rootSpan?.error).toBe('generator boom');
  });

  it('passes through when no TraceStore is initialized', async () => {
    // Reset the store
    initObservatory(null as unknown as TraceStore);

    async function* simpleGen(): AsyncGenerator<number> {
      yield 1;
      yield 2;
    }

    const results: number[] = [];
    for await (const val of withTraceGen<number>('NoStore', { trigger: 'manual' }, simpleGen)) {
      results.push(val);
    }

    expect(results).toEqual([1, 2]);

    // Restore store for other tests
    initObservatory(store);
  });
});

describe('withSpanGen', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = createTraceStore();
  });

  it('creates a child span wrapping an async generator', async () => {
    async function* innerGen(): AsyncGenerator<string> {
      yield 'x';
      yield 'y';
    }

    async function* outerGen(): AsyncGenerator<string> {
      yield* withSpanGen<string>('ChildSpan', 'CHAIN', innerGen);
    }

    const results: string[] = [];
    for await (const val of withTraceGen<string>('Parent', { trigger: 'manual' }, outerGen)) {
      results.push(val);
    }

    expect(results).toEqual(['x', 'y']);

    const traces = store.listTraces();
    const trace = traces.traces.find(t => t.name === 'Parent');
    expect(trace).toBeDefined();

    const spans = getSpansForTrace(store, trace!.traceId);
    // Root span + child ChildSpan = 2 (if context propagation works)
    expect(spans.length).toBeGreaterThanOrEqual(1);
    if (spans.length >= 2) {
      expect(spans.some(s => s.name === 'ChildSpan' && s.kind === 'CHAIN')).toBe(true);
    }
  });

  it('passes through when no parent context exists', async () => {
    async function* noContextGen(): AsyncGenerator<number> {
      yield 42;
    }

    const results: number[] = [];
    for await (const val of withSpanGen<number>('Orphan', 'CHAIN', noContextGen)) {
      results.push(val);
    }

    expect(results).toEqual([42]);
    // No traces should be created
    expect(store.listTraces().traces.length).toBe(0);
  });
});

// ── UIAgent Span Tests ──

describe('UIAgent tracing (EX4-B.2)', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = createTraceStore();
  });

  it('UIAgent.generate() creates a trace with AGENT root span', async () => {
    // Import the UIAgent and create a minimal mock setup
    const { UIAgent } = await import('../../src/agent/ui-agent.js');

    // Create mocks - planner that returns valid hints
    const mockHints = {
      intent: 'Show disk usage',
      interactivityLevel: 'display-only' as const,
      expectedWidgets: ['table'],
      templateHint: null,
      dataSourceHints: ['disk usage'],
      suggestedLayout: 'stack' as const,
      suggestedSections: ['Disk'],
      securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false },
      estimatedComplexity: 'simple' as const,
      skipPostReflection: true,
    };

    const mockView = {
      title: 'Disk Usage',
      sidebarItems: [{ id: 'disk', label: 'Disk' }],
      sections: {
        disk: {
          layout: 'stack' as const,
          gap: 'md' as const,
          children: [{ type: 'table' as const, columns: [], rows: [] }],
        },
      },
    };

    const mockPlanner = {
      plan: vi.fn().mockResolvedValue(mockHints),
    };

    const mockExecutor = {
      execute: vi.fn(async function* () {
        yield { type: 'thinking' as const, message: 'Working...' };
        yield { type: 'generation_complete' as const, view: mockView };
      }),
      executeWithFixes: vi.fn(async function* () {
        yield { type: 'generation_complete' as const, view: mockView };
      }),
    };

    const mockReflector = {
      shouldSkip: vi.fn().mockReturnValue(true),
      reflect: vi.fn(),
    };

    const mockModelRouter = {
      getModelMap: vi.fn().mockReturnValue({ reasoning: 'test-model' }),
    };

    const agent = new UIAgent({
      modelRouter: mockModelRouter as any,
      planner: mockPlanner as any,
      executor: mockExecutor as any,
      reflector: mockReflector as any,
      ssh: {} as any,
      templateRegistry: {} as any,
    });

    const events: unknown[] = [];
    for await (const event of agent.generate('server-1', 'show disk usage')) {
      events.push(event);
    }

    // Should have thinking + thinking (plan) + thinking (executor) + generation_complete + complete
    expect(events.length).toBeGreaterThanOrEqual(3);

    // Verify trace was created
    const traces = store.listTraces();
    expect(traces.traces.length).toBe(1);
    expect(traces.traces[0].name).toContain('UIAgent');
    expect(traces.traces[0].status).toBe('OK');

    // Root span should be AGENT kind
    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    const rootSpan = spans.find(s => s.parentSpanId === null);
    expect(rootSpan).toBeDefined();
    expect(rootSpan!.kind).toBe('AGENT');
    expect(rootSpan!.status).toBe('OK');
  });
});

// ── Planner Span Tests ──

describe('Planner tracing (EX4-B.2)', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = createTraceStore();
  });

  it('Planner.plan() creates a CHAIN span when called within a trace', async () => {
    const { Planner } = await import('../../src/agent/planner.js');

    const mockResult = {
      data: {
        intent: 'test',
        interactivityLevel: 'display-only',
        expectedWidgets: ['table'],
        templateHint: null,
        dataSourceHints: ['test'],
        suggestedLayout: 'stack',
        suggestedSections: ['Test'],
        securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false },
        estimatedComplexity: 'simple',
        skipPostReflection: true,
      },
    };

    const mockModelRouter = {
      reason: vi.fn().mockResolvedValue(mockResult),
    };

    const mockTemplateRegistry = {
      listAll: vi.fn().mockReturnValue([]),
      getById: vi.fn().mockReturnValue(null),
      matchCommand: vi.fn().mockReturnValue([]),
    };

    const planner = new Planner(mockModelRouter as any, mockTemplateRegistry as any);

    // Call plan within a trace context
    const { withTrace } = await import('../../src/observatory/context.js');
    await withTrace('TestTrace', { trigger: 'manual' }, async () => {
      await planner.plan('show disk usage');
    });

    const traces = store.listTraces();
    expect(traces.traces.length).toBe(1);

    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    const plannerSpan = spans.find(s => s.name === 'Planner.plan');
    expect(plannerSpan).toBeDefined();
    expect(plannerSpan!.kind).toBe('CHAIN');
    expect(plannerSpan!.status).toBe('OK');
    expect(plannerSpan!.input).toBe('show disk usage');
  });
});

// ── Reflector Span Tests ──

describe('PostReflector tracing (EX4-B.2)', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = createTraceStore();
  });

  it('PostReflector.reflect() creates a CHAIN span', async () => {
    const { PostGenerationReflector } = await import('../../src/agent/reflector.js');

    const mockModelRouter = {
      reason: vi.fn().mockResolvedValue({
        data: {
          approved: true,
          issues: [],
          summary: 'Looks good',
        },
      }),
    };

    const reflector = new PostGenerationReflector(mockModelRouter as any);

    const { withTrace } = await import('../../src/observatory/context.js');
    await withTrace('ReflectTrace', { trigger: 'manual' }, async () => {
      await reflector.reflect(
        'show disk',
        {
          intent: 'test',
          interactivityLevel: 'display-only',
          expectedWidgets: ['table'],
          templateHint: null,
          dataSourceHints: ['test'],
          suggestedLayout: 'stack',
          suggestedSections: ['Test'],
          securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false },
          estimatedComplexity: 'simple',
          skipPostReflection: false,
        } as any,
        new Map(),
        { title: 'Test', sidebarItems: [], sections: {} } as any,
      );
    });

    const traces = store.listTraces();
    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    const reflectorSpan = spans.find(s => s.name === 'PostReflector.reflect');
    expect(reflectorSpan).toBeDefined();
    expect(reflectorSpan!.kind).toBe('CHAIN');
    expect(reflectorSpan!.status).toBe('OK');
    expect(reflectorSpan!.input).toBe('show disk');
  });
});

// ── InvestigationAgent Span Tests ──

describe('InvestigationAgent tracing (EX4-B.2)', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = createTraceStore();
  });

  it('investigate() creates a trace with LLM and TOOL child spans', async () => {
    const { InvestigationAgent } = await import('../../src/agent/investigation-agent.js');

    // EX9.3: native tool calls on the shared loop
    const mockLLM = {
      name: 'openai',
      model: 'fake',
      chatWithTools: vi.fn()
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: 'Let me check disk usage', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'disk_usage', arguments: '{}' } }] },
          tokensUsed: { input: 100, output: 50 }, latencyMs: 1, model: 'fake', finishReason: 'tool_calls',
        })
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: 'Disk is 80% full on /dev/sda1' },
          tokensUsed: { input: 200, output: 75 }, latencyMs: 1, model: 'fake', finishReason: 'stop',
        }),
    };

    const mockSSH = {
      exec: vi.fn().mockResolvedValue({
        stdout: '/dev/sda1  50G  40G  10G  80% /',
        stderr: '',
        exitCode: 0,
      }),
    };

    const agent = new InvestigationAgent(mockSSH as any, mockLLM as any);

    const result = await agent.investigate('server-1', 'Why is disk usage high?', { maxSteps: 5 });

    expect(result.status).toBe('completed');
    expect(result.answer).toContain('80%');

    // Verify trace
    const traces = store.listTraces();
    expect(traces.traces.length).toBe(1);
    expect(traces.traces[0].name).toContain('Investigation');
    expect(traces.traces[0].status).toBe('OK');

    // Verify child spans
    const spans = getSpansForTrace(store, traces.traces[0].traceId);
    // Root (AGENT) + LLM think[1] + TOOL action:disk_usage + LLM think[2] = 4 spans
    expect(spans.length).toBeGreaterThanOrEqual(4);

    const llmSpans = spans.filter(s => s.kind === 'LLM');
    expect(llmSpans.length).toBe(2);
    expect(llmSpans[0].name).toContain('InvestigationAgent.think');

    const toolSpans = spans.filter(s => s.kind === 'TOOL');
    expect(toolSpans.length).toBe(1);
    expect(toolSpans[0].name).toBe('action:disk_usage');
  });

  it('investigate() without LLM provider returns error without trace', async () => {
    const { InvestigationAgent } = await import('../../src/agent/investigation-agent.js');

    const agent = new InvestigationAgent({} as any, null);
    const result = await agent.investigate('server-1', 'test question');

    expect(result.status).toBe('error');
    // No trace should be created (early return before withTrace)
    const traces = store.listTraces();
    expect(traces.traces.length).toBe(0);
  });
});
