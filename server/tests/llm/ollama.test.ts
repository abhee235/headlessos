// EX9.3: Ollama provider
// @see docs/phases/phase-ex9.md §8

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { DEGENERATE_RUN, DEGENERATE_WINDOW, OllamaProvider, checkOllamaUrl, isDegenerate, listOllamaModels, toOllamaMessages } from '../../src/llm/providers/ollama.js';
import { resolveOllamaLimits } from '../../src/llm/model-limits.js';
import { LLMTimeoutError, isLLMDegenerate, isLLMTimeout } from '../../src/llm/provider.js';

function fakeFetch(...bodies: unknown[]) {
  const fn = vi.fn();
  for (const body of bodies) {
    fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  }
  return fn;
}
const sentBody = (fn: ReturnType<typeof vi.fn>, i = 0) => JSON.parse(fn.mock.calls[i]![1].body as string);

describe('checkOllamaUrl', () => {
  it('accepts loopback http(s) base URLs and normalizes them', () => {
    expect(checkOllamaUrl('http://127.0.0.1:11434')).toEqual({ ok: true, url: 'http://127.0.0.1:11434' });
    expect(checkOllamaUrl('http://localhost:11434/')).toEqual({ ok: true, url: 'http://localhost:11434' });
    expect(checkOllamaUrl('http://[::1]:11434')).toEqual({ ok: true, url: 'http://[::1]:11434' });
  });

  it('needs an explicit allow for another machine', () => {
    expect(checkOllamaUrl('http://10.0.0.7:11434')).toMatchObject({ ok: false, error: expect.stringContaining('another machine') });
    expect(checkOllamaUrl('http://10.0.0.7:11434', true)).toEqual({ ok: true, url: 'http://10.0.0.7:11434' });
  });

  it('refuses other schemes, credentials and paths', () => {
    for (const bad of ['file:///etc/passwd', 'http://u:p@127.0.0.1:11434', 'http://127.0.0.1:11434/api/chat', 'not a url', 'http://127.0.0.1:11434/?x=1']) {
      expect(checkOllamaUrl(bad, true).ok, bad).toBe(false);
    }
  });
});

