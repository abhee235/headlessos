// EX2.7: UI Agent Orchestrator — Tests
// @see docs/phases/phase-ex2.md — EX2.7

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIAgent, type UIAgentEvent, type AgentMeta } from '../../src/agent/ui-agent.js';
import type { ModelRouter } from '../../src/llm/model-router.js';
import type { Planner, PlannerHints } from '../../src/agent/planner.js';
import type { ReactiveExecutor, AgentEvent } from '../../src/agent/executor.js';
import type { PostGenerationReflector, Reflection } from '../../src/agent/reflector.js';
import type { ConnectionManager } from '../../src/ssh/connection-manager.js';
import type { TemplateRegistry } from '../../src/dynamic-ui/template-registry.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

// ── Helpers ──

const VALID_DYNAMIC_VIEW: DynamicView = {
  title: 'Disk Usage',
  root: {
    layout: 'stack',
    gap: 'md',
    children: [
      {
        type: 'table',
        title: 'Filesystems',
        columns: [
          { key: 'fs', label: 'Filesystem' },
          { key: 'size', label: 'Size' },
        ],
        rows: [{ fs: '/dev/sda1', size: '50G' }],
      },
    ],
  },
} as DynamicView;

function createDefaultHints(overrides?: Partial<PlannerHints>): PlannerHints {
  return {
    intent: 'Show disk usage',
    interactivityLevel: 'display-only',
    expectedWidgets: ['table'],
    templateHint: null,
    dataSourceHints: ['disk usage'],
    suggestedLayout: 'stack',
    securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false },
    estimatedComplexity: 'simple',
    skipPostReflection: true,
    ...overrides,
  };
}

function createMockModelRouter(): ModelRouter {
  return {
    reason: vi.fn(),
    chat: vi.fn(),
    fast: vi.fn(),
    summarize: vi.fn(),
    getModel: vi.fn(),
    getRoleConfig: vi.fn(),
    getModelMap: vi.fn().mockReturnValue({
      reasoning: 'o4-mini',
      'structured-output': 'gpt-4.1',
      fast: 'gpt-4o-mini',
      weak: 'gpt-4o-mini',
    }),
    hasProvider: vi.fn(),
    updateConfig: vi.fn(),
  } as unknown as ModelRouter;
}

function createMockPlanner(hints?: PlannerHints): Planner {
  return {
    plan: vi.fn().mockResolvedValue(hints ?? createDefaultHints()),
    enrichHints: vi.fn(),
  } as unknown as Planner;
}

function createMockExecutor(
  view?: DynamicView,
  events?: AgentEvent[],
): ReactiveExecutor {
  const defaultEvents: AgentEvent[] = [
    { type: 'thinking', message: 'Step 1...' },
    { type: 'tool_result', tool: 'exec_command', success: true, outputPreview: 'df output...', latencyMs: 100 },
  ];
  if (view) {
    defaultEvents.push({ type: 'generation_complete', view });
  }

  const allEvents = events ?? defaultEvents;

  const mockExecute = vi.fn().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/require-await
    async function* () {
      for (const event of allEvents) {
        yield event;
      }
    },
  );

  const mockExecuteWithFixes = vi.fn().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/require-await
    async function* () {
      for (const event of allEvents) {
        yield event;
      }
    },
  );

  return {
    execute: mockExecute,
    executeWithFixes: mockExecuteWithFixes,
  } as unknown as ReactiveExecutor;
}

function createMockReflector(reflection?: Reflection, shouldSkipValue = true): PostGenerationReflector {
  return {
    reflect: vi.fn().mockResolvedValue(reflection ?? {
      approved: true,
      issues: [],
      summary: 'Looks good',
    }),
    shouldSkip: vi.fn().mockReturnValue(shouldSkipValue),
  } as unknown as PostGenerationReflector;
}

function createMockSSH(): ConnectionManager {
  return {
    exec: vi.fn(),
    getSftp: vi.fn(),
  } as unknown as ConnectionManager;
}

function createMockTemplateRegistry(): TemplateRegistry {
  return {
    getById: vi.fn(),
    listAll: vi.fn(),
    search: vi.fn(),
    matchCommand: vi.fn(),
  } as unknown as TemplateRegistry;
}

function createAgent(overrides?: {
  modelRouter?: ModelRouter;
  planner?: Planner;
  executor?: ReactiveExecutor;
  reflector?: PostGenerationReflector;
  ssh?: ConnectionManager;
  templateRegistry?: TemplateRegistry;
}): UIAgent {
  return new UIAgent({
    modelRouter: overrides?.modelRouter ?? createMockModelRouter(),
    planner: overrides?.planner ?? createMockPlanner(),
    executor: overrides?.executor ?? createMockExecutor(VALID_DYNAMIC_VIEW),
    reflector: overrides?.reflector ?? createMockReflector(),
    ssh: overrides?.ssh ?? createMockSSH(),
    templateRegistry: overrides?.templateRegistry ?? createMockTemplateRegistry(),
  });
}

