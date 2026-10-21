// EX9.4: loop guard, context trimming, output caps
// @see docs/phases/phase-ex9.md §9

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { LoopGuard, SAME_RESULT_LIMIT } from '../../../src/agent/loop/loop-guard.js';
import { estimateTokens, historyBudget, trimHistory } from '../../../src/agent/loop/context.js';
import { runAgentLoop, type LoopEvent } from '../../../src/agent/loop/run-loop.js';
import { ConnectionManager } from '../../../src/ssh/connection-manager.js';
import { ActionRunner, channelCap } from '../../../src/agent/actions/runner.js';
import { formatForModel, modelOutputChars, MODEL_OUTPUT_CHARS } from '../../../src/agent/actions/tools.js';
import { getDefaultCatalog } from '../../../src/agent/actions/catalog/index.js';
import type { ChatMessage, ChatWithToolsResult } from '../../../src/llm/provider.js';
import type { AgentTool, ToolContext } from '../../../src/agent/tools/types.js';
import type { ActionRunResult } from '../../../src/agent/actions/types.js';

const call = (name: string, input: unknown, output = 'same', ok = true, mutating = false) => ({ name, input, output, ok, mutating });

describe('LoopGuard', () => {
  it('warns once when the same call keeps returning the same result, then blocks the back-to-back repeat', () => {
    const g = new LoopGuard();
    expect(g.fold([call('uptime', {})])).toEqual([]);
    expect(g.fold([call('uptime', {})])).toEqual([]);
    const third = g.fold([call('uptime', {})]);
    expect(third).toMatchObject([{ kind: 'warn', rule: 'unchanged', tool: 'uptime', times: SAME_RESULT_LIMIT }]);
    expect(third[0]!.message).toContain('will not tell you anything new');
    expect(g.blocked('uptime', {})).toBe(true);
    expect(g.blocked('uptime', { other: 1 })).toBe(false);
    expect(g.refused('uptime', {})).toMatchObject({ kind: 'warn', rule: 'refused' });
    expect(g.refused('uptime', {})).toMatchObject({ kind: 'stop', rule: 'refused' });
  });

  it('does not count a call whose result changes', () => {
    const g = new LoopGuard();
    for (let i = 0; i < 5; i++) expect(g.fold([call('load_average', {}, `0.${i}`)]).filter((f) => f.rule === 'unchanged')).toEqual([]);
  });

  it('nudges once after four identical calls in a row, never stopping for it', () => {
    const g = new LoopGuard();
    const findings = [0, 1, 2, 3].flatMap((i) => g.fold([call('docker_stats', {}, `cpu ${i}`)]));
    expect(findings).toMatchObject([{ kind: 'warn', rule: 'running', times: 4 }]);
  });

  it('forgets the history after a change action', () => {
    const g = new LoopGuard();
    g.fold([call('service_status', { unit: 'nginx' })]);
    g.fold([call('service_status', { unit: 'nginx' })]);
    g.fold([call('service_restart', { unit: 'nginx', reason: 'x' }, 'ok', true, true)]);
    expect(g.fold([call('service_status', { unit: 'nginx' })])).toEqual([]);
  });

  it('stops when the same call returns the same result six times despite the warning', () => {
    const g = new LoopGuard();
    const findings = [];
    for (let i = 0; i < 6; i++) findings.push(...g.fold([call('uptime', {}), call(`other_${i}`, {})]));
    expect(findings.map((f) => f.kind)).toEqual(['warn', 'stop']);
  });

  it('notices the same opening sentence repeated', () => {
    const g = new LoopGuard();
    const text = 'Let me check the disk usage on this server to see what is going on.';
    expect(g.foldNarration(text)).toBeNull();
    expect(g.foldNarration(text)).toBeNull();
    expect(g.foldNarration(text)).toMatchObject({ kind: 'warn', rule: 'narration' });
    g.foldNarration(text); g.foldNarration(text);
    expect(g.foldNarration(text)).toMatchObject({ kind: 'stop' });
    expect(g.foldNarration('ok')).toBeNull(); // too short to judge
  });
});

