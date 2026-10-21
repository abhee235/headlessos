// FakeLLM End-to-End Pipeline Test
//
// Runs the REAL UIAgent pipeline (Plan → Execute → Reflect → Complete)
// with a FakeLLMProvider and MockSSH. Verifies the full event sequence,
// tool execution, Zod validation, and final DynamicView output.
//
// This is the "gold standard" test — if this passes, the pipeline is
// correctly wired. Then we tune real prompts to reproduce this quality.

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import { FakeLLMProvider, createFakeModelRouter } from '../../src/llm/providers/fake-llm.js';
import { UIAgent, type UIAgentEvent } from '../../src/agent/ui-agent.js';
import { Planner } from '../../src/agent/planner.js';
import { ReactiveExecutor, type AgentEvent } from '../../src/agent/executor.js';
import { PostGenerationReflector } from '../../src/agent/reflector.js';
import { ToolRegistry } from '../../src/agent/tools/tool-registry.js';
import { ALL_AGENT_TOOLS } from '../../src/agent/tools/index.js';
import { TemplateRegistry } from '../../src/dynamic-ui/template-registry.js';
import { MockSSHConnectionManager, createUbuntuServerOutputs } from './helpers/mock-ssh.js';
import {
  SYSTEM_OVERVIEW_SCENARIO,
  SYSTEM_OVERVIEW_WITH_REFLECTION_SCENARIO,
  SYSTEM_OVERVIEW_GOLD_VIEW,
} from './scenarios/system-overview.js';
import type { ModelRouter } from '../../src/llm/model-router.js';
import type { ConnectionManager } from '../../src/ssh/connection-manager.js';

// ── Helpers ──

