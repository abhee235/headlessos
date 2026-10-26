// EX11.1: Anthropic provider — Claude through Anthropic's own SDK
// @see docs/phases/phase-ex11.md §1, docs/DECISIONS.md (ADR-027)

import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  AnthropicProvider,
  anthropicRequest,
  fromAnthropicReply,
  jsonValue,
  toAnthropicMessages,
  toAnthropicTools,
  usageOf,
} from '../../src/llm/providers/anthropic.js';
import type { ChatMessage, ToolCall } from '../../src/llm/provider.js';
import { ContextManager } from '../../src/agent/context/manager.js';
import { runAgentLoop } from '../../src/agent/loop/run-loop.js';

type Block = Record<string, unknown> & { type: string };

const reply = (content: Block[], stop_reason = 'end_turn', extra: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  content,
  stop_reason,
  stop_details: null,
  usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  ...extra,
});

function fakeClient(...replies: Array<ReturnType<typeof reply> | Error>) {
  const stream = vi.fn();
  for (const r of replies) {
    stream.mockImplementationOnce(() => ({
      finalMessage: async () => {
        if (r instanceof Error) throw r;
        return r;
      },
    }));
  }
  const retrieve = vi.fn().mockResolvedValue({ id: 'claude-haiku-5-5' });
  return { client: { beta: { messages: { stream } }, models: { retrieve } } as unknown as Anthropic, stream, retrieve };
}

const call = (id: string, name: string, args: unknown): ToolCall => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const thinking = (signature: string): Block => ({ type: 'thinking', thinking: '', signature });

describe('history → Messages API (EX11.1)', () => {
  it('puts the system prompt on top, groups results after their calls, and lets a note follow them', () => {
    const history: ChatMessage[] = [
      { role: 'system', content: 'You are an agent.' },
      { role: 'user', content: 'show disk' },
      { role: 'assistant', content: 'Checking.', tool_calls: [call('a', 'disk_usage', {}), call('b', 'memory_usage', {})] },
      { role: 'tool', tool_call_id: 'a', content: '{"rows":[]}' },
      { role: 'tool', tool_call_id: 'b', content: '{"usedMb":1}' },
      { role: 'user', content: 'You have 3 steps left.' },
    ];
    const { system, messages } = toAnthropicMessages(history);
    expect(system).toBe('You are an agent.');
    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'show disk' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking.' },
          { type: 'tool_use', id: 'a', name: 'disk_usage', input: {} },
          { type: 'tool_use', id: 'b', name: 'memory_usage', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'a', content: '{"rows":[]}' },
          { type: 'tool_result', tool_use_id: 'b', content: '{"usedMb":1}' },
          { type: 'text', text: 'You have 3 steps left.' },
        ],
      },
    ]);
  });

  it('answers a call that has no result, and leaves out a result whose call is gone', () => {
    const { messages } = toAnthropicMessages([
      { role: 'user', content: 'go' },
      { role: 'tool', tool_call_id: 'compacted', content: 'old result' },
      { role: 'assistant', content: null, tool_calls: [call('a', 'uptime', {})] },
      { role: 'assistant', content: 'Done.' },
    ]);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(messages[0]!.content).toEqual([{ type: 'text', text: 'go' }]);
    expect(messages[2]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'a', content: 'Not run.', is_error: true }]);
    expect(messages[4]!.content).toBe('Continue.'); // never a prefill
  });

  it('gives a history that starts with a reply a line before it', () => {
    const { messages } = toAnthropicMessages([{ role: 'assistant', content: 'Earlier answer.' }, { role: 'user', content: 'and now?' }]);
    expect(messages[0]).toEqual({ role: 'user', content: '(The conversation so far.)' });
  });

  it('turns tools into Claude tools whose arguments stream', () => {
    const tools = toAnthropicTools([{ type: 'function', function: { name: 'disk_usage', description: 'Disk', parameters: { $schema: 'x', type: 'object', properties: { path: { type: 'string' } } } } }]);
    expect(tools).toEqual([{ name: 'disk_usage', description: 'Disk', input_schema: { type: 'object', properties: { path: { type: 'string' } } }, eager_input_streaming: true }]);
    expect(toAnthropicTools([])).toBeUndefined();
  });
});

