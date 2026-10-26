// EX10.11 / EX10.13: loop control in the shared loop — previous-turn repeats, notes,
// announced-but-not-made steps, garbled replies, an Ollama that stopped answering
// @see docs/phases/phase-ex10.md §8c

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { LoopGuard, announcesStep } from '../../../src/agent/loop/loop-guard.js';
import { ANNOUNCED, GARBLED, GARBLED_NO_ANSWER, UNFINISHED, runAgentLoop, type LoopEvent } from '../../../src/agent/loop/run-loop.js';
import { NOTE_END } from '../../../src/agent/loop/notes.js';
import { LLMDegenerateError, LLMIncompleteError, LLMTimeoutError, type ChatMessage, type ChatWithToolsResult } from '../../../src/llm/provider.js';
import type { AgentTool, ToolContext } from '../../../src/agent/tools/types.js';

const call = (name: string, input: unknown, output = 'same', ok = true) => ({ name, input, output, ok });

describe('LoopGuard: back to back is any call of the previous turn (EX10.11)', () => {
  it('refuses a warned call made again in the next turn even when it was not the turn’s last call', () => {
    const g = new LoopGuard();
    g.fold([call('file_tail', { path: '/var/log/syslog' }, 'No such file', false), call('file_tail', { path: '/var/log/kern.log' }, 'No such file', false)]);
    g.fold([call('file_tail', { path: '/var/log/syslog' }, 'No such file', false), call('file_tail', { path: '/var/log/auth.log' }, 'No such file', false)]);
    const third = g.fold([call('file_tail', { path: '/var/log/syslog' }, 'No such file', false), call('file_tail', { path: '/var/log/auth.log' }, 'No such file', false)]);
    expect(third).toMatchObject([{ kind: 'warn', rule: 'unchanged', times: 3 }]);
    // the turn's last call was auth.log; syslog is still refused
    expect(g.blocked('file_tail', { path: '/var/log/syslog' })).toBe(true);
    expect(g.blocked('file_tail', { path: '/var/log/kern.log' })).toBe(false); // not warned
  });

  it('does not refuse a call that skipped a turn', () => {
    const g = new LoopGuard();
    for (let i = 0; i < 3; i++) g.fold([call('uptime', {})]);
    g.fold([call('memory_usage', {}, 'free')]);
    expect(g.blocked('uptime', {})).toBe(false);
  });

  it('keeps refusing across a turn in which the call was only refused', () => {
    const g = new LoopGuard();
    for (let i = 0; i < 3; i++) g.fold([call('uptime', {})]);
    expect(g.blocked('uptime', {})).toBe(true);
    expect(g.refused('uptime', {})).toMatchObject({ kind: 'warn' });
    g.fold([]); // the turn ran nothing
    expect(g.blocked('uptime', {})).toBe(true);
    expect(g.refused('uptime', {})).toMatchObject({ kind: 'stop' });
  });

  it('nudges once per streak of the same call, even when its result keeps changing', () => {
    const g = new LoopGuard();
    const findings = Array.from({ length: 9 }, (_, i) => g.fold([call('grep_output', { pattern: 'x' }, `result ${i}`)])).flat();
    expect(findings).toMatchObject([{ kind: 'warn', rule: 'running', times: 4 }]);
    g.fold([call('uptime', {})]); // the streak breaks
    const again = [0, 1, 2, 3].flatMap((i) => g.fold([call('grep_output', { pattern: 'x' }, `later ${i}`)]));
    expect(again).toMatchObject([{ rule: 'running', times: 4 }]);
  });

  it('names the agent’s own way out', () => {
    const g = new LoopGuard({ finish: 'build the view with what you have (generate_schema)' });
    const findings = [0, 1, 2].flatMap(() => g.fold([call('uptime', {})]));
    expect(findings[0]!.message).toMatch(/or build the view with what you have \(generate_schema\)\.$/);
    expect(g.refused('uptime', {}).message).toMatch(/or build the view with what you have \(generate_schema\)\.$/);
    expect(new LoopGuard().refused('x', {}).message).toBeDefined();
  });
});

describe('announcesStep (EX10.11)', () => {
  it.each([
    'Let me check the disk usage.',
    'Memory looks fine. Now I will check the logs.',
    "I'll run a quick look at the services:",
    "Next, I'm going to look at the journal.",
    'I need to read /etc/nginx/nginx.conf first.',
    "Let's inspect the containers.",
  ])('"%s" announces a step', (text) => {
    expect(announcesStep(text)).toBe(true);
  });

  it.each([
    'Disk usage is at 40%; nothing to worry about.',
    'Let me know if you want me to look at anything else.',
    'I will be happy to help further.',
    'You should check the nginx logs. Let me check the logs was my plan, but the answer is above.\n\nThe server is healthy.',
    '',
  ])('"%s" is an answer', (text) => {
    expect(announcesStep(text)).toBe(false);
  });
});

