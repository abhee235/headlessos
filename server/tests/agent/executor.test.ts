// EX2.5: Reactive Executor — Tests
// @see docs/phases/phase-ex2.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReactiveExecutor,
  DEFAULT_EXECUTOR_CONFIG,
  type AgentEvent,
  type ReflectionIssue,
} from '../../src/agent/executor.js';
import { ToolRegistry } from '../../src/agent/tools/tool-registry.js';
import type { ToolContext, AgentTool, ToolResult } from '../../src/agent/tools/types.js';
import type { ModelRouter } from '../../src/llm/model-router.js';
import type { ChatWithToolsResult } from '../../src/llm/provider.js';
import type { PlannerHints } from '../../src/agent/planner.js';
import { z } from 'zod';

// ── DynamicView mock ──

const VALID_DYNAMIC_VIEW = {
  title: 'Disk Usage',
  root: {
    layout: 'stack' as const,
    gap: 'md' as const,
    children: [
      {
        type: 'table' as const,
        title: 'Filesystem Usage',
        columns: [
          { key: 'filesystem', label: 'Filesystem' },
          { key: 'size', label: 'Size' },
          { key: 'used', label: 'Used' },
        ],
        rows: [
          { filesystem: '/dev/sda1', size: '50G', used: '20G' },
        ],
      },
    ],
  },
};

// ── Helpers ──

function createDefaultHints(overrides?: Partial<PlannerHints>): PlannerHints {
  return {
    intent: 'Show disk usage information',
    interactivityLevel: 'display-only',
    expectedWidgets: ['stat-card', 'table'],
    templateHint: null,
    dataSourceHints: ['filesystem usage'],
    suggestedLayout: 'stack',
    securityRequirements: {
      needsWrite: false,
      needsSFTP: false,
      sensitiveData: false,
    },
    estimatedComplexity: 'simple',
    skipPostReflection: true,
    ...overrides,
  };
}

function createMockToolContext(): ToolContext {
  return {
    serverId: 'test-server',
    ssh: {} as ToolContext['ssh'],
    templateRegistry: {
      listAll: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
      searchByTag: vi.fn().mockReturnValue([]),
      matchCommand: vi.fn().mockReturnValue([]),
      getById: vi.fn().mockReturnValue(undefined),
    } as unknown as ToolContext['templateRegistry'],
    previousOutputs: new Map(),
  };
}

function createMockTool(name: string, tier: 'read' | 'write' | 'local' = 'read'): AgentTool {
  return {
    name,
    description: `Mock tool: ${name}`,
    parameters: z.object({ command: z.string().optional() }),
    securityTier: tier,
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: `Output of ${name}`,
    } satisfies ToolResult),
  };
}

function createGenerateSchemaTool(schema: unknown = VALID_DYNAMIC_VIEW): AgentTool {
  return {
    name: 'generate_schema',
    description: 'Generate final DynamicViewSchema',
    parameters: z.object({ schema: z.unknown() }),
    securityTier: 'local',
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: JSON.stringify(schema),
      metadata: { schema, isTerminalTool: true },
    } satisfies ToolResult),
  };
}

/** Helper to build a mock LLM response with tool calls */
function makeToolCallResponse(
  toolCalls: Array<{ name: string; args?: Record<string, unknown> }>,
): ChatWithToolsResult {
  return {
    message: {
      role: 'assistant',
      content: null,
      tool_calls: toolCalls.map((tc, i) => ({
        id: `call_${i}`,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args ?? {}),
        },
      })),
    },
    tokensUsed: { input: 100, output: 50 },
    latencyMs: 200,
    model: 'gpt-4.1',
    finishReason: 'tool_calls',
  };
}

/** Helper to build a mock LLM response with plain text (no tools) */
function makeTextResponse(text: string): ChatWithToolsResult {
  return {
    message: {
      role: 'assistant',
      content: text,
    },
    tokensUsed: { input: 100, output: 50 },
    latencyMs: 200,
    model: 'gpt-4.1',
    finishReason: 'stop',
  };
}

function createMockModelRouter(
  responses: ChatWithToolsResult[],
): ModelRouter {
  const chatFn = vi.fn();
  for (const r of responses) {
    chatFn.mockResolvedValueOnce(r);
  }
  return {
    chat: chatFn,
    reason: vi.fn(),
    fast: vi.fn(),
    summarize: vi.fn(),
    getModel: vi.fn(),
    getRoleConfig: vi.fn(),
    getModelMap: vi.fn(),
    hasProvider: vi.fn(),
    updateConfig: vi.fn(),
  } as unknown as ModelRouter;
}

async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// ── Tests ──