describe('thinking goes back unchanged (EX11.1)', () => {
  const content: Block[] = [thinking('sig-1'), { type: 'text', text: 'Let me look.', citations: null }, { type: 'tool_use', id: 't1', name: 'start_view', input: { title: 'Disk' } }];
  const user: ChatMessage = { role: 'user', content: 'show disk' };
  const result: ChatMessage = { role: 'tool', tool_call_id: 't1', content: 'ok' };

  it('sends a reply back exactly as it came', () => {
    const { message } = fromAnthropicReply(reply(content, 'tool_use') as never);
    expect(message.reasoning).toEqual({ provider: 'anthropic', blocks: content });
    const { messages } = toAnthropicMessages([user, message, result]);
    expect(messages[1]!.content).toEqual(content);
  });

  it('rebuilds a call the agents changed, and keeps the thinking in its place', () => {
    const { message } = fromAnthropicReply(reply(content, 'tool_use') as never);
    const collapsed: ChatMessage = { ...message, tool_calls: [call('t1', 'start_view', { title: '[replaced by a later update_view]' })] };
    const { messages } = toAnthropicMessages([user, collapsed, result]);
    expect(messages[1]!.content).toEqual([
      thinking('sig-1'),
      { type: 'text', text: 'Let me look.', citations: null },
      { type: 'tool_use', id: 't1', name: 'start_view', input: { title: '[replaced by a later update_view]' } },
    ]);
  });

  it('leaves out a call the agents dropped, and sends changed text', () => {
    const { message } = fromAnthropicReply(reply(content, 'tool_use') as never);
    const { messages } = toAnthropicMessages([user, { ...message, content: 'Looking now.', tool_calls: [] }]);
    expect(messages[1]!.content).toEqual([thinking('sig-1'), { type: 'text', text: 'Looking now.' }]);
  });

  it('echoes a fallback switch in place; the declined model’s calls never ran and are left out', () => {
    const fallback: Block = { type: 'fallback', from: { model: 'claude-sonnet-5-5' }, to: { model: 'claude-opus-5-5' }, trigger: { type: 'refusal' } };
    const switched: Block[] = [
      thinking('sig-a'),
      { type: 'text', text: 'Partial.' },
      { type: 'tool_use', id: 'x', name: 'uptime', input: {} },
      fallback,
      thinking('sig-b'),
      { type: 'text', text: 'Answer.' },
      { type: 'tool_use', id: 'y', name: 'disk_usage', input: {} },
    ];
    const { message } = fromAnthropicReply(reply(switched, 'tool_use') as never);
    expect(message.content).toBe('Answer.');
    expect(message.tool_calls!.map((tc) => tc.id)).toEqual(['y']);
    const { messages } = toAnthropicMessages([user, message, { role: 'tool', tool_call_id: 'y', content: 'ok' }]);
    expect(messages[1]!.content).toEqual([thinking('sig-a'), { type: 'text', text: 'Partial.' }, fallback, thinking('sig-b'), { type: 'text', text: 'Answer.' }, { type: 'tool_use', id: 'y', name: 'disk_usage', input: {} }]);
  });

  it('skips a turn that is only thinking (the API does not take one)', () => {
    const { message } = fromAnthropicReply(reply([thinking('sig-1')], 'max_tokens') as never);
    expect(toAnthropicMessages([user, message, { role: 'user', content: 'shorter please' }]).messages.map((m) => m.role)).toEqual(['user']);
  });
});

describe('the request (EX11.1)', () => {
  const base = { system: 'Rules', messages: [{ role: 'user' as const, content: 'hi' }], cap: 16_384, effort: 'medium' as const };

  it('thinks adaptively, drops stale thinking instead of failing, and caches the system prompt and the run', () => {
    const body = anthropicRequest('claude-haiku-5-5', { ...base, tools: toAnthropicTools([{ type: 'function', function: { name: 'uptime', description: 'Up', parameters: { type: 'object' } } }]), toolChoice: 'none' });
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 16_384 + 16_384,
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort: 'medium' },
      betas: ['thinking-binding-controls-2026-08-01'],
      cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: 'Rules', cache_control: { type: 'ephemeral' } }],
      tool_choice: { type: 'none' }, // the tools stay on the request
    });
    expect(body.tools).toHaveLength(1);
    expect(body).not.toHaveProperty('fallbacks'); // Haiku 5.5 has none
    expect(body).not.toHaveProperty('temperature');
  });

  it('asks Sonnet 5.5 and Opus 5.5 for a fallback when a request is declined', () => {
    for (const model of ['claude-sonnet-5-5', 'claude-opus-5-5']) {
      const body = anthropicRequest(model, base);
      expect(body.fallbacks).toBe('default');
      expect(body.betas).toEqual(['thinking-binding-controls-2026-08-01', 'server-side-fallback-2026-07-01']);
    }
  });

  it('caps the reply at 128K with the thinking room, and sends no thinking settings to models before 4.6', () => {
    expect(anthropicRequest('claude-opus-5-5', { ...base, cap: 125_000 }).max_tokens).toBe(128_000);
    expect(anthropicRequest('claude-haiku-5-5', { ...base, effort: 'low' }).max_tokens).toBe(16_384 + 8_192);
    const old = anthropicRequest('claude-haiku-4-5', base);
    expect(old).not.toHaveProperty('thinking');
    expect(old).not.toHaveProperty('output_config');
    expect(old.max_tokens).toBe(16_384);
  });
});