describe('probes', () => {
  it('lists installed models', async () => {
    const fetch = fakeFetch({ models: [{ name: 'qwen3:8b', size: 5_200_000_000, details: { parameter_size: '8.2B', family: 'qwen3' } }, { bad: true }] });
    expect(await listOllamaModels('http://127.0.0.1:11434', fetch)).toEqual([
      { name: 'qwen3:8b', parameterSize: '8.2B', family: 'qwen3', sizeBytes: 5_200_000_000 },
    ]);
    expect(fetch.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/tags');
  });

});

// EX10.1: one window and one reply cap per model, thinking off
describe('OllamaProvider wire options', () => {
  const ok = { model: 'm', message: { role: 'assistant', content: 'hi' }, done_reason: 'stop' };

  it('sends num_ctx, num_predict and think: false from the model limits', async () => {
    const fetch = fakeFetch(ok, ok);
    const limits = resolveOllamaLimits({ trainedContext: 262144 });
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'm', limits, fetch });
    expect(p.contextWindow).toBe(65536);
    await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] });
    expect(sentBody(fetch, 0)).toMatchObject({ think: false, options: { num_ctx: 65536, num_predict: 8192 } });
    await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }], maxTokens: 300 });
    expect(sentBody(fetch, 1).options).toMatchObject({ num_ctx: 65536, num_predict: 300 });
  });

  it('asks again without think when the model rejects it, and remembers', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, clone() { return this; }, text: async () => '{"error":"\"m\" does not support thinking"}' })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ok, text: async () => '' });
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'm', contextWindow: 8192, fetch });
    const r = await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.message.content).toBe('hi');
    expect(sentBody(fetch, 0)).toHaveProperty('think', false);
    expect(sentBody(fetch, 1)).not.toHaveProperty('think');
    await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] });
    expect(sentBody(fetch, 2)).not.toHaveProperty('think');
  });

  it('does not retry other 400s', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, clone() { return this; }, text: async () => 'bad request' });
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch });
    await expect(p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('Ollama answered 400: bad request');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('OllamaProvider.chatWithTools', () => {
  const tools = [{ type: 'function' as const, function: { name: 'disk_usage', description: 'Disk usage', parameters: { type: 'object', properties: {} } } }];

  it('posts /api/chat with tools and num_ctx, streaming, and reads object arguments', async () => {
    const fetch = fakeFetch({
      model: 'qwen3:8b',
      message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'service_status', arguments: { unit: 'nginx' } } }] },
      done_reason: 'stop', prompt_eval_count: 900, eval_count: 30,
    });
    const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:11434/', model: 'qwen3:8b', contextWindow: 8192, fetch });
    const result = await provider.chatWithTools({ messages: [{ role: 'user', content: 'is nginx up?' }], tools });

    expect(fetch.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/chat');
    expect(sentBody(fetch)).toMatchObject({ model: 'qwen3:8b', stream: true, tools, options: { num_ctx: 8192 } });
    expect(result.finishReason).toBe('tool_calls');
    expect(result.message.tool_calls![0]!.function).toEqual({ name: 'service_status', arguments: '{"unit":"nginx"}' });
    expect(result.tokensUsed).toEqual({ input: 900, output: 30 });
  });

  it('runs a tool call the model wrote as text', async () => {
    const fetch = fakeFetch({ message: { content: 'Let me check.\n```json\n{"name": "disk_usage", "arguments": {}}\n```' } });
    const result = await new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch }).chatWithTools({ messages: [], tools });
    expect(result.message.tool_calls).toHaveLength(1);
    expect(result.message.tool_calls![0]!.function).toEqual({ name: 'disk_usage', arguments: '{}' });
    expect(result.message.content).toBeNull();
  });

  it('returns text as the answer when there is no call', async () => {
    const fetch = fakeFetch({ message: { content: 'The disk is 40% full.' }, done_reason: 'stop' });
    const result = await new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch }).chatWithTools({ messages: [], tools });
    expect(result).toMatchObject({ finishReason: 'stop', message: { content: 'The disk is 40% full.' } });
  });

  it('says clearly when Ollama is down or errors', async () => {
    const down = new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch: vi.fn().mockRejectedValue(new TypeError('fetch failed')) });
    await expect(down.chatWithTools({ messages: [] })).rejects.toThrow('Ollama is not reachable at http://h');
    const missing = new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch: vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'model "m" not found' }) });
    await expect(missing.chatWithTools({ messages: [] })).rejects.toThrow('Ollama answered 404: model "m" not found');
  });
});

describe('OllamaProvider.parseText', () => {
  it('asks for JSON with a schema and validates the answer', async () => {
    const fetch = fakeFetch({ message: { content: '{"total": 12, "used": 3,}' }, prompt_eval_count: 50, eval_count: 9 });
    const schema = z.object({ total: z.number(), used: z.number() });
    const result = await new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch }).parseText({ rawOutput: 'x', command: 'free -m', schema });
    expect(result.data).toEqual({ total: 12, used: 3 }); // repaired trailing comma
    expect(sentBody(fetch).format).toMatchObject({ type: 'object', required: ['total', 'used'] });
    expect(sentBody(fetch).options.temperature).toBe(0);
  });

  it('takes plain text for a string schema', async () => {
    const fetch = fakeFetch({ message: { content: '  a short summary  ' } });
    const result = await new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch }).parseText({ rawOutput: 'x', command: 'summarize', schema: z.string() });
    expect(result.data).toBe('a short summary');
    expect(sentBody(fetch).format).toBeUndefined();
  });
});

describe('toOllamaMessages', () => {
  it('turns arguments into objects and names tool results', () => {
    expect(toOllamaMessages([
      { role: 'system', content: 's' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'disk_usage', arguments: '{"x":1}' } }] },
      { role: 'tool', content: 'out', tool_call_id: 'c1' },
    ])).toEqual([
      { role: 'system', content: 's' },
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'disk_usage', arguments: { x: 1 } } }] },
      { role: 'tool', content: 'out', tool_name: 'disk_usage' },
    ]);
  });
});

