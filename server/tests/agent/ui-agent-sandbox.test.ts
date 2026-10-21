// EX5-B.3: Two-Phase Agent Flow — Sandbox integration tests
// @see docs/phases/phase-ex5.md — EX5-B.3

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIAgent, type UIAgentEvent, type AgentMeta } from '../../src/agent/ui-agent.js';
import type { ModelRouter } from '../../src/llm/model-router.js';
import type { Planner, PlannerHints } from '../../src/agent/planner.js';
import type { ReactiveExecutor, AgentEvent } from '../../src/agent/executor.js';
import type { PostGenerationReflector, Reflection } from '../../src/agent/reflector.js';
import type { ConnectionManager } from '../../src/ssh/connection-manager.js';
import type { TemplateRegistry } from '../../src/dynamic-ui/template-registry.js';
import type { SandboxManager, SandboxInfo } from '../../src/agent/sandbox-manager.js';
import { currentAgentScope } from '../../src/services/policy/agent-scope.js';
import { getDefaultCatalog, actionTool } from '../../src/agent/actions/index.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

// ── Helpers (mirrors ui-agent.test.ts patterns) ──

const VALID_DYNAMIC_VIEW: DynamicView = {
  title: 'nginx Manager',
  root: {
    layout: 'stack',
    gap: 'md',
    children: [
      {
        type: 'form',
        title: 'Config',
        fields: [{ key: 'port', label: 'Port', inputType: 'text' }],
      },
    ],
  },
} as DynamicView;