describe('the reply (EX11.1)', () => {
  it('passes whole calls on as JSON arguments', () => {
    const { message, finishReason } = fromAnthropicReply(reply([{ type: 'tool_use', id: 'c', name: 'disk_usage', input: { path: '/' } }], 'tool_use') as never);
    expect(finishReason).toBe('tool_calls');
    expect(message.tool_calls).toEqual([call('c', 'disk_usage', { path: '/' })]);
    expect(message.content).toBeNull();
  });

  it('drops a call cut off by the cap', () => {
    const { message, finishReason } = fromAnthropicReply(reply([{ type: 'text', text: 'Next:' }, { type: 'tool_use', id: 'c', name: 'add_widget', input: { section: 'd' } }], 'max_tokens') as never);
    expect(finishReason).toBe('length');
    expect(message.tool_calls).toBeUndefined();
    expect(message.content).toBe('Next:');
  });

  it('says when Claude declined, and runs none of its calls', () => {
    const declined = reply([{ type: 'text', text: 'I' }, { type: 'tool_use', id: 'c', name: 'uptime', input: {} }], 'refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: null } });
    const { message, finishReason } = fromAnthropicReply(declined as never);
    expect(finishReason).toBe('content_filter');
    expect(message.tool_calls).toBeUndefined();
    expect(message.content).toBe('I\n\nClaude declined to go on with this (its safety check: cyber).');
  });

  it('counts the whole prompt, cached parts included', () => {
    expect(usageOf({ usage: { input_tokens: 10, output_tokens: 7, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000 } } as never)).toEqual({ input: 3210, output: 7 });
  });

  it('reads JSON with or without fences, and repairs it', () => {
    expect(jsonValue('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(jsonValue('[1,2]')).toEqual([1, 2]);
    expect(jsonValue('{"a":1,}')).toEqual({ a: 1 });
    expect(() => jsonValue('no json here')).toThrow(/not JSON/);
  });
});

describe('AnthropicProvider (EX11.1)', () => {
  it('plans like a hosted model: 1M window held at 128K, 16K replies', () => {
    const p = new AnthropicProvider('sk-ant-test', 'claude-haiku-5-5', fakeClient().client);
    expect(p.limits).toEqual({ contextWindow: 128_000, source: 'table', maxOutputTokens: 16_000, local: false });
    expect(p.name).toBe('anthropic');
  });

  it('chats with tools: the mapped history goes out, usage and model come back', async () => {
    const { client, stream } = fakeClient(reply([thinking('s'), { type: 'tool_use', id: 'c1', name: 'uptime', input: {} }], 'tool_use', { usage: { input_tokens: 5, output_tokens: 9, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0 } }));
    const p = new AnthropicProvider('k', 'claude-sonnet-5-5', client);
    const res = await p.chatWithTools({
      messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'up?' }],
      tools: [{ type: 'function', function: { name: 'uptime', description: 'Up', parameters: { type: 'object' } } }],
      tool_choice: 'auto',
      maxTokens: 4_096,
    });
    const body = stream.mock.calls[0]![0];
    expect(body.max_tokens).toBe(4_096 + 16_384);
    expect(body.system).toEqual([{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }]);
    expect(body.output_config).toEqual({ effort: 'medium' });
    expect(res).toMatchObject({ finishReason: 'tool_calls', tokensUsed: { input: 1005, output: 9 }, model: 'claude-haiku-5-5' });
    expect(res.message.tool_calls![0]!.function.name).toBe('uptime');
  });

  it('parses JSON against the schema, at low effort, with the schema in the system prompt', async () => {
    const { client, stream } = fakeClient(reply([thinking('s'), { type: 'text', text: '```json\n{"used":42}\n```' }]));
    const p = new AnthropicProvider('k', 'claude-haiku-5-5', client);
    const res = await p.parseText({ rawOutput: 'x', command: 'df', schema: z.object({ used: z.number() }) });
    expect(res.data).toEqual({ used: 42 });
    const body = stream.mock.calls[0]![0];
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.system[0].text).toMatch(/Reply with one JSON value that matches this JSON Schema[\s\S]*"used"/);
  });

  it('returns plain text for a string schema (summaries)', async () => {
    const { client, stream } = fakeClient(reply([{ type: 'text', text: '  Disk is 6% used.  ' }]));
    const res = await new AnthropicProvider('k', 'claude-haiku-5-5', client).parseText({ rawOutput: 'x', command: 'summarize', schema: z.string(), systemPrompt: 'Summarize.' });
    expect(res.data).toBe('Disk is 6% used.');
    expect(stream.mock.calls[0]![0].system[0].text).toBe('Summarize.');
  });

  it('refuses to invent a parse when Claude declined', async () => {
    const { client } = fakeClient(reply([], 'refusal', { stop_details: { type: 'refusal', category: null, explanation: null } }));
    await expect(new AnthropicProvider('k', 'claude-haiku-5-5', client).parseText({ rawOutput: 'x', command: 'df', schema: z.object({}) })).rejects.toThrow('Claude declined to parse this.');
  });

  it('says what went wrong in words the owner can act on', async () => {
    const err = (status: number, type: string, message: string) => Anthropic.APIError.generate(status, { type: 'error', error: { type, message } }, undefined, new Headers());
    const { client } = fakeClient(
      err(401, 'authentication_error', 'invalid x-api-key'),
      err(404, 'not_found_error', 'model: claude-nope'),
      err(400, 'invalid_request_error', 'prompt is too long: 1200000 tokens > 1000000 maximum'),
    );
    const p = new AnthropicProvider('k', 'claude-haiku-5-5', client);
    const chat = () => p.chatWithTools({ messages: [{ role: 'user', content: 'hi' }] });
    await expect(chat()).rejects.toThrow('Anthropic rejected the API key (401)');
    await expect(chat()).rejects.toThrow('claude-haiku-5-5 is not available to this Anthropic key (404)');
    const overflow = await chat().catch((e: unknown) => e);
    expect((overflow as Error).message).toBe('Anthropic answered 400: prompt is too long: 1200000 tokens > 1000000 maximum');
    expect(ContextManager.isOverflowError(overflow)).toBe(true); // the loops compact and try again
  });

  it('switches model on the same key, and checks a key against a model', async () => {
    const { client, retrieve } = fakeClient();
    const p = new AnthropicProvider('k', 'claude-haiku-5-5', client).withModel('claude-opus-5-5');
    expect(p.model).toBe('claude-opus-5-5');
    await p.checkModel();
    expect(retrieve).toHaveBeenCalledWith('claude-opus-5-5', {}, expect.objectContaining({ timeout: 10_000 }));
    retrieve.mockRejectedValueOnce(Anthropic.APIError.generate(401, { type: 'error', error: { type: 'authentication_error', message: 'bad' } }, undefined, new Headers()));
    await expect(p.checkModel()).rejects.toThrow('Anthropic rejected the API key');
  });
});

