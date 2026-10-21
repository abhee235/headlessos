// EX9.3: shared agent loop
// @see docs/phases/phase-ex9.md §8

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { runAgentLoop, executeToolCall, type LoopEvent } from '../../../src/agent/loop/run-loop.js';
import type { AgentTool, ToolContext } from '../../../src/agent/tools/types.js';
import type { ChatWithToolsResult } from '../../../src/llm/provider.js';
import { ApprovalGate } from '../../../src/agent/actions/approvals.js';
import { ActionRunner } from '../../../src/agent/actions/runner.js';
import { actionTool } from '../../../src/agent/actions/tools.js';
import { planForProvider } from '../../../src/agent/context/plan.js';
import { getDefaultCatalog } from '../../../src/agent/actions/catalog/index.js';

const reply = (content: string | null, calls: Array<{ name: string; args: string }> = []): ChatWithToolsResult => ({
  message: {
    role: 'assistant', content,
    ...(calls.length ? { tool_calls: calls.map((c, i) => ({ id: `c${i}`, type: 'function' as const, function: { name: c.name, arguments: c.args } })) } : {}),
  },
  tokensUsed: { input: 3, output: 2 }, latencyMs: 1, model: 'm', finishReason: calls.length ? 'tool_calls' : 'stop',
});

function echoTool(name = 'echo', tier: AgentTool['securityTier'] = 'local'): AgentTool {
  return {
    name, description: 'echo', securityTier: tier,
    parameters: z.object({ text: z.string() }),
    execute: vi.fn(async (args: unknown) => ({ success: true, output: `said ${(args as { text: string }).text}` })),
  };
}

const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
  serverId: 'srv', ssh: {} as ToolContext['ssh'], templateRegistry: {} as ToolContext['templateRegistry'], previousOutputs: new Map(), ...over,
});

async function collect(gen: AsyncGenerator<LoopEvent>) {
  const out: LoopEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('runAgentLoop', () => {
  it('turn → tool call → result → answer, with typed events', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply('thinking', [{ name: 'echo', args: '{"text":"hi"}' }]))
      .mockResolvedValueOnce(reply('done'));
    const events = await collect(runAgentLoop({ chat, system: 's', user: 'u', tools: [echoTool()], context: ctx(), maxTurns: 5 }));
    // EX10.2 'context' events (occupancy after each call) are covered in tests/agent/context/
    const seen = events.filter((e) => e.type !== 'context');
    expect(seen.map((e) => e.type)).toEqual(['turn', 'assistant_text', 'tool_call', 'tool_result', 'turn', 'assistant_text', 'final']);
    expect(seen[3]).toMatchObject({ type: 'tool_result', name: 'echo', ok: true, output: 'said hi' });
    expect(events.at(-1)).toMatchObject({ type: 'final', text: 'done', reason: 'answered', turns: 2, tokens: 10 });
    // the result went back as a tool message paired with the call
    expect(chat.mock.calls[1]![0].messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c0', content: 'said hi' });
  });

  it('marks repaired arguments', async () => {
    const chat = vi.fn().mockResolvedValueOnce(reply(null, [{ name: 'echo', args: "{text: 'yo',}" }])).mockResolvedValueOnce(reply('ok'));
    const events = await collect(runAgentLoop({ chat, system: 's', user: 'u', tools: [echoTool()], context: ctx(), maxTurns: 3 }));
    expect(events.find((e) => e.type === 'tool_call')).toMatchObject({ input: { text: 'yo' }, repaired: true });
  });

  it('can call extra tools that were not offered', async () => {
    const hidden = echoTool('hidden');
    const chat = vi.fn().mockResolvedValueOnce(reply(null, [{ name: 'hidden', args: '{"text":"x"}' }])).mockResolvedValueOnce(reply('ok'));
    await collect(runAgentLoop({ chat, system: 's', user: 'u', tools: [echoTool()], extraTools: [hidden], context: ctx(), maxTurns: 3 }));
    expect(chat.mock.calls[0]![0].tools.map((t: { function: { name: string } }) => t.function.name)).toEqual(['echo']);
    expect(hidden.execute).toHaveBeenCalled();
  });

  it('stops before the next turn once aborted', async () => {
    let aborted = false;
    const chat = vi.fn().mockImplementation(async () => { aborted = true; return reply(null, [{ name: 'echo', args: '{"text":"a"}' }]); });
    const events = await collect(runAgentLoop({ chat, system: 's', user: 'u', tools: [echoTool()], context: ctx(), maxTurns: 5, isAborted: () => aborted }));
    expect(chat).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: 'final', reason: 'aborted' });
  });

  it('reports a model failure as an error event', async () => {
    const chat = vi.fn().mockRejectedValue(new Error('429 rate limited'));
    const events = await collect(runAgentLoop({ chat, system: 's', user: 'u', tools: [], context: ctx(), maxTurns: 2 }));
    expect(events.at(-1)).toEqual({ type: 'error', message: '429 rate limited', turns: 1, tokens: 0 });
  });

  it('streams approval events while a change action waits, in order', async () => {
    const gate = new ApprovalGate();
    const ssh = { exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, durationMs: 1 }), getSftp: vi.fn() };
    const runner = new ActionRunner({ ssh: ssh as never, approvals: gate, describeServer: () => ({ name: 'n', host: 'h', username: 'u' }) });
    const restart = actionTool(getDefaultCatalog().get('service_restart')!);
    const chat = vi.fn()
      .mockResolvedValueOnce(reply(null, [{ name: 'service_restart', args: '{"unit":"nginx","reason":"down since 9"}' }]))
      .mockResolvedValueOnce(reply('restarted'));
    const events: LoopEvent[] = [];
    for await (const e of runAgentLoop({ chat, system: 's', user: 'u', tools: [restart], context: ctx({ actions: runner, allowChange: true, runId: 'r1' }), maxTurns: 3 })) {
      events.push(e);
      if (e.type === 'approval_required') queueMicrotask(() => gate.resolve(e.request.approvalId, 'allow'));
    }
    expect(events.filter((e) => e.type !== 'context').map((e) => e.type)).toEqual(['turn', 'tool_call', 'approval_required', 'approval_resolved', 'tool_result', 'turn', 'assistant_text', 'final']);
    expect(ssh.exec).toHaveBeenCalledWith('srv', 'sudo -n systemctl restart -- nginx', 60_000, expect.anything());
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ ok: true, metadata: { approval: { decision: 'allow' } } });
  });
});