// EX10.1 follow-up: replies stream; only silence times out
describe('OllamaProvider streaming', () => {
  /** A fetch whose reply is NDJSON chunks sent `gapMs` apart; aborting the request errors the body, as real fetch does */
  function streamingFetch(lines: unknown[], gapMs = 0, opts: { stallAfter?: number } = {}) {
    return vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          init.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          for (let i = 0; i < lines.length; i++) {
            if (opts.stallAfter !== undefined && i >= opts.stallAfter) return; // goes quiet
            if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
            if (init.signal.aborted) return;
            controller.enqueue(encoder.encode(`${JSON.stringify(lines[i])}\n`));
          }
          controller.close();
        },
      });
      return new Response(body, { status: 200 });
    });
  }
  const tokens = (n: number) => Array.from({ length: n }, (_, i) => ({ model: 'm', message: { role: 'assistant', content: `t${i} ` }, done: false }));

  it('assembles content, tool calls and the final counts', async () => {
    const fetch = streamingFetch([
      { model: 'm', message: { role: 'assistant', content: 'Checking ' }, done: false },
      { model: 'm', message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'uptime', arguments: {} } }] }, done: false },
      { model: 'm', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 900, eval_count: 12 },
    ]);
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'm', contextWindow: 8192, fetch: fetch as never });
    const r = await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }], tools: [{ type: 'function', function: { name: 'uptime', parameters: { type: 'object', properties: {} } } }] });
    expect(r.message.tool_calls![0]!.function).toEqual({ name: 'uptime', arguments: '{}' });
    expect(r.message.content).toBe('Checking ');
    expect(r.tokensUsed).toEqual({ input: 900, output: 12 });
  });

  it('reports a length stop from the final chunk', async () => {
    const fetch = streamingFetch([...tokens(3), { model: 'm', message: { role: 'assistant', content: '' }, done: true, done_reason: 'length', prompt_eval_count: 10, eval_count: 3 }]);
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch: fetch as never });
    const r = await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.finishReason).toBe('length');
    expect(r.message.content).toBe('t0 t1 t2 ');
  });

  it('never cuts a long reply that keeps coming', async () => {
    // 12 chunks, 25 ms apart (300 ms in all), with a 100 ms silence limit
    const fetch = streamingFetch([...tokens(12), { model: 'm', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }], 25);
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch: fetch as never, firstChunkTimeoutMs: 100, idleTimeoutMs: 100 });
    const r = await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.message.content!.split(' ').filter(Boolean)).toHaveLength(12);
  });

  it('times out when the reply goes quiet, saying how far it got', async () => {
    const fetch = streamingFetch(tokens(10), 5, { stallAfter: 4 });
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch: fetch as never, firstChunkTimeoutMs: 200, idleTimeoutMs: 60, maxIdleWaitMs: 60 });
    const err = await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e);
    expect(isLLMTimeout(err)).toBe(true);
    expect(err).toBeInstanceOf(LLMTimeoutError);
    expect(err).toMatchObject({ phase: 'idle', received: 4, message: 'Ollama stopped sending for 0 s, 4 tokens into the reply' });
  });

  it('times out when nothing comes back at first, and says so plainly', async () => {
    const quiet = streamingFetch(tokens(3), 0, { stallAfter: 0 });
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'big', fetch: quiet as never, firstChunkTimeoutMs: 50, idleTimeoutMs: 50, maxFirstChunkWaitMs: 50 });
    const err = await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'LLMTimeoutError', phase: 'first-token' });
    expect((err as Error).message).toMatch(/^Ollama did not start answering within 0 s \(big may still be loading/);

    // no response at all before the deadline
    const hung = vi.fn((_u: string, init: { signal: AbortSignal }) => new Promise<Response>((_res, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));
    const p2 = new OllamaProvider({ baseUrl: 'http://h', model: 'big', fetch: hung as never, firstChunkTimeoutMs: 50, maxFirstChunkWaitMs: 50 });
    await expect(p2.chatWithTools({ messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ name: 'LLMTimeoutError', phase: 'first-token' });
  });

  it('keeps "not reachable" for a refused connection, and reports errors sent mid-stream', async () => {
    const refused = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch: refused });
    await expect(p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('Ollama is not reachable at http://h: fetch failed');
    const broken = streamingFetch([...tokens(2), { error: 'model runner has unexpectedly stopped' }]);
    const p2 = new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch: broken as never });
    await expect(p2.chatWithTools({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('Ollama answered: model runner has unexpectedly stopped');
  });
});