describe('in the shared agent loop (EX11.1)', () => {
  it('sends the first reply, thinking included, back with its result on the next turn', async () => {
    const first: Block[] = [thinking('sig-1'), { type: 'tool_use', id: 'u1', name: 'uptime', input: {} }];
    const { client, stream } = fakeClient(reply(first, 'tool_use'), reply([thinking('sig-2'), { type: 'text', text: 'Up 3 days.' }]));
    const p = new AnthropicProvider('k', 'claude-haiku-5-5', client);
    const uptime = { name: 'uptime', description: 'How long the server has been up', securityTier: 'local' as const, parameters: z.object({}), execute: async () => ({ success: true, output: 'up 3 days' }) };
    const events: Array<{ type: string; text?: string }> = [];
    for await (const e of runAgentLoop({
      chat: (i) => p.chatWithTools(i),
      system: 'You are a test assistant.',
      user: 'How long has it been up?',
      tools: [uptime],
      context: { serverId: 's', ssh: {}, templateRegistry: {}, previousOutputs: new Map() } as never,
      maxTurns: 4,
      contextWindow: p.contextWindow,
    })) events.push(e as { type: string; text?: string });
    expect(events.find((e) => e.type === 'final')?.text).toBe('Up 3 days.');
    const second = stream.mock.calls[1]![0];
    expect(second.messages[1]).toEqual({ role: 'assistant', content: first });
    expect(second.messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'u1' });
    expect(second.messages[2].content[0].content).toContain('up 3 days');
  });
});
