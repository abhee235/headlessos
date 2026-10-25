// EX10.11 / EX10.13: loop control in the UI Agent executor — the two live runs of
// 2026-10-25 replayed, the wrap-up turn, the steps-left note, garbled replies, a dead model
// @see docs/phases/phase-ex10.md §8c

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ReactiveExecutor, VIEW_GARBLED, VIEW_OUT_OF_STEPS, VIEW_UNFINISHED, viewStuck, type AgentEvent } from '../../../src/agent/executor.js';
import { LLMDegenerateError, LLMIncompleteError, LLMTimeoutError, type ChatMessage, type ChatWithToolsResult } from '../../../src/llm/provider.js';
import { ToolRegistry } from '../../../src/agent/tools/tool-registry.js';
import { updateViewTool } from '../../../src/agent/tools/update-view.js';
import { generateSchemaTool } from '../../../src/agent/tools/generate-schema.js';
import { grepOutputTool } from '../../../src/agent/tools/grep-output.js';
import { NOTE_END } from '../../../src/agent/loop/notes.js';
import type { AgentTool, ToolContext } from '../../../src/agent/tools/types.js';
import type { PlannerHints } from '../../../src/agent/planner.js';

const hints = {
  intent: 'System logs', interactivityLevel: 'display-only', expectedWidgets: ['log-viewer'], templateHint: null,
  dataSourceHints: ['logs'], suggestedLayout: 'stack', suggestedSections: ['Logs'],
  securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false }, estimatedComplexity: 'simple', skipPostReflection: true,
} as unknown as PlannerHints;

const SKELETON = {
  title: 'System Logs', sidebarItems: [{ id: 'logs', label: 'Logs' }, { id: 'packages', label: 'Packages' }],
  sections: {
    logs: { layout: 'stack', gap: 'md', children: [] },
    packages: { layout: 'stack', gap: 'md', children: [{ type: 'stat-card', title: 'dpkg entries', value: '100' }] },
  },
};
const FULL = {
  title: 'Overview', sidebarItems: [{ id: 'cpu', label: 'CPU' }, { id: 'memory', label: 'Memory' }],
  sections: {
    cpu: { layout: 'stack', gap: 'md', children: [{ type: 'stat-card', title: 'Cores', value: '12' }] },
    memory: { layout: 'stack', gap: 'md', children: [{ type: 'stat-card', title: 'Used', value: '1.8 GB' }] },
  },
};
const FINAL = {
  title: 'System Logs', sidebarItems: [{ id: 'packages', label: 'Packages' }],
  sections: { packages: { layout: 'stack', gap: 'md', children: [{ type: 'stat-card', title: 'dpkg entries', value: '100' }] } },
};

let id = 0;
const reply = (calls: Array<{ name: string; args?: unknown }> | string): ChatWithToolsResult => ({
  message: typeof calls === 'string'
    ? { role: 'assistant', content: calls }
    : { role: 'assistant', content: null, tool_calls: calls.map((c) => ({ id: `c${++id}`, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) } })) },
  tokensUsed: { input: 0, output: 1 }, latencyMs: 1, model: 'm', finishReason: typeof calls === 'string' ? 'stop' : 'tool_calls',
});
const tail = (path: string) => ({ name: 'file_tail', args: { path, lines: 100 } });

/** file_tail on a server where only dpkg.log exists */
function fileTail(): AgentTool {
  return {
    name: 'file_tail', description: 'tail a file', securityTier: 'action', parameters: z.object({ path: z.string(), lines: z.number().optional() }),
    execute: vi.fn(async (args: unknown) => {
      const { path } = args as { path: string };
      return path.endsWith('dpkg.log')
        ? { success: true, output: '2026-10-19 status installed python3-gi', metadata: { command: `sftp: last 100 lines of ${path}` } }
        : { success: false, output: 'failed: No such file\n(no output)', error: 'No such file', metadata: { command: `sftp: last 100 lines of ${path}` } };
    }),
  };
}

/** A distinct result every call, so the loop guard never fires */
function counter(): AgentTool {
  let n = 0;
  return { name: 'load_average', description: 'load', securityTier: 'action', parameters: z.object({}), execute: vi.fn(async () => ({ success: true, output: `0.0${++n}`, metadata: { command: 'cat /proc/loadavg' } })) };
}

type Sent = { messages: ChatMessage[]; tools: Array<{ function: { name: string } }> };
/** what each call sent, copied at call time (the executor keeps editing its history) */
let snapshots: Sent[] = [];

async function run(chat: ReturnType<typeof vi.fn>, tools: AgentTool[], maxSteps = 30): Promise<AgentEvent[]> {
  const registry = new ToolRegistry();
  for (const t of tools) registry.register(t);
  snapshots = [];
  const record = (input: Sent) => {
    snapshots.push(structuredClone({ messages: input.messages, tools: input.tools }));
    return chat(input);
  };
  const executor = new ReactiveExecutor({ chat: record, toolProvider: null } as never, registry, { maxSteps });
  const out: AgentEvent[] = [];
  for await (const e of executor.execute(hints, { serverId: 's', previousOutputs: new Map() } as unknown as ToolContext)) out.push(e);
  return out;
}

