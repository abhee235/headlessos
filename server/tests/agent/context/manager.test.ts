// EX10.2: Context manager — layered compaction, calibration, cut-offs, overflow
// @see docs/phases/phase-ex10.md §3

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ContextManager, chatSummarizer, MAX_LENGTH_STRIKES } from '../../../src/agent/context/manager.js';
import { REMOVED_NOTE, SUMMARY_PREFIX, collapseViews, transcriptOf } from '../../../src/agent/context/layers.js';
import { planContext, type ContextPlan } from '../../../src/agent/context/plan.js';
import { estimateTokens } from '../../../src/agent/context/tokens.js';
import { CUT_OFF, runAgentLoop, type LoopEvent } from '../../../src/agent/loop/run-loop.js';
import type { ChatMessage, ChatWithToolsResult } from '../../../src/llm/provider.js';
import type { AgentTool, ToolContext } from '../../../src/agent/tools/types.js';

/** A plan with explicit thresholds, so tests read in tokens */
const plan = (over: Partial<ContextPlan> = {}): ContextPlan => ({
  ...planContext({ contextWindow: 8_192, maxOutputTokens: 2_048, local: true }),
  ...over,
});

const big = (n: number) => 'x'.repeat(n);
function history(calls: number, resultChars = 4_000, name = (i: number) => `act_${i}`): ChatMessage[] {
  const m: ChatMessage[] = [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'the question' }];
  for (let i = 0; i < calls; i++) {
    m.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: name(i), arguments: '{}' } }] });
    m.push({ role: 'tool', tool_call_id: `c${i}`, content: big(resultChars) });
  }
  return m;
}
/** every tool result still has its call, in order */
function wellFormed(m: ChatMessage[]): boolean {
  const seen = new Set<string>();
  for (const x of m) {
    for (const tc of x.tool_calls ?? []) seen.add(tc.id);
    if (x.role === 'tool' && !seen.has(x.tool_call_id!)) return false;
  }
  return true;
}