describe('ReactiveExecutor', () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  describe('DEFAULT_EXECUTOR_CONFIG', () => {
    it('has correct defaults', () => {
      expect(DEFAULT_EXECUTOR_CONFIG.maxSteps).toBe(30);
      expect(DEFAULT_EXECUTOR_CONFIG.maxConsecutiveMistakes).toBe(3);
      expect(DEFAULT_EXECUTOR_CONFIG.maxToolRepetitions).toBe(8);
    });
  });

  describe('basic execution flow', () => {
    it('calls LLM and generates schema in one step', async () => {
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const thinkingEvents = events.filter((e) => e.type === 'thinking');
      const completeEvents = events.filter((e) => e.type === 'generation_complete');
      expect(thinkingEvents.length).toBeGreaterThanOrEqual(1);
      expect(completeEvents).toHaveLength(1);
    });

    it('calls tools before generating schema', async () => {
      const execTool = createMockTool('exec_command');
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(execTool);
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        // Step 1: gather data
        makeToolCallResponse([{ name: 'exec_command', args: { command: 'df -h' } }]),
        // Step 2: generate schema
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const toolResults = events.filter((e) => e.type === 'tool_result');
      expect(toolResults).toHaveLength(2); // exec_command + generate_schema
      expect(events.some((e) => e.type === 'generation_complete')).toBe(true);
    });

    it('emits thinking events for each step', async () => {
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const thinking = events.filter((e) => e.type === 'thinking');
      expect(thinking).toHaveLength(1);
      expect((thinking[0] as { type: 'thinking'; message: string }).message).toContain('Step 1');
    });
  });

  describe('tool execution', () => {
    it('passes tools to LLM as OpenAI functions', async () => {
      const execTool = createMockTool('exec_command');
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(execTool);
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      await collectEvents(executor.execute(createDefaultHints(), createMockToolContext()));

      const chatCall = (modelRouter.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(chatCall.tools).toBeDefined();
      expect(chatCall.tools.length).toBe(2);
      expect(chatCall.tools[0].type).toBe('function');
    });

    it('handles tool that returns failure', async () => {
      const failTool: AgentTool = {
        ...createMockTool('exec_command'),
        execute: vi.fn().mockResolvedValue({
          success: false,
          output: '',
          error: 'Command not found',
        } satisfies ToolResult),
      };
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(failTool);
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'exec_command', args: { command: 'df -h' } }]),
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const toolResults = events.filter((e) => e.type === 'tool_result');
      expect(toolResults[0]).toMatchObject({
        type: 'tool_result',
        tool: 'exec_command',
        success: false,
      });
    });

    it('handles tool that throws exception', async () => {
      const throwTool: AgentTool = {
        ...createMockTool('exec_command'),
        execute: vi.fn().mockRejectedValue(new Error('SSH connection lost')),
      };
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(throwTool);
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'exec_command', args: { command: 'df -h' } }]),
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const errorToolResult = events.find(
        (e) => e.type === 'tool_result' && !e.success,
      );
      expect(errorToolResult).toBeDefined();
    });

    it('handles unknown tool name', async () => {
      toolRegistry.register(createGenerateSchemaTool());

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'nonexistent_tool', args: {} }]),
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
      expect((errorEvents[0] as { type: 'error'; message: string }).message).toContain('Unknown tool');
    });

    it('handles invalid JSON in tool arguments', async () => {
      toolRegistry.register(createGenerateSchemaTool());

      const badResponse: ChatWithToolsResult = {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_0',
            type: 'function',
            function: {
              name: 'generate_schema',
              arguments: 'not valid json{{{',
            },
          }],
        },
        tokensUsed: { input: 100, output: 50 },
        latencyMs: 200,
        model: 'gpt-4.1',
        finishReason: 'tool_calls',
      };

      const modelRouter = createMockModelRouter([
        badResponse,
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('caches tool output in previousOutputs', async () => {
      const execTool = createMockTool('exec_command');
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(execTool);
      toolRegistry.register(generateTool);

      const context = createMockToolContext();
      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'exec_command', args: { command: 'df -h' } }]),
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      await collectEvents(executor.execute(createDefaultHints(), context));

      expect(context.previousOutputs.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('generate_schema handling', () => {
    it('validates schema with Zod and returns on success', async () => {
      const generateTool = createGenerateSchemaTool(VALID_DYNAMIC_VIEW);
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const complete = events.find((e) => e.type === 'generation_complete');
      expect(complete).toBeDefined();
      expect((complete as { type: 'generation_complete'; view: unknown }).view).toBeDefined();
    });

    it('feeds Zod errors back as tool results for self-correction', async () => {
      const invalidSchema = { title: 'Test' }; // Missing root
      const invalidGenerateTool = createGenerateSchemaTool(invalidSchema);
      const validGenerateTool = createGenerateSchemaTool(VALID_DYNAMIC_VIEW);

      // Use the invalid tool first, then override for second call
      toolRegistry.register({
        ...invalidGenerateTool,
        execute: vi.fn()
          .mockResolvedValueOnce({
            success: true,
            output: JSON.stringify(invalidSchema),
            metadata: { schema: invalidSchema, isTerminalTool: true },
          })
          .mockResolvedValueOnce({
            success: true,
            output: JSON.stringify(VALID_DYNAMIC_VIEW),
            metadata: { schema: VALID_DYNAMIC_VIEW, isTerminalTool: true },
          }),
      });

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: invalidSchema } }]),
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const reflections = events.filter((e) => e.type === 'reflection');
      expect(reflections).toHaveLength(1);
      expect((reflections[0] as { action: string }).action).toBe('fix');

      // Eventually generates a valid schema
      const complete = events.find((e) => e.type === 'generation_complete');
      expect(complete).toBeDefined();
    });

    it('does not accept schema when tool failed in same turn', async () => {
      const failTool: AgentTool = {
        ...createMockTool('exec_command'),
        execute: vi.fn().mockResolvedValue({
          success: false,
          output: '',
          error: 'Failed',
        }),
      };
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(failTool);
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        // Both tools called in same turn — exec fails, generate_schema succeeds
        makeToolCallResponse([
          { name: 'exec_command', args: { command: 'bad' } },
          { name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } },
        ]),
        // Retry: just generate
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      // Should still eventually complete because the second attempt succeeds
      const complete = events.find((e) => e.type === 'generation_complete');
      expect(complete).toBeDefined();
    });
  });

  describe('safety rails', () => {
    it('detects consecutive mistakes and aborts', async () => {
      toolRegistry.register(createGenerateSchemaTool());

      const modelRouter = createMockModelRouter([
        makeTextResponse('Let me think...'),
        makeTextResponse('Still thinking...'),
        makeTextResponse('Almost there...'),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry, {
        maxConsecutiveMistakes: 3,
      });
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const safetyWarnings = events.filter((e) => e.type === 'safety_warning');
      expect(safetyWarnings).toHaveLength(1);
      expect(
        (safetyWarnings[0] as { warning: string }).warning,
      ).toBe('consecutive_mistakes');

      const errors = events.filter((e) => e.type === 'error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('resets consecutive mistake counter on tool call', async () => {
      const execTool = createMockTool('exec_command');
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(execTool);
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeTextResponse('Thinking...'), // mistake 1
        makeTextResponse('Thinking...'), // mistake 2
        makeToolCallResponse([{ name: 'exec_command', args: {} }]), // resets counter
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry, {
        maxConsecutiveMistakes: 3,
      });
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      // Should NOT have safety warning because the tool call reset the counter
      const safetyWarnings = events.filter(
        (e) => e.type === 'safety_warning' && (e as { warning: string }).warning === 'consecutive_mistakes',
      );
      expect(safetyWarnings).toHaveLength(0);

      // Should complete successfully
      expect(events.some((e) => e.type === 'generation_complete')).toBe(true);
    });

    it('detects tool repetition and warns', async () => {
      const execTool = createMockTool('exec_command');
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(execTool);
      toolRegistry.register(generateTool);

      // Call the same tool with same args 6 times (max is 5)
      const repeatedCalls = Array.from({ length: 6 }, () =>
        makeToolCallResponse([{ name: 'exec_command', args: { command: 'df -h' } }]),
      );
      repeatedCalls.push(
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      );

      const modelRouter = createMockModelRouter(repeatedCalls);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry, {
        maxToolRepetitions: 5,
      });
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const safetyWarnings = events.filter(
        (e) => e.type === 'safety_warning' && (e as { warning: string }).warning === 'tool_repetition',
      );
      expect(safetyWarnings).toHaveLength(1);
    });

    it('enforces max steps limit', async () => {
      const execTool = createMockTool('exec_command');
      toolRegistry.register(execTool);

      // Always call exec_command, never generate schema — but each call has different args
      const responses = Array.from({ length: 5 }, (_, i) =>
        makeToolCallResponse([{ name: 'exec_command', args: { command: `cmd_${i}` } }]),
      );
      const modelRouter = createMockModelRouter(responses);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry, {
        maxSteps: 5,
      });
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const errors = events.filter((e) => e.type === 'error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect((errors[errors.length - 1] as { message: string }).message).toContain('maximum step limit');
    });

    it('guardrails block denied tools', async () => {
      // Create a write tool that tries dangerous operation
      const dangerousTool: AgentTool = {
        name: 'exec_write_command',
        description: 'Execute write command',
        parameters: z.object({ command: z.string() }),
        securityTier: 'write',
        execute: vi.fn().mockResolvedValue({ success: true, output: 'done' }),
      };
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(dangerousTool);
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'exec_write_command', args: { command: 'rm -rf /' } }]),
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      const events = await collectEvents(
        executor.execute(createDefaultHints(), createMockToolContext()),
      );

      const blocked = events.filter((e) => e.type === 'tool_blocked');
      expect(blocked).toHaveLength(1);
      // The tool's execute should never have been called
      expect(dangerousTool.execute).not.toHaveBeenCalled();
    });
  });

  describe('executeWithFixes()', () => {
    it('injects reflection issues into system prompt', async () => {
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const issues: ReflectionIssue[] = [
        {
          severity: 'critical',
          description: 'Missing form widget for editable config',
          fix: 'Add a form widget with writeBack config',
          didYouMean: 'widget.type should be form, not table',
        },
      ];

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      await collectEvents(
        executor.executeWithFixes(createDefaultHints(), issues, createMockToolContext()),
      );

      const chatCall = (modelRouter.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const systemMessage = chatCall.messages.find((m: ChatWithToolsResult['message']) => m.role === 'system');
      expect(systemMessage.content).toContain('Fix Instructions');
      expect(systemMessage.content).toContain('Missing form widget');
      expect(systemMessage.content).toContain('form, not table');
    });
  });

  describe('message history', () => {
    it('builds correct initial messages', async () => {
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      await collectEvents(executor.execute(createDefaultHints(), createMockToolContext()));

      // Note: messages array is a mutable reference — the executor appends to it
      // after calling chat. We verify that the first two messages are system + user.
      const chatCall = (modelRouter.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(chatCall.messages[0].role).toBe('system');
      expect(chatCall.messages[1].role).toBe('user');
      expect(chatCall.messages[0].content).toContain('UI Generation Agent');
      expect(chatCall.messages[1].content).toContain('disk usage');
    });

    it('appends assistant and tool messages to history', async () => {
      const execTool = createMockTool('exec_command');
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(execTool);
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'exec_command', args: { command: 'df -h' } }]),
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      await collectEvents(executor.execute(createDefaultHints(), createMockToolContext()));

      // Second call should have accumulated messages
      const secondCall = (modelRouter.chat as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const messageRoles = secondCall.messages.map((m: { role: string }) => m.role);
      // system, user, assistant (tool_calls), tool (result)
      expect(messageRoles).toContain('system');
      expect(messageRoles).toContain('user');
      expect(messageRoles).toContain('assistant');
      expect(messageRoles).toContain('tool');
    });

    it('nudges LLM when it responds with text only', async () => {
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(generateTool);

      const modelRouter = createMockModelRouter([
        makeTextResponse('I should use tools...'),
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry, {
        maxConsecutiveMistakes: 3,
      });
      await collectEvents(executor.execute(createDefaultHints(), createMockToolContext()));

      // The messages array is a mutable reference. After the text response,
      // a nudge user message should be added before the second chat call.
      // Find the nudge message in the messages array.
      const secondCall = (modelRouter.chat as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const nudgeMessage = secondCall.messages.find(
        (m: { role: string; content: string | null }) =>
          m.role === 'user' && m.content?.includes('use the available tools'),
      );
      expect(nudgeMessage).toBeDefined();
    });
  });

  describe('system prompt', () => {
    it('includes intent and expected widgets', async () => {
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(generateTool);

      const hints = createDefaultHints({
        intent: 'Show nginx configuration',
        expectedWidgets: ['code-block', 'form'],
      });

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      await collectEvents(executor.execute(hints, createMockToolContext()));

      const chatCall = (modelRouter.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const systemPrompt = chatCall.messages[0].content;
      expect(systemPrompt).toContain('Show nginx configuration');
      expect(systemPrompt).toContain('code-block');
      expect(systemPrompt).toContain('form');
    });

    it('includes template hint when present', async () => {
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(generateTool);

      const hints = createDefaultHints({ templateHint: 'nginx-config' });

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      await collectEvents(executor.execute(hints, createMockToolContext()));

      const chatCall = (modelRouter.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(chatCall.messages[0].content).toContain('nginx-config');
    });

    it('includes security notes for write requests', async () => {
      const generateTool = createGenerateSchemaTool();
      toolRegistry.register(generateTool);

      const hints = createDefaultHints({
        securityRequirements: { needsWrite: true, needsSFTP: true, sensitiveData: true },
      });

      const modelRouter = createMockModelRouter([
        makeToolCallResponse([{ name: 'generate_schema', args: { schema: VALID_DYNAMIC_VIEW } }]),
      ]);

      const executor = new ReactiveExecutor(modelRouter, toolRegistry);
      await collectEvents(executor.execute(hints, createMockToolContext()));

      const chatCall = (modelRouter.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const systemPrompt = chatCall.messages[0].content;
      expect(systemPrompt).toContain('write-back');
      expect(systemPrompt).toContain('sensitive data');
    });
  });
});