const sent = (i: number): Sent => snapshots[i]!;
const offered = (i: number) => sent(i).tools.map((t) => t.function.name);
const repetitionWarnings = (events: AgentEvent[]) => events.filter((e) => e.type === 'safety_warning' && e.warning === 'tool_repetition');

describe('executor loop control (EX10.11)', () => {
  it('logs run: the same missing files every turn → warned, refused, stopped, then a wrap-up turn builds the view', async () => {
    const tool = fileTail();
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'update_view', args: { view: SKELETON } }, tail('/var/log/syslog'), tail('/var/log/kern.log'), tail('/var/log/dpkg.log')]))
      .mockResolvedValueOnce(reply([tail('/var/log/syslog'), tail('/var/log/auth.log')]))
      .mockResolvedValueOnce(reply([tail('/var/log/syslog'), tail('/var/log/auth.log')]))
      .mockResolvedValueOnce(reply([tail('/var/log/syslog')])) // refused: the turn before held it
      .mockResolvedValueOnce(reply([tail('/var/log/syslog')])) // refused again: stop
      .mockResolvedValueOnce(reply([{ name: 'generate_schema', args: { schema: FINAL } }]));
    const events = await run(chat, [updateViewTool, generateSchemaTool, tool]);

    expect(chat).toHaveBeenCalledTimes(6);
    // syslog ran 3 times; the 4th and 5th were not run
    expect((tool.execute as ReturnType<typeof vi.fn>).mock.calls.filter(([a]) => (a as { path: string }).path === '/var/log/syslog')).toHaveLength(3);
    expect(repetitionWarnings(events)).toHaveLength(3);
    // the warning rode on the turn's last tool result, as a note
    const fourth = sent(3).messages;
    expect(fourth.filter((m) => m.role === 'user')).toHaveLength(1);
    const note = JSON.parse(fourth.at(-1)!.content!).note as string;
    expect(note).toMatch(/^You have called file_tail with the same input 3 times .*or build the view with what you have \(generate_schema\)\. Do not reply to this note\.$/);
    // the refusal
    expect(JSON.parse(sent(4).messages.at(-1)!.content!).error).toMatch(/^Not run: file_tail with this input already returned the same result 3 times/);
    // the wrap-up turn: only generate_schema, with the stuck note
    expect(offered(5)).toEqual(['generate_schema']);
    expect(JSON.parse(sent(5).messages.at(-1)!.content!).note).toBe(`${viewStuck('file_tail')} ${NOTE_END}`);
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete', view: { title: 'System Logs' } });
  });

  it('overview run: the same broken schema again and again with a full view built → that view, no extra turn', async () => {
    const broken = '{"title":"Overview","sidebarItems":{"id":"cpu"';
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'update_view', args: { view: FULL } }]))
      .mockResolvedValue(reply([{ name: 'generate_schema', args: { schema: broken } }]));
    const events = await run(chat, [updateViewTool, generateSchemaTool]);

    expect(chat).toHaveBeenCalledTimes(6); // 1 view + 3 failures + 2 refusals; no wrap-up
    expect(repetitionWarnings(events).map((e) => (e as { tool?: string }).tool)).toEqual(['generate_schema', 'generate_schema', 'generate_schema']);
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete', view: { title: 'Overview' } });
  });

  it('stuck with an empty section and no view from the wrap-up turn → the EX10.4 early stop, saying why', async () => {
    const tool = fileTail();
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'update_view', args: { view: SKELETON } }, tail('/var/log/syslog')]))
      .mockResolvedValueOnce(reply([tail('/var/log/syslog')]))
      .mockResolvedValueOnce(reply([tail('/var/log/syslog')]))
      .mockResolvedValueOnce(reply([tail('/var/log/syslog')]))
      .mockResolvedValueOnce(reply([tail('/var/log/syslog')]))
      .mockResolvedValueOnce(reply('I could not find the logs.'));
    const events = await run(chat, [updateViewTool, generateSchemaTool, tool]);

    expect(events.at(-1)).toMatchObject({
      type: 'generation_incomplete', reason: 'the model kept repeating file_tail without getting anything new', emptySections: ['Logs'],
    });
  });

  it('grep_output searches what was fetched, not its own results, so a repeated search is caught', async () => {
    const grep = { ...grepOutputTool, execute: vi.fn(grepOutputTool.execute) };
    const search = { name: 'grep_output', args: { pattern: 'faillog|lastlog' } };
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'update_view', args: { view: FULL } }, tail('/var/log/dpkg.log')]))
      .mockResolvedValue(reply([search]));
    const events = await run(chat, [updateViewTool, generateSchemaTool, fileTail(), grep]);

    const outputs = await Promise.all(grep.execute.mock.results.map((r) => r.value as Promise<{ output: string }>));
    expect(outputs).toHaveLength(3); // the 4th and 5th identical searches were not run
    expect(new Set(outputs.map((o) => o.output)).size).toBe(1); // the same answer each time
    const messages = repetitionWarnings(events).map((e) => (e as { message?: string }).message ?? '');
    expect(messages[0]).toMatch(/^You have called grep_output with the same input 3 times/);
    expect(messages[1]).toMatch(/^Not run: grep_output with this input already returned the same result 3 times/);
    expect(messages[2]).toBe(viewStuck('grep_output')); // the UI Agent's own words, not the investigation agent's
    expect(messages).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete', view: { title: 'Overview' } }); // the full view
  });

  it('three steps before the limit, the last tool result carries a note', async () => {
    const tool = counter();
    const chat = vi.fn().mockResolvedValue(reply([{ name: 'load_average' }]));
    await run(chat, [tool], 6);
    const fourth = sent(3).messages;
    expect(JSON.parse(fourth.at(-1)!.content!).note).toBe(`3 steps left: call generate_schema soon with the data you have; leave out what you could not get. ${NOTE_END}`);
    expect(JSON.parse(sent(2).messages.at(-1)!.content!).note).toBeUndefined();
  });

  it('out of steps → one generate_schema-only turn before giving up', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'load_average' }]))
      .mockResolvedValueOnce(reply([{ name: 'load_average' }]))
      .mockResolvedValueOnce(reply([{ name: 'generate_schema', args: { schema: FINAL } }]));
    const events = await run(chat, [counter(), generateSchemaTool], 2);
    expect(offered(2)).toEqual(['generate_schema']);
    expect(JSON.parse(sent(2).messages.at(-1)!.content!).note).toBe(`${VIEW_OUT_OF_STEPS} ${NOTE_END}`);
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete' });
  });

  it('takes the view from an update_view call in the wrap-up turn, though it was not offered', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'load_average' }]))
      .mockResolvedValueOnce(reply([{ name: 'update_view', args: { view: FINAL } }]));
    const events = await run(chat, [counter(), generateSchemaTool], 1);
    expect(offered(1)).toEqual(['generate_schema']);
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete', view: { title: 'System Logs' } });
  });

  it('a wrap-up turn that fails keeps the step-limit reason', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'load_average' }]))
      .mockRejectedValueOnce(new Error('boom'));
    const events = await run(chat, [counter(), generateSchemaTool], 1);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('maximum step limit (1)') });
  });
});

