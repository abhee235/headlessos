// EX9.1: LLM_PROVIDER=fake dev mode still runs end to end on catalog actions
// The progressive scenario's action calls must all resolve to canned fake-server outputs.

import { describe, it, expect, vi } from 'vitest';
import { FakeLLMProvider, createFakeModelRouter } from '../../src/llm/providers/fake-llm.js';
import { FakeSSHProxy, createFakeServerOutputs } from '../../src/llm/providers/fake-ssh-proxy.js';
import { PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO } from '../../src/llm/providers/fake-progressive-scenario.js';
import { UIAgent, type UIAgentEvent } from '../../src/agent/ui-agent.js';
import { Planner } from '../../src/agent/planner.js';
import { ReactiveExecutor, type AgentEvent } from '../../src/agent/executor.js';
import { PostGenerationReflector } from '../../src/agent/reflector.js';
import { ToolRegistry } from '../../src/agent/tools/tool-registry.js';
import { ALL_AGENT_TOOLS, clearServerContextCache } from '../../src/agent/tools/index.js';
import { TemplateRegistry } from '../../src/dynamic-ui/template-registry.js';
import type { ModelRouter } from '../../src/llm/model-router.js';
import type { ConnectionManager } from '../../src/ssh/connection-manager.js';

describe('fake dev mode on actions (EX9.1)', () => {
  it('runs the progressive scenario with every action answered by fake-server', async () => {
    clearServerContextCache();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeLLM = new FakeLLMProvider(PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO);
    const modelRouter = createFakeModelRouter(fakeLLM) as unknown as ModelRouter;
    const real = { exec: vi.fn(), getSftp: vi.fn(), getState: vi.fn() } as unknown as ConnectionManager;
    const ssh = new FakeSSHProxy(real, createFakeServerOutputs()) as unknown as ConnectionManager;
    const templateRegistry = new TemplateRegistry();
    const toolRegistry = new ToolRegistry();
    toolRegistry.registerAll(ALL_AGENT_TOOLS);

    const agent = new UIAgent({
      modelRouter,
      planner: new Planner(modelRouter, templateRegistry),
      executor: new ReactiveExecutor(modelRouter, toolRegistry),
      reflector: new PostGenerationReflector(modelRouter),
      ssh,
      templateRegistry,
    });

    const events: UIAgentEvent[] = [];
    for await (const e of agent.generate('fake-server', 'Show me a system overview')) events.push(e);

    const results = events.filter((e): e is Extract<AgentEvent, { type: 'tool_result' }> => e.type === 'tool_result');
    const actionCalls = results.filter((r) => !['update_view', 'generate_schema', 'get_server_context'].includes(r.tool));
    expect(actionCalls.map((r) => r.tool)).toEqual([
      'kernel_info', 'memory_usage', 'disk_usage', 'process_list',
      'docker_containers', 'docker_stats', 'listening_ports', 'network_interfaces',
    ]);
    expect(results.filter((r) => !r.success)).toEqual([]);
    expect(warn.mock.calls.filter(([m]) => String(m).includes('[FakeSSH] Unknown command'))).toEqual([]);
    expect(real.exec).not.toHaveBeenCalled();
    expect(events.at(-1)?.type).toBe('complete');
    warn.mockRestore();
  }, 20_000);
});