describe('context trimming', () => {
  const big = 'x'.repeat(4000);
  const history = (): ChatMessage[] => {
    const m: ChatMessage[] = [{ role: 'system', content: 's' }, { role: 'user', content: 'question' }];
    for (let i = 0; i < 6; i++) {
      m.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: `act_${i}`, arguments: '{}' } }] });
      m.push({ role: 'tool', tool_call_id: `c${i}`, content: big });
    }
    return m;
  };

  it('leaves a history that fits alone', () => {
    const m = history();
    expect(trimHistory(m, 100_000)).toBe(m);
  });

  it('stubs older tool results first, keeping the latest four whole', () => {
    const m = history();
    const out = trimHistory(m, 4_600);
    const tools = out.filter((x) => x.role === 'tool').map((x) => x.content!);
    expect(tools.slice(0, 2)).toEqual([
      '[output trimmed — act_0, 4000 chars; run it again if you need it]',
      '[output trimmed — act_1, 4000 chars; run it again if you need it]',
    ]);
    expect(tools.slice(2).every((t) => t === big)).toBe(true);
    expect(estimateTokens(out)).toBeLessThanOrEqual(4_600);
  });

  it('then drops the oldest call/result pairs, never the question, never orphaning a result', () => {
    const out = trimHistory(history(), 1_200);
    expect(out[0]).toEqual({ role: 'system', content: 's' });
    expect(out[1]).toEqual({ role: 'user', content: 'question' });
    expect(out[2]!.content).toContain('Earlier steps were removed');
    const callIds = new Set(out.flatMap((x) => x.tool_calls?.map((t) => t.id) ?? []));
    for (const t of out.filter((x) => x.role === 'tool')) expect(callIds.has(t.tool_call_id!)).toBe(true);
    expect(out.filter((x) => x.role === 'assistant').length).toBeGreaterThan(0); // the latest turn stays
    // trimming again does not stack notes
    expect(trimHistory(out, 1_200).filter((x) => x.content?.includes('Earlier steps were removed'))).toHaveLength(1);
  });

  it('budgets the window less a reply reserve and the tool list', () => {
    expect(historyBudget(8192, 1000)).toBe(8192 - 2048 - 1000);
    expect(historyBudget(undefined, 0)).toBe(128_000 - 4096);
  });
});

describe('loop guard inside runAgentLoop', () => {
  const echo: AgentTool = {
    name: 'uptime', description: 'u', securityTier: 'local', parameters: z.object({}),
    execute: vi.fn(async () => ({ success: true, output: 'up 3 days' })),
  };
  const ctx = { serverId: 's', ssh: {}, templateRegistry: {}, previousOutputs: new Map() } as unknown as ToolContext;
  const reply = (calls: number, text: string | null = null): ChatWithToolsResult => ({
    message: { role: 'assistant', content: text, ...(calls ? { tool_calls: Array.from({ length: calls }, (_, i) => ({ id: `c${Math.random()}${i}`, type: 'function' as const, function: { name: 'uptime', arguments: '{}' } })) } : {}) },
    tokensUsed: { input: 1, output: 1 }, latencyMs: 1, model: 'm', finishReason: calls ? 'tool_calls' : 'stop',
  });

  it('warns, refuses the repeat, then stops and asks for a conclusion with tools off', async () => {
    const chat = vi.fn(async (input: { tool_choice?: string }) => (input.tool_choice === 'none' ? reply(0, 'I kept getting the same uptime.') : reply(1)));
    const events: LoopEvent[] = [];
    for await (const e of runAgentLoop({ chat, system: 's', user: 'u', tools: [echo], context: ctx, maxTurns: 10 })) events.push(e);
    expect(echo.execute).toHaveBeenCalledTimes(3); // the fourth and fifth identical calls are refused
    expect(events.filter((e) => e.type === 'loop_warning').map((e) => (e as { rule: string; kind: string }).rule + ':' + (e as { kind: string }).kind))
      .toEqual(['unchanged:warn', 'refused:warn', 'refused:stop']);
    expect(events.at(-1)).toMatchObject({ type: 'final', reason: 'stuck', text: 'I kept getting the same uptime.' });
    const last = chat.mock.calls.at(-1)![0] as { tool_choice: string; messages: ChatMessage[] };
    expect(last.tool_choice).toBe('none');
    expect(last.messages.at(-1)!.content).toContain('You are stuck');
  });

  it('tells the model when three turns are left', async () => {
    const chat = vi.fn()
      .mockImplementation(async () => reply(0, null))
      .mockResolvedValueOnce(reply(0, null))
      .mockResolvedValueOnce(reply(0, null));
    await (async () => { for await (const _ of runAgentLoop({ chat, system: 's', user: 'u', tools: [echo], context: ctx, maxTurns: 6 })) { /* drain */ } })();
    const fourth = chat.mock.calls[3]![0] as { messages: ChatMessage[] };
    expect(fourth.messages.some((m) => m.content === '3 turns left. Start wrapping up: gather only what you still need, then answer.')).toBe(true);
  });
});