describe('executor garbled replies and a dead model (EX10.13)', () => {
  it('drops a garbled reply and asks again with a note', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'load_average' }]))
      .mockRejectedValueOnce(new LLMDegenerateError('garbled', 400))
      .mockResolvedValueOnce(reply([{ name: 'generate_schema', args: { schema: FINAL } }]));
    const events = await run(chat, [counter(), generateSchemaTool]);
    expect(JSON.parse(sent(2).messages.at(-1)!.content!).note).toBe(`${VIEW_GARBLED} ${NOTE_END}`);
    expect(sent(2).messages).toHaveLength(sent(1).messages.length); // nothing added, the note rides along
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete' });
  });

  it('stops early after the third garbled reply, keeping the last view', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'update_view', args: { view: SKELETON } }]))
      .mockRejectedValue(new LLMDegenerateError('garbled', 400));
    const events = await run(chat, [updateViewTool, generateSchemaTool]);
    expect(chat).toHaveBeenCalledTimes(4);
    expect(events.at(-1)).toMatchObject({ type: 'generation_incomplete', reason: 'the model’s replies kept breaking down into repeated characters' });
  });

  it('treats a reply Ollama ended unfinished like a garbled one, with its own note and ending (§8d)', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'load_average' }]))
      .mockRejectedValueOnce(new LLMIncompleteError('Ollama ended the reply without finishing it, 0 tokens in (1 retry)', 0))
      .mockResolvedValueOnce(reply([{ name: 'generate_schema', args: { schema: FINAL } }]));
    const events = await run(chat, [counter(), generateSchemaTool]);
    expect(JSON.parse(sent(2).messages.at(-1)!.content!).note).toBe(`${VIEW_UNFINISHED} ${NOTE_END}`);
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete' });

    const always = vi.fn()
      .mockResolvedValueOnce(reply([{ name: 'update_view', args: { view: SKELETON } }]))
      .mockRejectedValue(new LLMIncompleteError('unfinished', 0));
    const stopped = await run(always, [updateViewTool, generateSchemaTool]);
    expect(stopped.at(-1)).toMatchObject({ type: 'generation_incomplete', reason: 'Ollama kept ending the model’s replies before they were finished' });
  });

  it('stops at once when the model no longer answers a status check', async () => {
    const chat = vi.fn().mockRejectedValue(new LLMTimeoutError('Ollama is not answering', 'first-token', 0, false));
    const events = await run(chat, [counter()]);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: 'Stopped: the model stopped answering, before any complete view was built.' });
  });
});
