// EX8.20: LLM config routes — GPT-6 Luna default, model switch keeps the key
// EX8.22: saved through `persist`, key source reported
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

const create = vi.fn(async () => ({
  choices: [{ message: { content: 'ok', tool_calls: undefined }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
}));
const clients: Array<{ apiKey: string }> = [];
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
    responses = { parse: vi.fn() };
    constructor(opts: { apiKey: string }) { clients.push(opts); }
  },
}));

import { llmRoutes } from '../../src/routes/llm.js';
import { OpenAIProvider, toolCallParams } from '../../src/llm/providers/openai.js';

class FakePipeline {
  llmProvider: unknown = null;
  setLLMProvider(p: unknown) { this.llmProvider = p; }
}

async function build(pipeline = new FakePipeline()) {
  const app = Fastify();
  await app.register(llmRoutes, { pipeline: pipeline as never });
  return { app, pipeline };
}

describe('LLM config routes', () => {
  it('lists GPT-6 Luna first, as the one recommended model', async () => {
    const { app } = await build();
    const models = (await app.inject({ method: 'GET', url: '/api/llm/models' })).json().data.openai;
    expect(models[0]).toMatchObject({ id: 'gpt-6-luna', name: 'GPT-6 Luna', recommended: true });
    expect(models.filter((m: { recommended?: boolean }) => m.recommended)).toHaveLength(1);
  });

  it('defaults to GPT-6 Luna, and reports no key without one', async () => {
    const { app } = await build();
    const cfg = (await app.inject({ method: 'GET', url: '/api/llm/config' })).json().data;
    expect(cfg).toEqual({ provider: 'none', model: 'gpt-6-luna', hasApiKey: false, keySource: null, contextOptions: [8192, 16384, 32768, 65536, 131072] });
    const put = await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'openai', apiKey: 'sk-x' } });
    expect(put.json()).toMatchObject({ success: true, data: { model: 'gpt-6-luna' } });
  });

  it('switches model without a new key, keeping the key in memory and out of the response', async () => {
    const { app, pipeline } = await build();
    await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'openai', apiKey: 'sk-test-123', model: 'gpt-4.1' } });
    const first = pipeline.llmProvider as OpenAIProvider;
    const res = await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'openai', model: 'gpt-6-luna' } });
    expect(res.json()).toEqual({ success: true, data: { provider: 'openai', model: 'gpt-6-luna', hasApiKey: true, keySource: 'settings', persisted: false } });
    expect(res.body).not.toContain('sk-test-123');
    const second = pipeline.llmProvider as OpenAIProvider;
    expect(second).not.toBe(first);
    expect(second.model).toBe('gpt-6-luna');
    // the same SDK client (the same key) is reused, not a new one without a key
    expect((second as unknown as { client: unknown }).client).toBe((first as unknown as { client: unknown }).client);
    const cfg = (await app.inject({ method: 'GET', url: '/api/llm/config' })).body;
    expect(cfg).not.toContain('sk-test-123');
  });

  it('saves the key once, then only the model; None clears it', async () => {
    const persist = { save: vi.fn(), clear: vi.fn() };
    const app = Fastify();
    await app.register(llmRoutes, { pipeline: new FakePipeline() as never, persist, keySource: null });
    await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'openai', apiKey: 'sk-a', model: 'gpt-4.1' } });
    expect(persist.save).toHaveBeenLastCalledWith({ model: 'gpt-4.1', apiKey: 'sk-a' });
    const sw = await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'openai', model: 'gpt-6-luna' } });
    expect(persist.save).toHaveBeenLastCalledWith({ model: 'gpt-6-luna' });
    expect(sw.json().data).toMatchObject({ keySource: 'settings', persisted: true });
    const off = await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'none' } });
    expect(persist.clear).toHaveBeenCalledOnce();
    expect(off.json().data).toMatchObject({ hasApiKey: false, keySource: null, persisted: true });
  });

  it('reports a failed save instead of pretending', async () => {
    const persist = { save: vi.fn(() => { throw new Error('EACCES'); }), clear: vi.fn() };
    const app = Fastify();
    await app.register(llmRoutes, { pipeline: new FakePipeline() as never, persist });
    const res = await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'openai', apiKey: 'sk-a' } });
    expect(res.json()).toMatchObject({ success: true, data: { hasApiKey: true, persisted: false } });
  });

  it('still asks for a key when none is in memory', async () => {
    const { app } = await build();
    const res = await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'openai', model: 'gpt-4.1' } });
    expect(res.json()).toEqual({ success: false, error: 'API key is required for OpenAI provider' });
  });
});

