// EX10.2 / EX10.11 follow-ups: the recency shield protects results, not turns; a result read
// again after compaction trimmed it is not a repeat
// @see docs/phases/phase-ex10.md §8d

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ContextManager, KEEP_RECENT_RESULTS, MIN_REPLY_CAP, SUMMARY_SYSTEM } from '../../../src/agent/context/manager.js';
import { groupStart, protectedFrom } from '../../../src/agent/context/layers.js';
import { planContext, type ContextPlan } from '../../../src/agent/context/plan.js';
import { estimateTokens } from '../../../src/agent/context/tokens.js';
import { LoopGuard } from '../../../src/agent/loop/loop-guard.js';
import { runAgentLoop, type LoopEvent } from '../../../src/agent/loop/run-loop.js';
import { ReactiveExecutor, type AgentEvent } from '../../../src/agent/executor.js';
import { ToolRegistry } from '../../../src/agent/tools/tool-registry.js';
import { generateSchemaTool } from '../../../src/agent/tools/generate-schema.js';
import type { ChatMessage, ChatWithToolsResult } from '../../../src/llm/provider.js';
import type { AgentTool, ToolContext } from '../../../src/agent/tools/types.js';
import type { PlannerHints } from '../../../src/agent/planner.js';

const head = (): ChatMessage[] => [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'show my logs' }];
/** `turns` turns, each calling `perTurn` tools whose results are `chars` long */
function history(turns: number, perTurn: number, chars: number): ChatMessage[] {
  const m = head();
  for (let t = 0; t < turns; t++) {
    const calls = Array.from({ length: perTurn }, (_, i) => ({ id: `c${t}_${i}`, type: 'function' as const, function: { name: 'file_tail', arguments: JSON.stringify({ path: `/var/log/f${t}_${i}` }) } }));
    m.push({ role: 'assistant', content: null, tool_calls: calls });
    for (const c of calls) m.push({ role: 'tool', tool_call_id: c.id, content: `${c.id} ${'x'.repeat(chars)}` });
  }
  return m;
}
const results = (m: ChatMessage[]) => m.filter((x) => x.role === 'tool').map((x) => x.content!);
const trimmed = (c: string) => c.startsWith('[output trimmed');
function wellFormed(m: ChatMessage[]): boolean {
  const seen = new Set<string>();
  for (const x of m) {
    for (const tc of x.tool_calls ?? []) seen.add(tc.id);
    if (x.role === 'tool' && !seen.has(x.tool_call_id!)) return false;
  }
  return true;
}

describe('the protected tail (EX10.2 follow-up)', () => {
  it('is the last keepRecent tokens or the last five results, whichever reaches further back', () => {
    const m = history(3, 4, 4_000); // results of about 1,000 tokens
    const firstResult = (i: number) => m.findIndex((x) => x.role === 'tool' && x.tool_call_id === `c${Math.floor(i / 4)}_${i % 4}`);
    // tokens cover 2 results; the count shield reaches back five
    expect(protectedFrom(m, 2, KEEP_RECENT_RESULTS, 2_100, estimateTokens)).toBe(firstResult(12 - 5));
    // tokens reach further than five results
    expect(protectedFrom(m, 2, KEEP_RECENT_RESULTS, 9_000, estimateTokens)).toBeLessThan(firstResult(12 - 5));
    // never fewer than one result
    expect(protectedFrom(m, 2, 0, 0, estimateTokens)).toBe(m.length - 1);
  });

  it('cuts for summarizing and dropping start at the turn that holds the tail', () => {
    const m = history(2, 3, 100);
    const lastTurn = m.findIndex((x) => x.tool_calls?.[0]?.id === 'c1_0');
    expect(groupStart(m, 2, lastTurn + 2)).toBe(lastTurn);
    expect(groupStart(m, 2, lastTurn)).toBe(lastTurn);
  });

  it('the 07:16 run: four turns of six 8,000-character log reads compact deeply, without survival', async () => {
    const plan = planContext({ contextWindow: 65_536, maxOutputTokens: 8_192, local: true });
    const m = history(4, 6, 8_000);
    expect(estimateTokens(m)).toBeGreaterThan(plan.trigger); // about 48K, over the 45.9K trigger
    const out = await new ContextManager({ plan }).prepare(m);
    expect(out.events.map((e) => e.layer)).toEqual(['mask']);
    expect(out.used).toBeLessThanOrEqual(plan.stopAt);
    const kept = results(out.messages);
    expect(kept.slice(-KEEP_RECENT_RESULTS).every((c) => !trimmed(c))).toBe(true); // the latest five, at least
    expect(kept.slice(0, 12).every(trimmed)).toBe(true); // the older turns' reads
    expect(out.messages.filter((x) => x.role === 'assistant')).toHaveLength(4); // nothing dropped
    expect(wellFormed(out.messages)).toBe(true);
  });

  it('drops whole turns only, before the protected tail', async () => {
    const plan: ContextPlan = { ...planContext({ contextWindow: 8_192, maxOutputTokens: 2_048, local: true }), trigger: 500, stopAt: 400, hard: 1e9, keepRecent: 0 };
    const out = await new ContextManager({ plan }).prepare(history(5, 3, 600));
    expect(out.events.map((e) => e.layer)).toContain('drop');
    expect(wellFormed(out.messages)).toBe(true);
    expect(results(out.messages).filter((c) => !trimmed(c)).length).toBeGreaterThanOrEqual(KEEP_RECENT_RESULTS);
  });
});