describe('output caps', () => {
  function cappedClient(chunks: string[]) {
    const stream = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), close: vi.fn() });
    stream.close.mockImplementation(() => setImmediate(() => stream.emit('close', 0)));
    const client = {
      exec: vi.fn((_cmd: string, cb: (e: undefined, s: typeof stream) => void) => {
        cb(undefined, stream);
        setImmediate(() => {
          for (const c of chunks) stream.emit('data', Buffer.from(c));
          if (!stream.close.mock.calls.length) stream.emit('close', 0);
        });
      }),
    };
    const cm = new ConnectionManager('ssh');
    (cm as unknown as { connections: Map<string, unknown> }).connections.set('s1', { client, state: { serverId: 's1', status: 'connected' } });
    return { cm, stream };
  }

  it('closes the channel once output passes maxBytes and flags it truncated', async () => {
    const { cm, stream } = cappedClient(['aaaa', 'bbbb', 'cccc']);
    const res = await cm.exec('s1', 'cat big', 5_000, { maxBytes: 6 });
    expect(res).toMatchObject({ stdout: 'aaaabb', truncated: true });
    expect(stream.close).toHaveBeenCalledOnce();
  });

  it('is unlimited without maxBytes', async () => {
    const { cm } = cappedClient(['aaaa', 'bbbb']);
    expect(await cm.exec('s1', 'cat', 5_000)).toMatchObject({ stdout: 'aaaabbbb' });
  });

  it('gives logs more channel room than other actions', () => {
    const catalog = getDefaultCatalog();
    expect(channelCap(catalog.get('disk_usage')!)).toBe(256 * 1024);
    expect(channelCap(catalog.get('kernel_messages')!)).toBe(4 * 1024 * 1024);
  });

  it('does not parse a cut-off output', async () => {
    const ssh = { exec: vi.fn().mockResolvedValue({ stdout: '{"Names":"web"', stderr: '', exitCode: 0, durationMs: 1, truncated: true }), getSftp: vi.fn() };
    const r = await new ActionRunner({ ssh: ssh as never }).run('s', 'docker_containers', {});
    expect(r).toMatchObject({ ok: true, truncated: true });
    expect(r.data).toBeUndefined();
  });

  it('sizes what the model sees to the model', () => {
    expect(modelOutputChars({ name: 'openai' })).toBe(MODEL_OUTPUT_CHARS);
    expect(modelOutputChars({ name: 'ollama', contextWindow: 8192 })).toBe(4915);
    expect(modelOutputChars({ name: 'ollama', contextWindow: 2048 })).toBe(1500);
  });

  it('keeps 60% head and 40% tail of a long result, marking the cut', () => {
    const body = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n');
    const r: ActionRunResult = { ok: true, actionId: 'x', command: 'x', exitCode: 0, stdout: body, stderr: '', truncated: false, durationMs: 1 };
    const text = formatForModel(r, 'head', 1000);
    expect(text.startsWith('line 0')).toBe(true);
    expect(text).toContain('chars cut …]');
    expect(text).toContain('line 1999');
    const [head] = text.split('\n[…');
    expect(head!.length).toBe(600);
  });
});