async function collectEvents(gen: AsyncGenerator<UIAgentEvent>): Promise<UIAgentEvent[]> {
  const events: UIAgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// ── Tests ──

describe('UIAgent', () => {
  describe('happy path — simple display-only (skip reflection)', () => {
    it('produces complete event with DynamicView', async () => {
      const agent = createAgent();
      const events = await collectEvents(agent.generate('server-1', 'Show disk usage'));

      const complete = events.find((e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete');
      expect(complete).toBeDefined();
      expect(complete!.view.title).toBe('Disk Usage');
    });

    it('emits thinking events for planning phase', async () => {
      const agent = createAgent();
      const events = await collectEvents(agent.generate('server-1', 'Show disk usage'));

      const thinkingEvents = events.filter((e) => e.type === 'thinking');
      expect(thinkingEvents.length).toBeGreaterThanOrEqual(2); // planning + executor steps
    });

    it('passes correct serverId to tool context', async () => {
      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createAgent({ executor });

      await collectEvents(agent.generate('my-server-42', 'Show disk usage'));

      const call = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      // execute(hints, context) — context is 2nd arg
      expect(call[1].serverId).toBe('my-server-42');
    });

    it('calls planner with user request', async () => {
      const planner = createMockPlanner();
      const agent = createAgent({ planner });

      await collectEvents(agent.generate('server-1', 'Show nginx config'));

      expect(planner.plan).toHaveBeenCalledWith('Show nginx config');
    });

    it('skips reflection when shouldSkip returns true', async () => {
      const reflector = createMockReflector(undefined, true);
      const agent = createAgent({ reflector });

      const events = await collectEvents(agent.generate('server-1', 'Show disk usage'));

      expect(reflector.reflect).not.toHaveBeenCalled();
      const complete = events.find((e) => e.type === 'complete');
      expect(complete).toBeDefined();
    });

    it('meta includes session ID and models', async () => {
      const agent = createAgent();
      const events = await collectEvents(agent.generate('server-1', 'Show disk usage'));

      const complete = events.find((e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete');
      expect(complete).toBeDefined();
      const meta = complete!.meta;
      expect(meta.sessionId).toBeDefined();
      expect(meta.sessionId.length).toBeGreaterThan(0);
      expect(meta.models.reasoning).toBe('o4-mini');
      expect(meta.reflectionLoops).toBe(0);
    });

    it('meta tracks latency', async () => {
      const agent = createAgent();
      const events = await collectEvents(agent.generate('server-1', 'Show disk usage'));

      const complete = events.find((e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete');
      expect(complete!.meta.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('meta tracks steps completed', async () => {
      const agent = createAgent();
      const events = await collectEvents(agent.generate('server-1', 'Show disk usage'));

      const complete = events.find((e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete');
      // Executor emits 3 events: thinking + tool_result + generation_complete
      expect(complete!.meta.stepsCompleted).toBe(3);
    });
  });

  describe('reflection path — complex UI', () => {
    it('runs reflection when shouldSkip returns false', async () => {
      const reflector = createMockReflector(
        { approved: true, issues: [], summary: 'Looks good' },
        false, // shouldSkip = false
      );
      const agent = createAgent({ reflector });

      const events = await collectEvents(agent.generate('server-1', 'Show process manager'));

      expect(reflector.reflect).toHaveBeenCalledOnce();
      const reflectionEvent = events.find((e) => e.type === 'reflection');
      expect(reflectionEvent).toBeDefined();
    });

    it('emits reflection event with approve action', async () => {
      const reflector = createMockReflector(
        { approved: true, issues: [], summary: 'Schema is accurate' },
        false,
      );
      const agent = createAgent({ reflector });

      const events = await collectEvents(agent.generate('server-1', 'Show processes'));

      const reflectionEvent = events.find(
        (e): e is AgentEvent & { type: 'reflection' } => e.type === 'reflection',
      );
      expect(reflectionEvent).toBeDefined();
      expect(reflectionEvent!.action).toBe('approve');
      expect(reflectionEvent!.feedback).toBe('Schema is accurate');
    });

    it('meta includes reflection loop count', async () => {
      const reflector = createMockReflector(
        { approved: true, issues: [], summary: 'Good' },
        false,
      );
      const agent = createAgent({ reflector });

      const events = await collectEvents(agent.generate('server-1', 'Show processes'));

      const complete = events.find((e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete');
      expect(complete!.meta.reflectionLoops).toBe(1);
    });
  });

  describe('reflection rejection + re-execute', () => {
    it('re-executes when reflection rejects', async () => {
      let callCount = 0;
      const reflector = {
        shouldSkip: vi.fn().mockReturnValue(false),
        reflect: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              approved: false,
              issues: [{ severity: 'critical', description: 'Missing form', fix: 'Add form widget' }],
              summary: 'Needs form for editing',
            };
          }
          return { approved: true, issues: [], summary: 'Fixed' };
        }),
      } as unknown as PostGenerationReflector;

      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createAgent({ reflector, executor });

      const events = await collectEvents(agent.generate('server-1', 'Edit nginx config'));

      // Should have 2 reflection events (reject + approve)
      const reflectionEvents = events.filter((e) => e.type === 'reflection');
      expect(reflectionEvents.length).toBe(2);

      // Should have used executeWithFixes
      expect(executor.executeWithFixes).toHaveBeenCalledOnce();
    });

    it('sends reflection issues to executeWithFixes', async () => {
      const issues = [
        { severity: 'critical' as const, description: 'Missing data', fix: 'Add table rows' },
      ];

      const reflector = {
        shouldSkip: vi.fn().mockReturnValue(false),
        reflect: vi.fn()
          .mockResolvedValueOnce({ approved: false, issues, summary: 'Missing data' })
          .mockResolvedValueOnce({ approved: true, issues: [], summary: 'Fixed' }),
      } as unknown as PostGenerationReflector;

      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createAgent({ reflector, executor });

      await collectEvents(agent.generate('server-1', 'Show data'));

      const fixCall = (executor.executeWithFixes as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fixCall[1]).toEqual(issues);
    });

    it('caps reflections at maxPostReflections', async () => {
      const reflector = {
        shouldSkip: vi.fn().mockReturnValue(false),
        reflect: vi.fn().mockResolvedValue({
          approved: false,
          issues: [{ severity: 'critical', description: 'Bad', fix: 'Fix it' }],
          summary: 'Still bad',
        }),
      } as unknown as PostGenerationReflector;

      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createAgent({ reflector, executor });

      const events = await collectEvents(
        agent.generate('server-1', 'Show data', { maxPostReflections: 2 }),
      );

      // 1 initial reflection (reject) + 1 re-execute + 1 final reflection (reject at max)
      // Then complete with warning because max reached
      const complete = events.find((e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete');
      expect(complete).toBeDefined();
      expect(complete!.meta.warning).toContain('quality issues');
    });

    it('defaults maxPostReflections to 2', async () => {
      const reflector = {
        shouldSkip: vi.fn().mockReturnValue(false),
        reflect: vi.fn().mockResolvedValue({
          approved: false,
          issues: [{ severity: 'critical', description: 'Bad', fix: 'Fix it' }],
          summary: 'Still bad',
        }),
      } as unknown as PostGenerationReflector;

      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createAgent({ reflector, executor });

      const events = await collectEvents(agent.generate('server-1', 'Show data'));

      // With maxPostReflections=2: reflect (reject, attempt=0) → re-execute → reflect (reject, attempt=1 >= 2-1) → complete with warning
      const complete = events.find((e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete');
      expect(complete!.meta.warning).toBeDefined();
      // executeWithFixes called once (for the one retry)
      expect(executor.executeWithFixes).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('emits error when planner fails', async () => {
      const planner = {
        plan: vi.fn().mockRejectedValue(new Error('LLM timeout')),
      } as unknown as Planner;

      const agent = createAgent({ planner });
      const events = await collectEvents(agent.generate('server-1', 'Show stuff'));

      const error = events.find((e) => e.type === 'error');
      expect(error).toBeDefined();
      expect((error as AgentEvent & { type: 'error' }).message).toContain('Planning failed');
    });

    it('emits error when executor produces no schema', async () => {
      // Executor emits events but no generation_complete
      const executor = createMockExecutor(undefined, [
        { type: 'thinking', message: 'Step 1...' },
        { type: 'error', message: 'Max steps reached' },
      ]);

      const agent = createAgent({ executor });
      const events = await collectEvents(agent.generate('server-1', 'Show stuff'));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
      const noSchemaError = errorEvents.find(
        (e) => (e as AgentEvent & { type: 'error' }).message.includes('did not produce a schema'),
      );
      expect(noSchemaError).toBeDefined();
    });

    it('gracefully handles reflection failure', async () => {
      const reflector = {
        shouldSkip: vi.fn().mockReturnValue(false),
        reflect: vi.fn().mockRejectedValue(new Error('Reflection LLM error')),
      } as unknown as PostGenerationReflector;

      const agent = createAgent({ reflector });
      const events = await collectEvents(agent.generate('server-1', 'Show stuff'));

      // Should still complete with the best attempt
      const complete = events.find((e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete');
      expect(complete).toBeDefined();
      expect(complete!.meta.warning).toContain('Reflection failed');
    });

    it('emits error when re-execution produces no schema', async () => {
      const reflector = {
        shouldSkip: vi.fn().mockReturnValue(false),
        reflect: vi.fn().mockResolvedValue({
          approved: false,
          issues: [{ severity: 'critical', description: 'Bad', fix: 'Fix' }],
          summary: 'Bad',
        }),
      } as unknown as PostGenerationReflector;

      // Re-execute produces no schema
      const executor = {
        execute: vi.fn().mockImplementation(async function* () {
          yield { type: 'thinking', message: 'Step 1...' } as AgentEvent;
          yield { type: 'generation_complete', view: VALID_DYNAMIC_VIEW } as AgentEvent;
        }),
        executeWithFixes: vi.fn().mockImplementation(async function* () {
          yield { type: 'thinking', message: 'Fixing...' } as AgentEvent;
          yield { type: 'error', message: 'Failed' } as AgentEvent;
        }),
      } as unknown as ReactiveExecutor;

      const agent = createAgent({ reflector, executor });
      const events = await collectEvents(agent.generate('server-1', 'Show stuff'));

      const errors = events.filter((e) => e.type === 'error');
      const reexecError = errors.find(
        (e) => (e as AgentEvent & { type: 'error' }).message.includes('Re-execution failed'),
      );
      expect(reexecError).toBeDefined();
    });
  });

  describe('abort support', () => {
    it('stops generation when signal is aborted before start', async () => {
      const controller = new AbortController();
      controller.abort();

      const agent = createAgent();
      const events = await collectEvents(
        agent.generate('server-1', 'Show stuff', { signal: controller.signal }),
      );

      const error = events.find((e) => e.type === 'error');
      expect(error).toBeDefined();
      expect((error as AgentEvent & { type: 'error' }).message).toContain('aborted');
    });

    it('stops generation when signal is aborted during execution', async () => {
      const controller = new AbortController();

      // Executor that aborts mid-stream
      const executor = {
        execute: vi.fn().mockImplementation(async function* () {
          yield { type: 'thinking', message: 'Step 1...' } as AgentEvent;
          controller.abort(); // Abort during execution
          yield { type: 'thinking', message: 'Step 2...' } as AgentEvent;
          yield { type: 'generation_complete', view: VALID_DYNAMIC_VIEW } as AgentEvent;
        }),
        executeWithFixes: vi.fn(),
      } as unknown as ReactiveExecutor;

      const agent = createAgent({ executor });
      const events = await collectEvents(
        agent.generate('server-1', 'Show stuff', { signal: controller.signal }),
      );

      // Should have aborted after seeing the abort signal
      const error = events.find((e) => e.type === 'error');
      expect(error).toBeDefined();
      expect((error as AgentEvent & { type: 'error' }).message).toContain('aborted');
    });
  });

  describe('event streaming', () => {
    it('streams all executor events through', async () => {
      const executorEvents: AgentEvent[] = [
        { type: 'thinking', message: 'Step 1...' },
        { type: 'tool_result', tool: 'exec_command', success: true, outputPreview: 'data...', latencyMs: 50 },
        { type: 'tool_result', tool: 'exec_command', success: true, outputPreview: 'more...', latencyMs: 30 },
        { type: 'generation_complete', view: VALID_DYNAMIC_VIEW },
      ];

      const executor = createMockExecutor(undefined, executorEvents);
      const agent = createAgent({ executor });

      const events = await collectEvents(agent.generate('server-1', 'Show stuff'));

      const toolResults = events.filter((e) => e.type === 'tool_result');
      expect(toolResults.length).toBe(2);
    });

    it('includes thinking events from all phases', async () => {
      const agent = createAgent();
      const events = await collectEvents(agent.generate('server-1', 'Show disk usage'));

      const thinkingEvents = events.filter((e) => e.type === 'thinking');
      // At least: "Understanding your request..." + "Plan: expecting..." + executor's "Step 1..."
      expect(thinkingEvents.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('shared tool context', () => {
    it('provides SSH connection to executor', async () => {
      const ssh = createMockSSH();
      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createAgent({ ssh, executor });

      await collectEvents(agent.generate('server-1', 'Show stuff'));

      const call = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].ssh).toBe(ssh);
    });

    it('provides template registry to executor', async () => {
      const templateRegistry = createMockTemplateRegistry();
      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createAgent({ templateRegistry, executor });

      await collectEvents(agent.generate('server-1', 'Show stuff'));

      const call = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].templateRegistry).toBe(templateRegistry);
    });

    it('provides previousOutputs map to executor', async () => {
      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createAgent({ executor });

      await collectEvents(agent.generate('server-1', 'Show stuff'));

      const call = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].previousOutputs).toBeInstanceOf(Map);
    });
  });
});