function createDefaultHints(overrides?: Partial<PlannerHints>): PlannerHints {
  return {
    intent: 'Build UI for nginx',
    interactivityLevel: 'interactive',
    expectedWidgets: ['form'],
    templateHint: null,
    dataSourceHints: ['nginx config'],
    suggestedLayout: 'stack',
    securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false },
    estimatedComplexity: 'moderate',
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
    { type: 'tool_result', tool: 'exec_command', success: true, outputPreview: 'nginx usage...', latencyMs: 100 },
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

function createMockReflector(shouldSkipValue = true): PostGenerationReflector {
  return {
    reflect: vi.fn().mockResolvedValue({
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

const SANDBOX_INFO: SandboxInfo = {
  id: 'abc123def456',
  serverId: 'server-1',
  containerId: 'abc123def456',
  containerName: 'hos-sandbox-abc123def456',
  baseImage: 'ubuntu:22.04',
  toolName: 'nginx',
  status: 'ready',
  createdAt: new Date(),
  ttlMs: 300_000,
};

function createMockSandboxManager(opts?: {
  createFails?: boolean;
  installFails?: boolean;
  destroyFails?: boolean;
}): SandboxManager {
  const createFn = opts?.createFails
    ? vi.fn().mockRejectedValue(new Error('Docker not available'))
    : vi.fn().mockResolvedValue(SANDBOX_INFO);

  const installFn = opts?.installFails
    ? vi.fn().mockRejectedValue(new Error('Package not found'))
    : vi.fn().mockResolvedValue('nginx installed');

  const destroyFn = opts?.destroyFails
    ? vi.fn().mockRejectedValue(new Error('Container not found'))
    : vi.fn().mockResolvedValue(undefined);

  return {
    create: createFn,
    exec: vi.fn().mockResolvedValue('output'),
    install: installFn,
    destroySandbox: destroyFn,
    destroyAll: vi.fn().mockResolvedValue(0),
  } as unknown as SandboxManager;
}

function createSandboxAgent(overrides?: {
  modelRouter?: ModelRouter;
  planner?: Planner;
  executor?: ReactiveExecutor;
  reflector?: PostGenerationReflector;
  ssh?: ConnectionManager;
  templateRegistry?: TemplateRegistry;
  sandboxManager?: SandboxManager;
}): UIAgent {
  return new UIAgent({
    modelRouter: overrides?.modelRouter ?? createMockModelRouter(),
    planner: overrides?.planner ?? createMockPlanner(),
    executor: overrides?.executor ?? createMockExecutor(VALID_DYNAMIC_VIEW),
    reflector: overrides?.reflector ?? createMockReflector(),
    ssh: overrides?.ssh ?? createMockSSH(),
    templateRegistry: overrides?.templateRegistry ?? createMockTemplateRegistry(),
    sandboxManager: overrides?.sandboxManager ?? createMockSandboxManager(),
  });
}

async function collectEvents(gen: AsyncGenerator<UIAgentEvent>): Promise<UIAgentEvent[]> {
  const events: UIAgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

function thinkingMessages(events: UIAgentEvent[]): string[] {
  return events
    .filter((e): e is UIAgentEvent & { type: 'thinking'; message: string } => e.type === 'thinking')
    .map((e) => e.message);
}

// ── Tests ──

describe('UIAgent — Sandbox Mode (EX5-B.3)', () => {
  describe('sandbox lifecycle', () => {
    it('creates sandbox, installs tool, and destroys on completion', async () => {
      const sandboxManager = createMockSandboxManager();
      const agent = createSandboxAgent({ sandboxManager });

      const events = await collectEvents(
        agent.generate('server-1', 'Build UI for nginx', {
          sandboxMode: true,
          toolName: 'nginx',
        }),
      );

      // Sandbox was created
      expect(sandboxManager.create).toHaveBeenCalledWith('server-1', 'nginx');

      // Tool was installed
      expect(sandboxManager.install).toHaveBeenCalledWith(SANDBOX_INFO.id, ['nginx']);

      // Sandbox was destroyed after generation
      expect(sandboxManager.destroySandbox).toHaveBeenCalledWith(SANDBOX_INFO.id);

      // Complete event emitted
      const complete = events.find((e) => e.type === 'complete');
      expect(complete).toBeDefined();
    });

    it('emits sandbox lifecycle thinking events', async () => {
      const sandboxManager = createMockSandboxManager();
      const agent = createSandboxAgent({ sandboxManager });

      const events = await collectEvents(
        agent.generate('server-1', 'Build UI for nginx', {
          sandboxMode: true,
          toolName: 'nginx',
        }),
      );

      const messages = thinkingMessages(events);
      expect(messages.some(m => m.includes('Creating sandbox'))).toBe(true);
      expect(messages.some(m => m.includes('Installing nginx'))).toBe(true);
      expect(messages.some(m => m.includes('Sandbox ready'))).toBe(true);
      expect(messages.some(m => m.includes('Sandbox destroyed'))).toBe(true);
    });

    it('wires sandbox context into tool context', async () => {
      const sandboxManager = createMockSandboxManager();
      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createSandboxAgent({ sandboxManager, executor });

      await collectEvents(
        agent.generate('server-1', 'Build UI for nginx', {
          sandboxMode: true,
          toolName: 'nginx',
        }),
      );

      // Verify context passed to executor includes sandbox refs
      const call = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const context = call[1]; // execute(hints, context)
      expect(context.sandboxManager).toBe(sandboxManager);
      expect(context.activeSandboxId).toBe(SANDBOX_INFO.id);
    });

    // EX9.1: the sandbox lifecycle is our code, so CommandPolicy must not treat it as the agent
    it('creates, installs and destroys the sandbox outside the agent scope', async () => {
      const sandboxManager = createMockSandboxManager();
      const scopes: unknown[] = [];
      for (const fn of ['create', 'install', 'destroySandbox'] as const) {
        const original = (sandboxManager[fn] as ReturnType<typeof vi.fn>).getMockImplementation();
        (sandboxManager[fn] as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
          scopes.push(currentAgentScope());
          return original!(...args);
        });
      }
      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      (executor.execute as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        scopes.push(currentAgentScope()?.agent); // the executor itself runs as the agent
        yield { type: 'generation_complete', view: VALID_DYNAMIC_VIEW } as AgentEvent;
      });
      const agent = createSandboxAgent({ sandboxManager, executor });

      await collectEvents(agent.generate('server-1', 'Build UI for nginx', { sandboxMode: true, toolName: 'nginx' }));

      expect(scopes).toEqual([undefined, undefined, 'ui-agent', undefined]);
    });

    // EX9.1: sandbox_exec is gone; the cli_* actions run inside the active sandbox
    it('runs cli actions inside the sandbox container', async () => {
      const sandboxManager = createMockSandboxManager();
      (sandboxManager as unknown as { getSandbox: unknown }).getSandbox = vi.fn().mockReturnValue(SANDBOX_INFO);
      const ssh = createMockSSH();
      (ssh.exec as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'Usage: nginx [-h]', stderr: '', exitCode: 0, durationMs: 5 });
      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createSandboxAgent({ sandboxManager, executor, ssh });

      await collectEvents(agent.generate('server-1', 'Build UI for nginx', { sandboxMode: true, toolName: 'nginx' }));
      const context = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0]![1];

      const help = actionTool(getDefaultCatalog().get('cli_help')!);
      const result = await help.execute({ program: 'nginx' }, context);
      expect(result.success).toBe(true);
      expect(ssh.exec).toHaveBeenCalledWith('server-1', `docker exec ${SANDBOX_INFO.containerName} nginx --help`, expect.any(Number));

      // a non-cli action still runs on the host
      const disk = actionTool(getDefaultCatalog().get('disk_usage')!);
      await disk.execute({}, context);
      expect(ssh.exec).toHaveBeenLastCalledWith('server-1', 'df -hT', expect.any(Number));
    });
  });

  describe('sandbox fallback on failure', () => {
    it('falls back to direct execution when sandbox creation fails', async () => {
      const sandboxManager = createMockSandboxManager({ createFails: true });
      const executor = createMockExecutor(VALID_DYNAMIC_VIEW);
      const agent = createSandboxAgent({ sandboxManager, executor });

      const events = await collectEvents(
        agent.generate('server-1', 'Build UI for nginx', {
          sandboxMode: true,
          toolName: 'nginx',
        }),
      );

      // Should still complete (falls back to non-sandbox mode)
      const complete = events.find((e) => e.type === 'complete');
      expect(complete).toBeDefined();

      // Context should NOT have sandbox refs
      const call = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const context = call[1];
      expect(context.activeSandboxId).toBeUndefined();

      // Should NOT try to destroy (never created)
      expect(sandboxManager.destroySandbox).not.toHaveBeenCalled();

      // Should emit fallback message
      const messages = thinkingMessages(events);
      expect(messages.some(m => m.includes('Sandbox creation failed'))).toBe(true);
    });

    it('continues when install fails (tool may be pre-installed)', async () => {
      const sandboxManager = createMockSandboxManager({ installFails: true });
      const agent = createSandboxAgent({ sandboxManager });

      const events = await collectEvents(
        agent.generate('server-1', 'Build UI for nginx', {
          sandboxMode: true,
          toolName: 'nginx',
        }),
      );

      // Still completes
      const complete = events.find((e) => e.type === 'complete');
      expect(complete).toBeDefined();

      // Sandbox still destroyed (it was created successfully)
      expect(sandboxManager.destroySandbox).toHaveBeenCalledWith(SANDBOX_INFO.id);

      // Emits helpful note
      const messages = thinkingMessages(events);
      expect(messages.some(m => m.includes('may not need installation'))).toBe(true);
    });

    it('handles destroy failure gracefully (best-effort cleanup)', async () => {
      const sandboxManager = createMockSandboxManager({ destroyFails: true });
      const agent = createSandboxAgent({ sandboxManager });

      // Should not throw even if destroy fails
      const events = await collectEvents(
        agent.generate('server-1', 'Build UI for nginx', {
          sandboxMode: true,
          toolName: 'nginx',
        }),
      );

      const complete = events.find((e) => e.type === 'complete');
      expect(complete).toBeDefined();
      expect(sandboxManager.destroySandbox).toHaveBeenCalled();
    });
  });

  describe('sandbox disabled', () => {
    it('does not create sandbox when sandboxMode is false', async () => {
      const sandboxManager = createMockSandboxManager();
      const agent = createSandboxAgent({ sandboxManager });

      await collectEvents(
        agent.generate('server-1', 'Show disk usage', {
          sandboxMode: false,
        }),
      );

      expect(sandboxManager.create).not.toHaveBeenCalled();
      expect(sandboxManager.destroySandbox).not.toHaveBeenCalled();
    });

    it('does not create sandbox when sandboxMode is omitted', async () => {
      const sandboxManager = createMockSandboxManager();
      const agent = createSandboxAgent({ sandboxManager });

      await collectEvents(
        agent.generate('server-1', 'Show disk usage'),
      );

      expect(sandboxManager.create).not.toHaveBeenCalled();
    });

    it('does not create sandbox when sandboxManager is not provided', async () => {
      const agent = new UIAgent({
        modelRouter: createMockModelRouter(),
        planner: createMockPlanner(),
        executor: createMockExecutor(VALID_DYNAMIC_VIEW),
        reflector: createMockReflector(),
        ssh: createMockSSH(),
        templateRegistry: createMockTemplateRegistry(),
        // no sandboxManager
      });

      // Should work fine without sandbox
      const events = await collectEvents(
        agent.generate('server-1', 'Show disk usage', { sandboxMode: true }),
      );

      const complete = events.find((e) => e.type === 'complete');
      expect(complete).toBeDefined();
    });
  });

  describe('sandbox cleanup on abort', () => {
    it('destroys sandbox when generation is aborted', async () => {
      const sandboxManager = createMockSandboxManager();
      const abortController = new AbortController();

      // Executor that yields once then waits (we abort during execution)
      const slowExecutor = {
        execute: vi.fn().mockImplementation(
          async function* () {
            yield { type: 'thinking', message: 'Working...' };
            // Signal abort before next yield
            abortController.abort();
            yield { type: 'thinking', message: 'Still working...' };
          },
        ),
        executeWithFixes: vi.fn(),
      } as unknown as ReactiveExecutor;

      const agent = createSandboxAgent({ sandboxManager, executor: slowExecutor });

      const events = await collectEvents(
        agent.generate('server-1', 'Build UI for nginx', {
          sandboxMode: true,
          toolName: 'nginx',
          signal: abortController.signal,
        }),
      );

      // Should abort
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();

      // Sandbox should still be destroyed (cleanup in finally block)
      expect(sandboxManager.destroySandbox).toHaveBeenCalledWith(SANDBOX_INFO.id);
    });
  });

  describe('extractToolName (via options)', () => {
    it('uses explicit toolName when provided', async () => {
      const sandboxManager = createMockSandboxManager();
      const agent = createSandboxAgent({ sandboxManager });

      await collectEvents(
        agent.generate('server-1', 'Build something', {
          sandboxMode: true,
          toolName: 'restic',
        }),
      );

      expect(sandboxManager.create).toHaveBeenCalledWith('server-1', 'restic');
    });

    it('extracts tool name from "Build UI for X" pattern', async () => {
      const sandboxManager = createMockSandboxManager();
      const agent = createSandboxAgent({ sandboxManager });

      await collectEvents(
        agent.generate('server-1', 'Build UI for nginx', {
          sandboxMode: true,
          // no toolName — should extract "nginx" from request
        }),
      );

      expect(sandboxManager.create).toHaveBeenCalledWith('server-1', 'nginx');
    });

    it('extracts tool name from "create dashboard for X" pattern', async () => {
      const sandboxManager = createMockSandboxManager();
      const agent = createSandboxAgent({ sandboxManager });

      await collectEvents(
        agent.generate('server-1', 'Create a dashboard for htop', {
          sandboxMode: true,
        }),
      );

      expect(sandboxManager.create).toHaveBeenCalledWith('server-1', 'htop');
    });

    it('falls back to last word for unrecognized patterns', async () => {
      const sandboxManager = createMockSandboxManager();
      const agent = createSandboxAgent({ sandboxManager });

      await collectEvents(
        agent.generate('server-1', 'restic', {
          sandboxMode: true,
        }),
      );

      expect(sandboxManager.create).toHaveBeenCalledWith('server-1', 'restic');
    });
  });
});