// EX10.13: garbled replies are cut off while streaming; a slow start is checked before giving up
describe('OllamaProvider garbled replies (EX10.13)', () => {
  it('calls text garbled when it ends in one long run, or its tail holds two characters at most', () => {
    expect(isDegenerate('The disk is 40% full. '.repeat(40))).toBe(false);
    expect(isDegenerate(`Header\n${'-'.repeat(150)}\nrow`)).toBe(false);
    expect(isDegenerate(`{"value": "${'0'.repeat(DEGENERATE_RUN)}`)).toBe(true);
    expect(isDegenerate('ab'.repeat(DEGENERATE_WINDOW / 2))).toBe(true);
    expect(isDegenerate('ab'.repeat(DEGENERATE_WINDOW / 2 - 1))).toBe(false); // not enough yet
  });

  it('stops the stream as soon as the reply breaks down, and closes the request', async () => {
    let pulled = 0;
    let cancelled = false;
    const encoder = new TextEncoder();
    const chunk = (content: string, done = false) => encoder.encode(`${JSON.stringify({ model: 'm', message: { role: 'assistant', content }, done })}\n`);
    const fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled === 1) controller.enqueue(chunk('Here is the view: '));
        else if (pulled <= 5_000) controller.enqueue(chunk('\n'));
        else { controller.enqueue(chunk('', true)); controller.close(); }
      },
      cancel() { cancelled = true; },
    }), { status: 200 }));
    const p = new OllamaProvider({ baseUrl: 'http://h', model: 'm', fetch: fetch as never });
    const err = await p.chatWithTools({ messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e);
    expect(isLLMDegenerate(err)).toBe(true);
    expect(err).toMatchObject({ received: 'Here is the view: '.length + DEGENERATE_RUN }); // cut the moment the run reaches the limit
    expect((err as Error).message).toMatch(/^Ollama's reply broke down into repeated characters after \d+ characters and was stopped$/);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(400);
  });
});

