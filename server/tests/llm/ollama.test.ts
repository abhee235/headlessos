// EX9.3: Ollama provider
// @see docs/phases/phase-ex9.md §8

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  OllamaProvider, checkOllamaUrl, listOllamaModels, ollamaContextWindow, toOllamaMessages,
  DEFAULT_OLLAMA_CONTEXT,
} from '../../src/llm/providers/ollama.js';

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

  it('reads the context window from num_ctx or model_info, capped', async () => {
    expect(await ollamaContextWindow('http://h', 'm', fakeFetch({ parameters: 'temperature 0.7\nnum_ctx 4096' }))).toBe(4096);
    expect(await ollamaContextWindow('http://h', 'm', fakeFetch({ model_info: { 'qwen3.context_length': 40960 } }))).toBe(16384);
    expect(await ollamaContextWindow('http://h', 'm', vi.fn().mockRejectedValue(new Error('down')))).toBe(DEFAULT_OLLAMA_CONTEXT);
  });
});

describe('OllamaProvider.chatWithTools', () => {
  const tools = [{ type: 'function' as const, function: { name: 'disk_usage', description: 'Disk usage', parameters: { type: 'object', properties: {} } } }];

  it('posts /api/chat with tools, num_ctx and no streaming, and reads object arguments', async () => {
    const fetch = fakeFetch({
      model: 'qwen3:8b',
      message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'service_status', arguments: { unit: 'nginx' } } }] },
      done_reason: 'stop', prompt_eval_count: 900, eval_count: 30,
    });
    const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:11434/', model: 'qwen3:8b', contextWindow: 8192, fetch });
    const result = await provider.chatWithTools({ messages: [{ role: 'user', content: 'is nginx up?' }], tools });

    expect(fetch.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/chat');
    expect(sentBody(fetch)).toMatchObject({ model: 'qwen3:8b', stream: false, tools, options: { num_ctx: 8192 } });
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
