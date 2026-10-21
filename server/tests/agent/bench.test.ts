// EX9.4: the agent benchmark, driven by a scripted provider (no real model)
// @see docs/phases/phase-ex9.md §9

import { describe, it, expect, vi } from 'vitest';
import { BENCH_QUESTIONS, formatBench, runBench } from '../../src/agent/bench/bench.js';
import type { ChatWithToolsInput, ChatWithToolsResult } from '../../src/llm/provider.js';

/** Answers each question by calling its first expected action, then replying. */
function scriptedModel(quirks: Record<string, { name: string; args: string }[]> = {}) {
  const chatWithTools = vi.fn(async (input: ChatWithToolsInput): Promise<ChatWithToolsResult> => {
    const question = String(input.messages[1]!.content);
    const q = BENCH_QUESTIONS.find((x) => question.includes(x.question))!;
    const done = input.messages.filter((m) => m.role === 'tool').length;
    const plan = quirks[q.id] ?? [{ name: q.expect[0]!, args: q.expect[0] === 'service_status' ? '{"unit":"nginx"}' : '{}' }];
    const next = plan[done];
    const base = { tokensUsed: { input: 100, output: 10 }, latencyMs: 1, model: 'scripted' };
    return next
      ? { ...base, finishReason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: `c${done}`, type: 'function', function: { name: next.name, arguments: next.args } }] } }
      : { ...base, finishReason: 'stop', message: { role: 'assistant', content: `Answer for ${q.id}.` } };
  });
  return { name: 'ollama', model: 'scripted', contextWindow: 8192, parseText: vi.fn(), parseImage: vi.fn(), chatWithTools };
}

describe('runBench', () => {
  it('reaches every question’s expected action on the fake server', async () => {
    const summary = await runBench(scriptedModel() as never);
    expect(summary.rows).toHaveLength(BENCH_QUESTIONS.length);
    expect(summary.rows.filter((r) => !r.picked).map((r) => r.id)).toEqual([]);
    expect(summary).toMatchObject({ provider: 'ollama', model: 'scripted', contextWindow: 8192, pickedRate: 1, answeredRate: 1, malformed: 0, unknownTools: 0, paramErrors: 0 });
    // the canned fake-server outputs answer every first pick
    for (const r of summary.rows) expect({ id: r.id, failed: r.failedActions, status: r.status }).toEqual({ id: r.id, failed: 0, status: 'completed' });
  });

  it('counts repaired JSON, unknown tools and parameter errors', async () => {
    const summary = await runBench(scriptedModel({
      memory: [{ name: 'process_list', args: "{sortBy: 'memory',}" }],
      who: [{ name: 'who_is_on', args: '{}' }, { name: 'logged_in_users', args: '{}' }],
      nginx: [{ name: 'service_status', args: '{"unit":"nginx; id"}' }, { name: 'service_status', args: '{"service":"nginx"}' }],
    }) as never, { questions: BENCH_QUESTIONS.filter((q) => ['memory', 'who', 'nginx'].includes(q.id)) });
    expect(summary).toMatchObject({ repaired: 1, unknownTools: 1, paramErrors: 1, pickedRate: 1 });
    expect(summary.rows.find((r) => r.id === 'who')!.actions).toEqual(['who_is_on', 'logged_in_users']);
  });

  it('prints a table', async () => {
    const summary = await runBench(scriptedModel() as never, { questions: BENCH_QUESTIONS.slice(0, 2) });
    const text = formatBench(summary);
    expect(text).toContain('ollama · scripted · 8192 tokens');
    expect(text).toMatch(/disk\s+yes\s+yes\s+1/);
    expect(text).toContain('picked 100% · answered 100%');
  });
});