describe('executeToolCall', () => {
  it('names the closest tools for an unknown one', async () => {
    const tools = new Map([['disk_usage', echoTool('disk_usage')], ['dir_size', echoTool('dir_size')]]);
    const out = await executeToolCall('disk_usag', '{}', tools, ctx());
    expect(out).toMatchObject({ ok: false, output: 'No such tool: disk_usag. Closest: disk_usage, dir_size' });
  });

  it('matches a tool name case-insensitively', async () => {
    const tools = new Map([['echo', echoTool()]]);
    expect(await executeToolCall('ECHO', '{"text":"x"}', tools, ctx())).toMatchObject({ ok: true, output: 'said x' });
  });

  it('applies guardrails (a write-tier tool is blocked)', async () => {
    const write = echoTool('exec_write_command', 'write');
    const out = await executeToolCall('exec_write_command', '{"command":"systemctl restart nginx"}', new Map([['exec_write_command', write]]), ctx());
    expect(out.ok).toBe(false);
    expect(out.output).toMatch(/^Blocked by guardrails/);
    expect(write.execute).not.toHaveBeenCalled();
  });

  it('turns a thrown tool error into output', async () => {
    const boom: AgentTool = { ...echoTool(), execute: vi.fn().mockRejectedValue(new Error('kaput')) };
    expect(await executeToolCall('echo', '{"text":"x"}', new Map([['echo', boom]]), ctx())).toMatchObject({ ok: false, output: 'echo failed: kaput' });
  });
});

describe('action budget (EX10.3: from the plan)', () => {
  it('gives hosted models 40 and local ones about 10% of their window', () => {
    const budget = (p: Parameters<typeof planForProvider>[0]) => planForProvider(p).actionBudget;
    expect(budget({ name: 'openai' })).toBe(40);
    expect(budget(null)).toBe(40);
    expect(budget({ name: 'ollama', contextWindow: 4096 })).toBe(8);
    expect(budget({ name: 'ollama', contextWindow: 16384 })).toBe(13);
    expect(budget({ name: 'ollama', contextWindow: 128000 })).toBe(40);
  });
});