async function collectEvents(gen: AsyncGenerator<UIAgentEvent>): Promise<UIAgentEvent[]> {
  const events: UIAgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

function createPipeline(scenario: typeof SYSTEM_OVERVIEW_SCENARIO) {
  const fakeLLM = new FakeLLMProvider(scenario);
  const modelRouter = createFakeModelRouter(fakeLLM) as unknown as ModelRouter;
  const templateRegistry = new TemplateRegistry();
  const mockSSH = new MockSSHConnectionManager(createUbuntuServerOutputs());

  // Register ALL real tools — they'll use MockSSH for exec
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerAll(ALL_AGENT_TOOLS);

  const planner = new Planner(modelRouter, templateRegistry);
  const executor = new ReactiveExecutor(modelRouter, toolRegistry);
  const reflector = new PostGenerationReflector(modelRouter);

  const agent = new UIAgent({
    modelRouter,
    planner,
    executor,
    reflector,
    ssh: mockSSH as unknown as ConnectionManager,
    templateRegistry,
  });

  return { agent, fakeLLM, mockSSH, modelRouter, toolRegistry };
}

// ── Tests ──

describe('FakeLLM End-to-End Pipeline', () => {
  describe('System Overview — skip reflection path', () => {
    let events: UIAgentEvent[];
    let fakeLLM: FakeLLMProvider;
    let mockSSH: MockSSHConnectionManager;

    beforeEach(async () => {
      const pipeline = createPipeline(SYSTEM_OVERVIEW_SCENARIO);
      fakeLLM = pipeline.fakeLLM;
      mockSSH = pipeline.mockSSH;
      events = await collectEvents(
        pipeline.agent.generate('test-server', 'show me system overview'),
      );
    });

    it('completes without errors', () => {
      const errors = events.filter(e => e.type === 'error');
      expect(errors).toHaveLength(0);
    });

    it('emits a complete event with valid DynamicView', () => {
      const complete = events.find(
        (e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete',
      );
      expect(complete).toBeDefined();
      expect(complete!.view).toBeDefined();
      expect(complete!.view.title).toBe('System Overview');

      // Double-check: final view passes Zod validation
      const result = DynamicViewSchema.safeParse(complete!.view);
      expect(result.success).toBe(true);
    });

    it('produces the gold-standard view structure', () => {
      const complete = events.find(
        (e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete',
      );
      const view = complete!.view;

      // Top-level fields
      expect(view.title).toBe(SYSTEM_OVERVIEW_GOLD_VIEW.title);
      expect(view.description).toBe(SYSTEM_OVERVIEW_GOLD_VIEW.description);
      expect(view.icon).toBe(SYSTEM_OVERVIEW_GOLD_VIEW.icon);

      // Should have sidebarItems and sections
      expect(view.sidebarItems).toBeDefined();
      expect(Object.keys(view.sections).length).toBeGreaterThan(0);

      // Main section layout = stack
      const mainSection = view.sections.main as Record<string, unknown>;
      expect(mainSection.layout).toBe('stack');

      // Count children — should match gold standard
      if ('children' in mainSection) {
        const goldSection = SYSTEM_OVERVIEW_GOLD_VIEW.sections.main as Record<string, unknown>;
        if ('children' in goldSection) {
          expect((mainSection.children as unknown[])).toHaveLength((goldSection.children as unknown[]).length);
        }
      }
    });

    it('emits correct event sequence', () => {
      const types = events.map(e => e.type);

      // Should start with planning thinking events
      expect(types[0]).toBe('thinking');

      // Should contain tool_result events for get_server_context and the process_list action
      const toolResults = events.filter(
        (e): e is AgentEvent & { type: 'tool_result' } => e.type === 'tool_result',
      );
      expect(toolResults.length).toBeGreaterThanOrEqual(2);

      // First tool result should be get_server_context (successful)
      const contextResult = toolResults.find(e => e.tool === 'get_server_context');
      expect(contextResult).toBeDefined();
      expect(contextResult!.success).toBe(true);

      // EX9.1: the agent ran a catalog action, never a free-form command
      const actionResult = toolResults.find(e => e.tool === 'process_list');
      expect(actionResult).toBeDefined();
      expect(actionResult!.success).toBe(true);

      // Should have generate_schema tool result
      const genResult = toolResults.find(e => e.tool === 'generate_schema');
      expect(genResult).toBeDefined();
      expect(genResult!.success).toBe(true);

      // Should have generation_complete event
      expect(types).toContain('generation_complete');

      // Should end with complete
      expect(types[types.length - 1]).toBe('complete');
    });

    it('has correct meta in complete event', () => {
      const complete = events.find(
        (e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete',
      );
      const meta = complete!.meta;

      expect(meta.sessionId).toBeDefined();
      expect(meta.latencyMs).toBeGreaterThanOrEqual(0);
      expect(meta.stepsCompleted).toBeGreaterThan(0);
      expect(meta.reflectionLoops).toBe(0); // skipPostReflection=true
      expect(meta.warning).toBeUndefined();
    });

    it('all tool calls succeeded', () => {
      const toolResults = events.filter(
        (e): e is AgentEvent & { type: 'tool_result' } => e.type === 'tool_result',
      );
      for (const result of toolResults) {
        expect(result.success).toBe(true);
      }
    });

    it('FakeLLM consumed all responses', () => {
      expect(fakeLLM.isExhausted).toBe(true);
      expect(fakeLLM.remainingParseTextCalls).toBe(0);
      expect(fakeLLM.remainingChatCalls).toBe(0);
    });

    it('MockSSH was called for the server', () => {
      expect(mockSSH.execLog.length).toBeGreaterThan(0);
      // All calls should be for the right server
      for (const log of mockSSH.execLog) {
        expect(log.serverId).toBe('test-server');
      }
    });

    it('no safety warnings emitted', () => {
      const warnings = events.filter(e => e.type === 'safety_warning');
      expect(warnings).toHaveLength(0);
    });

    it('no tool_blocked events emitted', () => {
      const blocked = events.filter(e => e.type === 'tool_blocked');
      expect(blocked).toHaveLength(0);
    });

    it('gold-standard view contains expected widget types', () => {
      const complete = events.find(
        (e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete',
      );
      const view = complete!.view;

      // Collect all widget types recursively
      const widgetTypes = new Set<string>();
      function walk(node: unknown): void {
        if (node && typeof node === 'object') {
          const obj = node as Record<string, unknown>;
          if ('type' in obj && typeof obj.type === 'string') {
            widgetTypes.add(obj.type);
          }
          if ('children' in obj && Array.isArray(obj.children)) {
            for (const child of obj.children) walk(child);
          }
          if ('tabs' in obj && Array.isArray(obj.tabs)) {
            for (const tab of obj.tabs) {
              if (tab && typeof tab === 'object' && 'children' in tab) {
                for (const child of (tab as Record<string, unknown[]>).children) walk(child);
              }
            }
          }
        }
      }
      // Walk all sections
      for (const section of Object.values(view.sections)) {
        walk(section);
      }

      // Should contain the expected widget types
      expect(widgetTypes.has('alert')).toBe(true);
      expect(widgetTypes.has('key-value')).toBe(true);
      expect(widgetTypes.has('stat-card')).toBe(true);
      expect(widgetTypes.has('progress-bar')).toBe(true);
    });
  });

  describe('System Overview — with reflection path', () => {
    let events: UIAgentEvent[];
    let fakeLLM: FakeLLMProvider;

    beforeEach(async () => {
      const pipeline = createPipeline(SYSTEM_OVERVIEW_WITH_REFLECTION_SCENARIO);
      fakeLLM = pipeline.fakeLLM;
      events = await collectEvents(
        pipeline.agent.generate('test-server', 'show me system overview'),
      );
    });

    it('completes without errors', () => {
      const errors = events.filter(e => e.type === 'error');
      expect(errors).toHaveLength(0);
    });

    it('emits reflection event', () => {
      const reflections = events.filter(
        (e): e is AgentEvent & { type: 'reflection' } => e.type === 'reflection',
      );
      expect(reflections.length).toBeGreaterThanOrEqual(1);

      // Reflection should be an approval
      const lastReflection = reflections[reflections.length - 1]!;
      expect(lastReflection.action).toBe('approve');
    });

    it('has reflectionLoops > 0 in meta', () => {
      const complete = events.find(
        (e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete',
      );
      expect(complete).toBeDefined();
      expect(complete!.meta.reflectionLoops).toBeGreaterThan(0);
    });

    it('FakeLLM consumed all responses including reflector', () => {
      expect(fakeLLM.isExhausted).toBe(true);
    });

    it('produces valid DynamicView despite reflection', () => {
      const complete = events.find(
        (e): e is UIAgentEvent & { type: 'complete' } => e.type === 'complete',
      );
      const result = DynamicViewSchema.safeParse(complete!.view);
      expect(result.success).toBe(true);
    });
  });

  describe('FakeLLMProvider unit behavior', () => {
    it('throws when parseText queue exhausted', async () => {
      const fake = new FakeLLMProvider({
        name: 'empty-test',
        parseTextResponses: [],
        chatResponses: [],
      });

      const { z } = await import('zod');
      await expect(
        fake.parseText({ rawOutput: '', command: 'test', schema: z.string() }),
      ).rejects.toThrow('parseText queue exhausted');
    });

    it('throws when chatWithTools queue exhausted', async () => {
      const fake = new FakeLLMProvider({
        name: 'empty-test',
        parseTextResponses: [],
        chatResponses: [],
      });

      await expect(
        fake.chatWithTools({ messages: [] }),
      ).rejects.toThrow('chatWithTools queue exhausted');
    });

    it('validates data against provided schema', async () => {
      const { z } = await import('zod');
      const fake = new FakeLLMProvider({
        name: 'schema-test',
        parseTextResponses: [
          { data: { bad: 'data' } }, // Does not match z.string()
        ],
        chatResponses: [],
      });

      await expect(
        fake.parseText({ rawOutput: '', command: 'test', schema: z.string() }),
      ).rejects.toThrow(); // Zod parse error
    });

    it('tracks call counts correctly', async () => {
      const { z } = await import('zod');
      const fake = new FakeLLMProvider({
        name: 'tracking-test',
        parseTextResponses: [
          { data: 'hello' },
          { data: 'world' },
        ],
        chatResponses: [
          {
            message: { role: 'assistant', content: 'hi' },
            tokensUsed: { input: 10, output: 5 },
            latencyMs: 50,
            model: 'test',
            finishReason: 'stop',
          },
        ],
      });

      await fake.parseText({ rawOutput: '', command: 'cmd1', schema: z.string() });
      await fake.parseText({ rawOutput: '', command: 'cmd2', schema: z.string() });
      await fake.chatWithTools({ messages: [] });

      expect(fake.callLog.parseTextCalls).toHaveLength(2);
      expect(fake.callLog.chatCalls).toHaveLength(1);
      expect(fake.isExhausted).toBe(true);
    });

    it('reset replays from beginning', async () => {
      const { z } = await import('zod');
      const fake = new FakeLLMProvider({
        name: 'reset-test',
        parseTextResponses: [{ data: 'hello' }],
        chatResponses: [],
      });

      await fake.parseText({ rawOutput: '', command: 'cmd1', schema: z.string() });
      expect(fake.remainingParseTextCalls).toBe(0);

      fake.reset();
      expect(fake.remainingParseTextCalls).toBe(1);
      expect(fake.callLog.parseTextCalls).toHaveLength(0);
    });
  });

  describe('MockSSHConnectionManager', () => {
    it('returns canned output for known commands', async () => {
      const mock = new MockSSHConnectionManager(createUbuntuServerOutputs());
      const result = await mock.exec('srv', 'uptime');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('up 42 days');
    });

    it('throws for unknown commands', async () => {
      const mock = new MockSSHConnectionManager(new Map());
      await expect(mock.exec('srv', 'ls /foo')).rejects.toThrow('MockSSH: unexpected command');
    });

    it('logs all exec calls', async () => {
      const mock = new MockSSHConnectionManager(createUbuntuServerOutputs());
      await mock.exec('s1', 'uptime');
      await mock.exec('s2', 'uname -a');
      expect(mock.execLog).toHaveLength(2);
      expect(mock.execLog[0]!.serverId).toBe('s1');
      expect(mock.execLog[1]!.command).toBe('uname -a');
    });
  });

  describe('Gold-standard DynamicView validation', () => {
    it('SYSTEM_OVERVIEW_GOLD_VIEW passes DynamicViewSchema', () => {
      const result = DynamicViewSchema.safeParse(SYSTEM_OVERVIEW_GOLD_VIEW);
      if (!result.success) {
        // Print Zod errors for debugging
        console.error('Gold standard validation errors:', JSON.stringify(result.error.issues, null, 2));
      }
      expect(result.success).toBe(true);
    });
  });
});