describe('ContextManager.prepare', () => {
  it('leaves a history under the trigger alone', async () => {
    const m = history(2, 400);
    const out = await new ContextManager({ plan: plan() }).prepare(m);
    expect(out.messages).toBe(m);
    expect(out.events).toEqual([]);
  });

  it('collapses superseded views first, keeping the latest', async () => {
    const view = (n: number) => JSON.stringify({ view: JSON.stringify({ title: `v${n}`, pad: big(6_000) }) });
    const m: ChatMessage[] = [{ role: 'system', content: 's' }, { role: 'user', content: 'q' }];
    for (let i = 0; i < 3; i++) {
      m.push({ role: 'assistant', content: null, tool_calls: [{ id: `v${i}`, type: 'function', function: { name: 'update_view', arguments: view(i) } }] });
      m.push({ role: 'tool', tool_call_id: `v${i}`, content: 'View updated.' });
    }
    const out = await new ContextManager({ plan: plan({ trigger: 3_000, stopAt: 2_000 }) }).prepare(m);
    expect(out.events.map((e) => e.layer)).toEqual(['collapse']);
    const args = out.messages.flatMap((x) => x.tool_calls ?? []).map((tc) => tc.function.arguments);
    expect(args.slice(0, 2)).toEqual(Array(2).fill('{"view":"[replaced by a later update_view]"}'));
    expect(args[2]).toBe(view(2));
    expect(collapseViews(out.messages)).toBe(out.messages); // nothing left to collapse
  });

  // EX10.2 follow-up: the shield is the last five results (and the last keepRecent tokens), not four turns
  it('stubs long old results, then all old results, keeping the latest five results whole', async () => {
    const m = history(8, 3_000);
    const out = await new ContextManager({ plan: plan() }).prepare(m);
    expect(out.used).toBeLessThanOrEqual(plan().stopAt);
    const results = out.messages.filter((x) => x.role === 'tool').map((x) => x.content!);
    expect(results.slice(0, 3).every((c) => c.startsWith('[output trimmed — act_'))).toBe(true);
    expect(results.slice(3).every((c) => c === big(3_000))).toBe(true);
    expect(out.messages.slice(0, 2)).toEqual(m.slice(0, 2));
    expect(wellFormed(out.messages)).toBe(true);
  });

  it('summarizes the older region when stubs are not enough, keeping the request verbatim', async () => {
    const m = history(12, 1_500).map((x) => (x.role === 'assistant' ? { ...x, content: big(400) } : x));
    const summarize = vi.fn(async (t: string) => `Found so far: ${t.length} chars of notes`);
    const p = plan({ trigger: 2_000, stopAt: 1_800, hard: 7_000, keepRecent: 0 });
    const out = await new ContextManager({ plan: p, summarize }).prepare(m);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(out.events.map((e) => e.layer)).toContain('summarize');
    expect(out.messages[1]).toEqual({ role: 'user', content: 'the question' });
    expect(out.messages[2]!.content!.startsWith(SUMMARY_PREFIX)).toBe(true);
    expect(wellFormed(out.messages)).toBe(true);
  });

  it('drops the oldest steps with one note when the summarizer fails, and stops asking after three failures', async () => {
    const summarize = vi.fn(async () => { throw new Error('model down'); });
    const p = plan({ trigger: 1_500, stopAt: 1_200, hard: 7_000, keepRecent: 0 });
    const mgr = new ContextManager({ plan: p, summarize });
    for (let i = 0; i < 4; i++) {
      const out = await mgr.prepare(history(10, 2_000).map((x) => (x.role === 'assistant' ? { ...x, content: big(600) } : x)));
      expect(out.messages.filter((x) => x.content === REMOVED_NOTE)).toHaveLength(1);
      expect(wellFormed(out.messages)).toBe(true);
      expect(out.messages[1]!.content).toBe('the question');
    }
    expect(summarize).toHaveBeenCalledTimes(3);
    // a forced compaction asks again even with the breaker open
    await mgr.prepare(history(10, 2_000).map((x) => (x.role === 'assistant' ? { ...x, content: big(600) } : x)), 0, { force: true });
    expect(summarize).toHaveBeenCalledTimes(4);
  });

  it('in survival keeps only the latest call whole', async () => {
    const m = history(6, 200).map((x) => (x.role === 'assistant' ? { ...x, content: big(3_000) } : x));
    const p = plan({ trigger: 1_000, stopAt: 900, hard: 1_100, keepRecent: 0 });
    const out = await new ContextManager({ plan: p }).prepare(m);
    expect(out.events.map((e) => e.layer)).toContain('survival');
    expect(out.messages.filter((x) => x.role === 'assistant')).toHaveLength(1);
    expect(wellFormed(out.messages)).toBe(true);
  });

  it('shrinks on a forced compaction even when the estimate is under the stop point', async () => {
    // forced = the provider refused the prompt as too long, so the estimate was low
    const m = history(6, 2_000);
    const mgr = new ContextManager({ plan: planContext({ contextWindow: 128_000, maxOutputTokens: 16_000, local: false }) });
    expect(mgr.used(m)).toBeLessThan(mgr.plan.stopAt);
    const out = await mgr.prepare(m, 0, { force: true });
    expect(out.events[0]).toMatchObject({ forced: true });
    expect(out.used).toBeLessThanOrEqual(Math.floor(mgr.used(m) * 0.6));
  });

  it('never returns a bigger history', async () => {
    const m = history(5, 100);
    const out = await new ContextManager({ plan: plan({ trigger: 1, stopAt: 1 }) }).prepare(m, 0, { force: true });
    expect(estimateTokens(out.messages)).toBeLessThanOrEqual(estimateTokens(m));
  });
});