// EX9.3: Ollama (a local model) as the provider
describe('LLM config routes — Ollama', () => {
  const TAGS = { models: [{ name: 'qwen3:8b', details: { parameter_size: '8.2B', family: 'qwen3' } }, { name: 'llama3.2:latest' }] };
  const SHOW = { model_info: { 'qwen3.context_length': 40960 } };
  function ollamaFetch(opts: { down?: boolean } = {}) {
    return vi.fn(async (url: string) => {
      if (opts.down) throw new TypeError('fetch failed');
      const body = url.endsWith('/api/tags') ? TAGS : url.endsWith('/api/show') ? SHOW : {};
      return { ok: true, status: 200, json: async () => body, text: async () => '' } as unknown as Response;
    });
  }
  async function buildOllama(fetchImpl = ollamaFetch()) {
    const pipeline = new FakePipeline();
    const persist = { save: vi.fn(), clear: vi.fn() };
    const onChange = vi.fn();
    const app = Fastify();
    await app.register(llmRoutes, { pipeline: pipeline as never, persist, onChange, ollama: { fetch: fetchImpl as never } });
    return { app, pipeline, persist, onChange };
  }
  const put = (app: Awaited<ReturnType<typeof buildOllama>>['app'], payload: unknown) =>
    app.inject({ method: 'PUT', url: '/api/llm/config', payload: payload as Record<string, unknown> }).then((r) => r.json());

  it('lists installed models for the picker, loopback only unless allowed', async () => {
    const { app } = await buildOllama();
    const list = (await app.inject({ method: 'GET', url: '/api/llm/ollama/models?baseUrl=http://127.0.0.1:11434' })).json();
    expect(list).toEqual({ success: true, data: [{ name: 'qwen3:8b', parameterSize: '8.2B', family: 'qwen3' }, { name: 'llama3.2:latest' }] });
    const remote = (await app.inject({ method: 'GET', url: '/api/llm/ollama/models?baseUrl=http://10.0.0.7:11434' })).json();
    expect(remote).toMatchObject({ success: false, error: expect.stringContaining('another machine') });
    const allowed = (await app.inject({ method: 'GET', url: '/api/llm/ollama/models?baseUrl=http://10.0.0.7:11434&allowRemote=true' })).json();
    expect(allowed.success).toBe(true);
  });

  // EX10.1: Auto = the lowest of the trained length (40,960 here) and 64K
  const TRAINED = { contextWindow: 40960, source: 'trained', trainedContext: 40960, maxOutputTokens: 5120, local: true };

  it('switches to an installed model, sized to its context, and saves it', async () => {
    const { app, pipeline, persist, onChange } = await buildOllama();
    const res = await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://localhost:11434/', model: 'qwen3:8b' } });
    expect(res).toEqual({
      success: true,
      data: {
        provider: 'ollama', model: 'qwen3:8b', hasApiKey: true, keySource: null, persisted: true,
        ollama: { baseUrl: 'http://localhost:11434', model: 'qwen3:8b', limits: TRAINED },
      },
    });
    expect((pipeline.llmProvider as { name: string }).name).toBe('ollama');
    expect(onChange).toHaveBeenCalledWith(pipeline.llmProvider);
    expect(persist.save).toHaveBeenLastCalledWith({ provider: 'ollama', ollama: { baseUrl: 'http://localhost:11434', model: 'qwen3:8b' } });
    const cfg = (await app.inject({ method: 'GET', url: '/api/llm/config' })).json().data;
    expect(cfg).toMatchObject({
      provider: 'ollama', model: 'qwen3:8b', keySource: null,
      ollama: { limits: TRAINED, residency: { loaded: false, onCpu: false } },
      contextOptions: [8192, 16384, 32768, 65536, 131072],
    });
  });

  it('applies and saves the owner’s window, and refuses one that is not offered (EX10.1)', async () => {
    const { app, pipeline, persist } = await buildOllama();
    const res = await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 16384 } });
    expect(res.data.ollama.limits).toMatchObject({ contextWindow: 16384, source: 'owner', trainedContext: 40960 });
    expect(persist.save).toHaveBeenLastCalledWith({ provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 16384 } });
    expect((pipeline.llmProvider as { contextWindow: number }).contextWindow).toBe(16384);
    // a window above the trained length is held to it
    const big = await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 131072 } });
    expect(big.data.ollama.limits).toMatchObject({ contextWindow: 40960, source: 'trained' });
    const auto = await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 'auto' } });
    expect(auto.data.ollama).not.toHaveProperty('contextWindow');
    const bad = await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 12345 } });
    expect(bad).toMatchObject({ success: false, error: expect.stringContaining('context window of Auto or 8192') });
  });

  it('reports a model that spilled to the CPU (EX10.1)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const body = url.endsWith('/api/tags') ? TAGS : url.endsWith('/api/show') ? SHOW
        : url.endsWith('/api/ps') ? { models: [{ name: 'qwen3:8b', size: 9_000_000_000, size_vram: 6_000_000_000, context_length: 40960 }] } : {};
      return { ok: true, status: 200, json: async () => body, text: async () => '' } as unknown as Response;
    });
    const { app } = await buildOllama(fetchImpl as never);
    await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' } });
    const cfg = (await app.inject({ method: 'GET', url: '/api/llm/config' })).json().data;
    expect(cfg.ollama.residency).toEqual({ loaded: true, contextLength: 40960, sizeBytes: 9_000_000_000, vramBytes: 6_000_000_000, onCpu: true });
  });

  it('accepts a model name without its :latest tag', async () => {
    const { app } = await buildOllama();
    const res = await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'llama3.2' } });
    expect(res.data.model).toBe('llama3.2:latest');
  });

  it('refuses to switch when Ollama is down, the model is missing, or the URL is remote', async () => {
    const down = await buildOllama(ollamaFetch({ down: true }));
    const r1 = await put(down.app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' } });
    expect(r1).toMatchObject({ success: false, error: expect.stringContaining('Ollama is not reachable at http://127.0.0.1:11434') });
    expect(down.pipeline.llmProvider).toBeNull();

    const { app, pipeline } = await buildOllama();
    const r2 = await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'mistral' } });
    expect(r2).toEqual({ success: false, error: 'Model "mistral" is not installed in Ollama. Installed: qwen3:8b, llama3.2:latest' });
    const r3 = await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://10.0.0.7:11434', model: 'qwen3:8b' } });
    expect(r3.success).toBe(false);
    const r4 = await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'bad name; rm' } });
    expect(r4).toMatchObject({ success: false, error: expect.stringContaining('Choose an Ollama URL, a model') });
    expect(pipeline.llmProvider).toBeNull();
  });

  it('goes back to OpenAI without asking for the key again', async () => {
    const { app, pipeline } = await buildOllama();
    await put(app, { provider: 'openai', apiKey: 'sk-mem', model: 'gpt-4.1' });
    const openai = pipeline.llmProvider as OpenAIProvider;
    await put(app, { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' } });
    const back = await put(app, { provider: 'openai', model: 'gpt-6-luna' });
    expect(back).toMatchObject({ success: true, data: { provider: 'openai', model: 'gpt-6-luna' } });
    expect((pipeline.llmProvider as unknown as { client: unknown }).client).toBe((openai as unknown as { client: unknown }).client);
  });
});

describe('OpenAI tool calls', () => {
  it('sends reasoning_effort none only for GPT-6 Luna with tools', () => {
    expect(toolCallParams('gpt-6-luna', true)).toEqual({ reasoning_effort: 'none' });
    expect(toolCallParams('gpt-6-luna', false)).toEqual({});
    expect(toolCallParams('gpt-4.1', true)).toEqual({});
  });

  it('uses max_completion_tokens, never the deprecated max_tokens', async () => {
    const p = new OpenAIProvider('sk-x', 'gpt-6-luna');
    await p.chatWithTools({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'f', parameters: { type: 'object', properties: {} } } }],
      maxTokens: 500,
    } as never);
    const body = create.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'none', max_completion_tokens: 500, tool_choice: 'auto' });
    expect(body).not.toHaveProperty('max_tokens');
  });
});
