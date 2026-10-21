// EX8.21: the model router is re-keyed at runtime (Settings → AI)
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } };
    responses = { parse: vi.fn() };
  },
}));

import { ModelRouter, NO_KEY_MESSAGE } from '../../src/llm/model-router.js';
import { ServiceContainer } from '../../src/services/container.js';
import { llmRoutes } from '../../src/routes/llm.js';

async function bootRouter(apiKey: string) {
  const router = new ModelRouter('model-router', { apiKey });
  const container = new ServiceContainer();
  container.register('model-router', router);
  await container.boot();
  return router;
}

describe('ModelRouter key at runtime', () => {
  it('has no providers without a key, and says how to add one', async () => {
    const router = await bootRouter('');
    expect(router.hasApiKey()).toBe(false);
    expect(router.hasProvider('reasoning')).toBe(false);
    expect(() => router.getModel('reasoning')).toThrow(NO_KEY_MESSAGE);
  });

  it('builds every role once a key is set, and drops them when it is cleared', async () => {
    const router = await bootRouter('');
    router.setApiKey('sk-live');
    expect(router.hasApiKey()).toBe(true);
    for (const role of ['reasoning', 'structured-output', 'fast', 'weak'] as const) {
      expect(router.hasProvider(role), role).toBe(true);
    }
    router.setApiKey('');
    expect(router.hasProvider('fast')).toBe(false);
  });
});

describe('Settings → AI reaches the agents', () => {
  class FakePipeline {
    llmProvider: unknown = null;
    setLLMProvider(p: unknown) { this.llmProvider = p; }
  }

  async function build() {
    const onChange = vi.fn();
    const pipeline = new FakePipeline();
    const app = Fastify();
    await app.register(llmRoutes, { pipeline: pipeline as never, onChange });
    return { app, pipeline, onChange };
  }

  it('passes the new provider and key on save, the provider alone on a model switch', async () => {
    const { app, pipeline, onChange } = await build();
    await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'openai', apiKey: 'sk-a' } });
    expect(onChange).toHaveBeenLastCalledWith(pipeline.llmProvider, 'sk-a');
    await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'openai', model: 'gpt-4.1' } });
    expect(onChange).toHaveBeenLastCalledWith(pipeline.llmProvider, undefined);
  });

  it('turns everything off with provider none', async () => {
    const { app, onChange } = await build();
    await app.inject({ method: 'PUT', url: '/api/llm/config', payload: { provider: 'none' } });
    expect(onChange).toHaveBeenLastCalledWith(null, '');
  });
});