describe('a result read again after compaction is not a repeat (EX10.11 follow-up)', () => {
  it('LoopGuard.reset forgets every count', () => {
    const g = new LoopGuard();
    for (let i = 0; i < 3; i++) g.fold([{ name: 'uptime', input: {}, ok: true, output: 'same' }]);
    expect(g.blocked('uptime', {})).toBe(true);
    g.reset();
    expect(g.blocked('uptime', {})).toBe(false);
    expect(g.fold([{ name: 'uptime', input: {}, ok: true, output: 'same' }])).toEqual([]);
  });

  /** Each turn: the same big read, plus five fillers that push it out of the protected tail */
  const tool = (name: string, output: (args: unknown) => string, tier: AgentTool['securityTier'] = 'local'): AgentTool => ({
    name, description: name, securityTier: tier, parameters: z.object({ i: z.number().optional() }),
    execute: vi.fn(async (args: unknown) => ({ success: true, output: output(args), metadata: { command: name } })),
  });
  let n = 0;
  const turn = (): ChatWithToolsResult => ({
    message: {
      role: 'assistant', content: null,
      tool_calls: [{ name: 'syslog', args: {} }, ...Array.from({ length: 5 }, (_, i) => ({ name: 'pad', args: { i: ++n } }))]
        .map((c) => ({ id: `c${++n}`, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })),
    },
    tokensUsed: { input: 0, output: 1 }, latencyMs: 1, model: 'm', finishReason: 'tool_calls',
  });
  const compactEveryTurn: ContextPlan = { ...planContext({ contextWindow: 8_192, maxOutputTokens: 2_048, local: true }), trigger: 1, stopAt: 1, hard: 1e9, keepRecent: 0 };
  const loopWarnings = (events: LoopEvent[]) => events.filter((e) => e.type === 'loop_warning');

  it('the shared loop does not warn about a read whose result compaction trimmed', async () => {
    const syslog = tool('syslog', () => 'line '.repeat(800));
    const pad = tool('pad', (a) => `pad ${JSON.stringify(a)} ${'p'.repeat(3_000)}`);
    const chat = vi.fn(async () => turn());
    const run = async (plan: ContextPlan) => {
      const events: LoopEvent[] = [];
      for await (const e of runAgentLoop({ chat, system: 's', user: 'u', tools: [syslog, pad], context: { serverId: 's', previousOutputs: new Map() } as unknown as ToolContext, maxTurns: 4, plan })) events.push(e);
      return events;
    };
    expect(loopWarnings(await run(compactEveryTurn))).toEqual([]);
    // without compaction, the third identical read is warned about
    const quiet = await run({ ...compactEveryTurn, trigger: 1e9, stopAt: 1e9 });
    expect(loopWarnings(quiet).map((e) => (e as { rule: string }).rule)).toContain('unchanged');
  });

  it('nor does the UI Agent executor', async () => {
    const syslog = tool('syslog', () => 'line '.repeat(800), 'action');
    const pad = tool('pad', (a) => `pad ${JSON.stringify(a)} ${'p'.repeat(3_000)}`, 'action');
    const view = { title: 'Logs', sidebarItems: [{ id: 'l', label: 'Logs' }], sections: { l: { layout: 'stack', children: [{ type: 'stat-card', title: 'Lines', value: '800' }] } } };
    const finish: ChatWithToolsResult = { message: { role: 'assistant', content: null, tool_calls: [{ id: 'g', type: 'function', function: { name: 'generate_schema', arguments: JSON.stringify({ schema: view }) } }] }, tokensUsed: { input: 0, output: 1 }, latencyMs: 1, model: 'm', finishReason: 'tool_calls' };
    const queue = [turn(), turn(), turn(), turn(), finish];
    // a compaction summary request (EX10.2) gets a summary, not the next scripted step
    const chat = vi.fn(async (input: { messages: ChatMessage[] }) => (input.messages[0]?.content === SUMMARY_SYSTEM
      ? { message: { role: 'assistant' as const, content: 'Found so far: syslog lines.' }, tokensUsed: { input: 0, output: 1 }, latencyMs: 1, model: 'm', finishReason: 'stop' as const }
      : queue.shift()!));
    const registry = new ToolRegistry();
    for (const t of [syslog, pad, generateSchemaTool]) registry.register(t);
    const hints = { intent: 'logs', interactivityLevel: 'display-only', expectedWidgets: [], templateHint: null, dataSourceHints: [], suggestedLayout: 'stack', suggestedSections: [], securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false }, estimatedComplexity: 'simple', skipPostReflection: true } as unknown as PlannerHints;
    const executor = new ReactiveExecutor({ chat, toolProvider: null } as never, registry);
    const events: AgentEvent[] = [];
    for await (const e of executor.execute(hints, { serverId: 's', previousOutputs: new Map(), plan: compactEveryTurn } as unknown as ToolContext)) events.push(e);
    expect(syslog.execute).toHaveBeenCalledTimes(4); // never refused
    expect(events.filter((e) => e.type === 'safety_warning')).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete' });
  });
});