describe('ContextManager calibration and limits', () => {
  it('adds the provider-measured overhead to every estimate', () => {
    const mgr = new ContextManager({ plan: plan() });
    const m = history(1, 400);
    const est = estimateTokens(m);
    expect(mgr.used(m, 100)).toBe(est + 100);
    mgr.observe(est + 900, m);
    expect(mgr.used(m, 100)).toBe(est + 900);
    mgr.observe(est + 100, m);
    expect(mgr.used(m, 100)).toBe(est + 500); // half the old, half the new
    mgr.observe(0, m); // no count from the provider: no change
    expect(mgr.used(m, 100)).toBe(est + 500);
  });

  it('tells overflow errors from rate limits', () => {
    for (const msg of ['This model’s maximum context length is 8192 tokens', 'Ollama answered 400: input is too long', 'prompt exceeds the context window', 'num_ctx too small']) {
      expect(ContextManager.isOverflowError(new Error(msg)), msg).toBe(true);
    }
    for (const msg of ['Rate limit exceeded', '429 Too Many Requests: quota exceeded', 'fetch failed']) {
      expect(ContextManager.isOverflowError(new Error(msg)), msg).toBe(false);
    }
  });

  it('allows three cut-off reminders in a row', () => {
    const mgr = new ContextManager({ plan: plan() });
    const strikes = Array.from({ length: MAX_LENGTH_STRIKES + 1 }, () => mgr.lengthStrike());
    expect(strikes).toEqual([true, true, true, false]);
    mgr.resetLength();
    expect(mgr.lengthStrike()).toBe(true);
  });

  it('chatSummarizer asks the model with the summary prompt and a short reply cap', async () => {
    const chat = vi.fn(async () => ({ message: { role: 'assistant' as const, content: ' summary ' }, tokensUsed: { input: 1, output: 1 }, latencyMs: 1, model: 'm', finishReason: 'stop' as const }));
    expect(await chatSummarizer(chat, 512)('transcript')).toBe('summary');
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 512, messages: [expect.objectContaining({ role: 'system' }), { role: 'user', content: 'transcript' }] }));
  });

  it('transcriptOf keeps the head and tail of a long older region', () => {
    const t = transcriptOf(history(30, 2_000), 9_000);
    expect(t.length).toBeLessThan(9_200);
    expect(t).toContain('chars elided');
    expect(t.startsWith('Note: system prompt') || t.startsWith('Note: the question') || t.includes('Called act_0')).toBe(true);
  });
});

// ── In the shared loop ──────────────────────────────────

