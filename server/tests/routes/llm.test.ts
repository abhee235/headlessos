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
    expect(cfg).toEqual({ provider: 'none', model: 'gpt-6-luna', hasApiKey: false, keySource: null });
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