// EX10.4 follow-up (§8d item 10): two 8,192-token cut-offs cost 132 s and 162 s at 08:28
describe('a cut-off reply shrinks the next reply cap', () => {
  const plan64 = planContext({ contextWindow: 65_536, maxOutputTokens: 8_192, local: true });

  it('halves per strike, never below 2,048, and comes back after a good reply', () => {
    const ctx = new ContextManager({ plan: plan64 });
    expect(ctx.replyCap()).toBeUndefined();
    ctx.lengthStrike();
    expect(ctx.replyCap()).toBe(4_096);
    ctx.lengthStrike();
    expect(ctx.replyCap()).toBe(MIN_REPLY_CAP);
    ctx.lengthStrike();
    expect(ctx.replyCap()).toBe(MIN_REPLY_CAP);
    ctx.resetLength();
    expect(ctx.replyCap()).toBeUndefined();
    const small = new ContextManager({ plan: planContext({ contextWindow: 8_192, maxOutputTokens: 1_024, local: true }) });
    small.lengthStrike();
    expect(small.replyCap()).toBe(1_024); // never above the plan's own cap
  });

  const cutOff: ChatWithToolsResult = { message: { role: 'assistant', content: 'Now let me fill the section with actual log data.' }, tokensUsed: { input: 0, output: 8_192 }, latencyMs: 1, model: 'm', finishReason: 'length' };
  const answer = (text: string): ChatWithToolsResult => ({ message: { role: 'assistant', content: text }, tokensUsed: { input: 0, output: 5 }, latencyMs: 1, model: 'm', finishReason: 'stop' });

  it('the shared loop sends the smaller cap after a cut-off', async () => {
    const chat = vi.fn().mockResolvedValueOnce(cutOff).mockResolvedValueOnce(cutOff).mockResolvedValueOnce(answer('Up 3 days.'));
    for await (const _ of runAgentLoop({ chat, system: 's', user: 'u', tools: [], context: { serverId: 's', previousOutputs: new Map() } as unknown as ToolContext, maxTurns: 6, plan: plan64 })) { /* drain */ }
    expect(chat.mock.calls.map(([i]) => (i as { maxTokens?: number }).maxTokens)).toEqual([undefined, 4_096, 2_048]);
  });

  it('so does the UI Agent executor, and a good reply restores the plan cap', async () => {
    const view = { title: 'Logs', sidebarItems: [{ id: 'l', label: 'Logs' }], sections: { l: { layout: 'stack', children: [{ type: 'stat-card', title: 'Lines', value: '3' }] } } };
    const step = (name: string, args: unknown): ChatWithToolsResult => ({ message: { role: 'assistant', content: null, tool_calls: [{ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, tokensUsed: { input: 0, output: 1 }, latencyMs: 1, model: 'm', finishReason: 'tool_calls' });
    const chat = vi.fn()
      .mockResolvedValueOnce(cutOff)
      .mockResolvedValueOnce(step('load_average', {}))
      .mockResolvedValueOnce(step('generate_schema', { schema: view }));
    const registry = new ToolRegistry();
    const load: AgentTool = { name: 'load_average', description: 'l', securityTier: 'action', parameters: z.object({}), execute: vi.fn(async () => ({ success: true, output: '0.1', metadata: { command: 'cat /proc/loadavg' } })) };
    for (const t of [load, generateSchemaTool]) registry.register(t);
    const hints = { intent: 'logs', interactivityLevel: 'display-only', expectedWidgets: [], templateHint: null, dataSourceHints: [], suggestedLayout: 'stack', suggestedSections: [], securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false }, estimatedComplexity: 'simple', skipPostReflection: true } as unknown as PlannerHints;
    const executor = new ReactiveExecutor({ chat, toolProvider: null } as never, registry);
    const events: AgentEvent[] = [];
    for await (const e of executor.execute(hints, { serverId: 's', previousOutputs: new Map(), plan: plan64 } as unknown as ToolContext)) events.push(e);
    expect(chat.mock.calls.map(([i]) => (i as { maxTokens?: number }).maxTokens)).toEqual([undefined, 4_096, undefined]);
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete' });
  });
});