const reply = (over: Partial<ChatWithToolsResult> & { call?: string; text?: string }): ChatWithToolsResult => ({
  message: over.call
    ? { role: 'assistant', content: null, tool_calls: [{ id: `id_${Math.random()}`, type: 'function', function: { name: over.call, arguments: '{}' } }] }
    : { role: 'assistant', content: over.text ?? null },
  tokensUsed: over.tokensUsed ?? { input: 0, output: 1 },
  latencyMs: 1,
  model: 'm',
  finishReason: over.finishReason ?? (over.call ? 'tool_calls' : 'stop'),
});
const ctx = { serverId: 's', ssh: {}, templateRegistry: {}, previousOutputs: new Map() } as unknown as ToolContext;
/** each result differs, so the loop guard (EX9.4) never sees a repeat */
const fetchTool = (chars: number): AgentTool => {
  let n = 0;
  return {
    name: 'fetch_data', description: 'd', securityTier: 'local', parameters: z.object({}),
    execute: vi.fn(async () => ({ success: true, output: `${++n}${big(chars)}` })),
  };
};
async function events(gen: AsyncGenerator<LoopEvent>): Promise<LoopEvent[]> {
  const out: LoopEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('runAgentLoop with the context manager', () => {
  it('compacts before a call once the history reaches the trigger, and reports occupancy', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply({ call: 'fetch_data' })).mockResolvedValueOnce(reply({ call: 'fetch_data' }))
      .mockResolvedValueOnce(reply({ call: 'fetch_data' })).mockResolvedValueOnce(reply({ call: 'fetch_data' }))
      .mockResolvedValueOnce(reply({ call: 'fetch_data' })).mockResolvedValueOnce(reply({ call: 'fetch_data' }))
      .mockResolvedValueOnce(reply({ text: 'done', tokensUsed: { input: 3_000, output: 5 } }));
    const p = planContext({ contextWindow: 8_192, maxOutputTokens: 2_048, local: true });
    const evs = await events(runAgentLoop({ chat, system: 's', user: 'u', tools: [fetchTool(4_000)], context: ctx, maxTurns: 10, plan: p }));
    const compacted = evs.filter((e) => e.type === 'compacted');
    expect(compacted.length).toBeGreaterThan(0);
    const lastSent = (chat.mock.calls.at(-1)![0] as { messages: ChatMessage[] }).messages;
    expect(lastSent.some((x) => x.content?.startsWith('[output trimmed — fetch_data'))).toBe(true);
    expect(wellFormed(lastSent)).toBe(true);
    expect(evs.filter((e) => e.type === 'context').at(-1)).toMatchObject({ used: 3_000, window: 8_192, trigger: p.trigger });
    expect(evs.at(-1)).toMatchObject({ type: 'final', reason: 'answered', text: 'done' });
  });

  it('answers a cut-off reply with a reminder, and after three asks for a short answer with tools off', async () => {
    const chat = vi.fn().mockResolvedValue(reply({ text: 'half an answ', finishReason: 'length' }));
    chat.mockResolvedValueOnce(reply({ text: 'half', finishReason: 'length' }))
      .mockResolvedValueOnce(reply({ call: 'fetch_data' }))
      .mockResolvedValueOnce(reply({ text: 'half', finishReason: 'length' }))
      .mockResolvedValueOnce(reply({ text: 'half', finishReason: 'length' }))
      .mockResolvedValueOnce(reply({ text: 'half', finishReason: 'length' }))
      .mockResolvedValueOnce(reply({ text: 'half', finishReason: 'length' }))
      .mockResolvedValueOnce(reply({ text: 'Short answer.' }));
    const evs = await events(runAgentLoop({ chat, system: 's', user: 'u', tools: [fetchTool(10)], context: ctx, maxTurns: 10 }));
    const second = (chat.mock.calls[1]![0] as { messages: ChatMessage[] }).messages;
    expect(second.at(-1)).toEqual({ role: 'user', content: CUT_OFF });
    expect(second.some((x) => x.content === 'half')).toBe(false); // the cut-off text is not kept
    const last = chat.mock.calls.at(-1)![0] as { tool_choice: string; messages: ChatMessage[] };
    expect(last.tool_choice).toBe('none');
    expect(last.messages.at(-1)!.content).toContain('keep getting cut off');
    expect(evs.at(-1)).toMatchObject({ type: 'final', reason: 'length', text: 'Short answer.' });
  });

  it('forces a compaction and retries after an overflow error, at most twice', async () => {
    const overflow = new Error('Ollama answered 400: input is too long for the context window');
    const chat = vi.fn()
      .mockResolvedValueOnce(reply({ call: 'fetch_data' })).mockResolvedValueOnce(reply({ call: 'fetch_data' }))
      .mockResolvedValueOnce(reply({ call: 'fetch_data' })).mockResolvedValueOnce(reply({ call: 'fetch_data' }))
      .mockResolvedValueOnce(reply({ call: 'fetch_data' }))
      .mockRejectedValueOnce(overflow)
      .mockResolvedValueOnce(reply({ text: 'ok' }));
    const evs = await events(runAgentLoop({ chat, system: 's', user: 'u', tools: [fetchTool(2_000)], context: ctx, maxTurns: 10 }));
    expect(evs.some((e) => e.type === 'compacted' && e.forced)).toBe(true);
    expect(evs.at(-1)).toMatchObject({ type: 'final', reason: 'answered', text: 'ok' });

    const always = vi.fn().mockRejectedValue(overflow);
    const failed = await events(runAgentLoop({ chat: always, system: 's', user: 'u', tools: [fetchTool(10)], context: ctx, maxTurns: 3 }));
    expect(always).toHaveBeenCalledTimes(3);
    expect(failed.at(-1)).toMatchObject({ type: 'error' });
  });
});