describe('runAgentLoop loop control', () => {
  const uptime: AgentTool = {
    name: 'uptime', description: 'u', securityTier: 'local', parameters: z.object({}),
    execute: vi.fn(async () => ({ success: true, output: 'up 3 days' })),
  };
  const ctx = { serverId: 's', ssh: {}, templateRegistry: {}, previousOutputs: new Map() } as unknown as ToolContext;
  let n = 0;
  const reply = (o: { call?: string; text?: string }): ChatWithToolsResult => ({
    message: o.call
      ? { role: 'assistant', content: null, tool_calls: [{ id: `c${++n}`, type: 'function', function: { name: o.call, arguments: '{}' } }] }
      : { role: 'assistant', content: o.text ?? null },
    tokensUsed: { input: 1, output: 1 }, latencyMs: 1, model: 'm', finishReason: o.call ? 'tool_calls' : 'stop',
  });
  const drain = async (chat: ReturnType<typeof vi.fn>, maxTurns = 10) => {
    const events: LoopEvent[] = [];
    for await (const e of runAgentLoop({ chat, system: 's', user: 'u', tools: [uptime], context: ctx, maxTurns })) events.push(e);
    return events;
  };
  const sent = (chat: ReturnType<typeof vi.fn>, i: number) => (chat.mock.calls[i]![0] as { messages: ChatMessage[] }).messages;

  it('puts a loop warning on the last tool result, not in a user message', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply({ call: 'uptime' }))
      .mockResolvedValueOnce(reply({ call: 'uptime' }))
      .mockResolvedValueOnce(reply({ call: 'uptime' }))
      .mockResolvedValueOnce(reply({ text: 'Up 3 days.' }));
    await drain(chat);
    const fourth = sent(chat, 3);
    expect(fourth.filter((m) => m.role === 'user')).toHaveLength(1); // only the request
    expect(fourth.at(-1)).toMatchObject({ role: 'tool' });
    expect(fourth.at(-1)!.content).toMatch(/^up 3 days\n\nNote: You have called uptime with the same input 3 times .* Do not reply to this note\.$/);
  });

  it('does not take "Let me check …" as the answer; asks for the call', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply({ text: 'Let me check the uptime.' }))
      .mockResolvedValueOnce(reply({ call: 'uptime' }))
      .mockResolvedValueOnce(reply({ text: 'The server has been up for 3 days.' }));
    const events = await drain(chat);
    expect(sent(chat, 1).at(-1)).toEqual({ role: 'user', content: `${ANNOUNCED} ${NOTE_END}` });
    expect(events.at(-1)).toMatchObject({ type: 'final', reason: 'answered', text: 'The server has been up for 3 days.' });
  });

  it('asks at most twice a run, then takes the text as the answer', async () => {
    const chat = vi.fn().mockResolvedValue(reply({ text: 'Let me check the uptime.' }));
    const events = await drain(chat);
    expect(chat).toHaveBeenCalledTimes(3);
    expect(events.at(-1)).toMatchObject({ type: 'final', reason: 'answered', text: 'Let me check the uptime.' });
  });

  it('drops a garbled reply and asks again, twice; then a short tools-off answer', async () => {
    const garbled = () => new LLMDegenerateError('garbled', 400);
    const once = vi.fn()
      .mockResolvedValueOnce(reply({ call: 'uptime' }))
      .mockRejectedValueOnce(garbled())
      .mockResolvedValueOnce(reply({ text: 'Up 3 days.' }));
    const events = await drain(once);
    expect(sent(once, 2).at(-1)!.content).toBe(`up 3 days\n\nNote: ${GARBLED} ${NOTE_END}`);
    expect(events.at(-1)).toMatchObject({ type: 'final', reason: 'answered' });

    const always = vi.fn(async (input: { tool_choice?: string }) => {
      if (input.tool_choice === 'none') return reply({ text: 'Uptime could not be read.' });
      throw garbled();
    });
    const stopped = await drain(always);
    expect(always).toHaveBeenCalledTimes(4); // the first try, two more, then tools off
    expect(stopped.at(-1)).toMatchObject({ type: 'final', reason: 'garbled', text: 'Uptime could not be read.' });
  });

  it('ends as garbled, with a plain answer, when the tools-off answer breaks down too', async () => {
    const chat = vi.fn().mockRejectedValue(new LLMDegenerateError('garbled', 300));
    const events = await drain(chat);
    expect(chat).toHaveBeenCalledTimes(4);
    expect(events.at(-1)).toMatchObject({ type: 'final', reason: 'garbled', text: GARBLED_NO_ANSWER });
  });

  it('asks again with its own note after a reply Ollama ended unfinished (§8d)', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply({ call: 'uptime' }))
      .mockRejectedValueOnce(new LLMIncompleteError('unfinished', 0))
      .mockResolvedValueOnce(reply({ text: 'Up 3 days.' }));
    const events = await drain(chat);
    expect(sent(chat, 2).at(-1)!.content).toBe(`up 3 days\n\nNote: ${UNFINISHED} ${NOTE_END}`);
    expect(events.at(-1)).toMatchObject({ type: 'final', reason: 'answered' });
  });

  it('ends the run at once when Ollama no longer answers at all', async () => {
    const chat = vi.fn().mockRejectedValue(new LLMTimeoutError('Ollama is not answering', 'first-token', 0, false));
    const events = await drain(chat);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: 'Ollama is not answering' });
  });

  it('still asks for a smaller step after a plain timeout', async () => {
    const chat = vi.fn()
      .mockRejectedValueOnce(new LLMTimeoutError('slow', 'first-token'))
      .mockResolvedValueOnce(reply({ text: 'Up 3 days.' }));
    const events = await drain(chat);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({ type: 'final', reason: 'answered' });
  });
});