describe('OllamaProvider silences (EX10.13)', () => {
  /** /api/chat answers (headers and first chunk together, as Ollama does) after `firstChunkAfterMs`, or never */
  function ollamaFetch(firstChunkAfterMs: number | null, probe: () => Promise<Response>) {
    let probes = 0;
    const fn = vi.fn((url: string, init: { signal: AbortSignal }) => {
      if (url.endsWith('/api/ps')) { probes++; return probe(); }
      return new Promise<Response>((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        if (firstChunkAfterMs !== null) {
          setTimeout(() => resolve(new Response(`${JSON.stringify({ model: 'm', message: { role: 'assistant', content: 'ready' }, done: true, done_reason: 'stop' })}\n`, { status: 200 })), firstChunkAfterMs);
        }
      });
    });
    return { fn, probes: () => probes };
  }
  const up = async () => new Response('{"models":[]}', { status: 200 });
  const ask = (fetch: unknown, o: { first?: number; step?: number; max?: number } = {}) =>
    new OllamaProvider({ baseUrl: 'http://h', model: 'big', fetch: fetch as never, firstChunkTimeoutMs: o.first ?? 20, stallStepMs: o.step ?? 20, maxFirstChunkWaitMs: o.max ?? 400 })
      .chatWithTools({ messages: [{ role: 'user', content: 'x' }] });

  it('waits on while Ollama answers its status check, and gets the reply', async () => {
    const f = ollamaFetch(110, up);
    const r = await ask(f.fn);
    expect(r.message.content).toBe('ready');
    expect(f.probes()).toBeGreaterThanOrEqual(2);
    expect(f.fn.mock.calls.filter(([u]) => String(u).endsWith('/api/chat'))).toHaveLength(1); // never asked again
  });

  it('gives up at the limit, saying Ollama is up but slow', async () => {
    const f = ollamaFetch(null, up);
    const err = await ask(f.fn, { max: 80 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'LLMTimeoutError', phase: 'first-token', alive: true });
    expect((err as Error).message).toMatch(/^Ollama did not start answering within 0 s; it is running, but this prompt may be too long for big on this machine$/);
    expect(f.probes()).toBe(3); // at 20, 40 and 60 ms; at 80 the limit is reached
  });

  it('gives up at once when the status check gets no answer', async () => {
    const f = ollamaFetch(null, () => Promise.reject(new TypeError('fetch failed')));
    const err = await ask(f.fn).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'LLMTimeoutError', phase: 'first-token', alive: false });
    expect((err as Error).message).toBe('Ollama stopped answering: nothing after 0 s, and no answer to a status check');
    expect(f.probes()).toBe(1);
  });

  /** /api/chat sends a few tokens, goes quiet for `pauseMs` (Ollama writing a tool call), then the call */
  function pausingFetch(pauseMs: number | null, probe: () => Promise<Response>) {
    let probes = 0;
    const fn = vi.fn(async (url: string, init: { signal: AbortSignal }) => {
      if (url.endsWith('/api/ps')) { probes++; return probe(); }
      const encoder = new TextEncoder();
      const line = (o: unknown) => encoder.encode(`${JSON.stringify(o)}
`);
      return new Response(new ReadableStream<Uint8Array>({
        async start(controller) {
          init.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          for (let i = 0; i < 3; i++) controller.enqueue(line({ model: 'm', message: { role: 'assistant', content: `t${i} ` }, done: false }));
          if (pauseMs === null) return;
          await new Promise((r) => setTimeout(r, pauseMs));
          if (init.signal.aborted) return;
          controller.enqueue(line({ model: 'm', message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'update_view', arguments: { view: {} } } }] }, done: false }));
          controller.enqueue(line({ model: 'm', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }));
          controller.close();
        },
      }), { status: 200 });
    });
    return { fn, probes: () => probes };
  }
  const midReply = (fetch: unknown, max = 400) =>
    new OllamaProvider({ baseUrl: 'http://h', model: 'big', fetch: fetch as never, idleTimeoutMs: 20, stallStepMs: 20, maxIdleWaitMs: max })
      .chatWithTools({ messages: [{ role: 'user', content: 'x' }], tools: [{ type: 'function', function: { name: 'update_view', parameters: { type: 'object', properties: {} } } }] });

  it('waits out a silence mid-reply while Ollama is up: it is writing a tool call', async () => {
    const f = pausingFetch(110, up);
    const r = await midReply(f.fn);
    expect(r.message.tool_calls?.[0]?.function.name).toBe('update_view');
    expect(f.probes()).toBeGreaterThanOrEqual(2);
  });

  it('gives up mid-reply at once when the status check gets no answer', async () => {
    const f = pausingFetch(null, () => Promise.reject(new TypeError('fetch failed')));
    const err = await midReply(f.fn).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'LLMTimeoutError', phase: 'idle', received: 3, alive: false });
    expect((err as Error).message).toBe('Ollama stopped answering 3 tokens into the reply: nothing for 0 s, and no answer to a status check');
  });

  it('gives up mid-reply at the limit, saying the reply seems stuck', async () => {
    const f = pausingFetch(null, up);
    const err = await midReply(f.fn, 80).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'LLMTimeoutError', phase: 'idle', alive: true });
    expect((err as Error).message).toBe('Ollama sent nothing for 0 s, 3 tokens into the reply; it is running, but the reply seems stuck');
  });

  it('keeps a reply that starts while the status check is still out', async () => {
    const slowNo = () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response('', { status: 500 })), 40));
    const f = ollamaFetch(30, slowNo);
    const r = await ask(f.fn);
    expect(r.message.content).toBe('ready');
  });
});
