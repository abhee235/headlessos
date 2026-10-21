// EX2.1: Multi-Model Router — Unit Tests
// @see docs/phases/phase-ex2.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRouter } from '../../src/llm/model-router.js';
import { ServiceContainer } from '../../src/services/container.js';
import type {
  LLMProvider,
  ParseTextInput,
  ParseResult,
  ChatWithToolsInput,
  ChatWithToolsResult,
  ChatMessage,
} from '../../src/llm/provider.js';
import type { LLMUsageTracker } from '../../src/llm/usage-tracker.js';
import {
  type ModelConfig,
  type ModelRole,
  MODEL_ROLES,
  DEFAULT_MODEL_CONFIG,
  loadModelConfig,
  roleToConfigKey,
} from '../../src/config/models.js';

// ── Mock OpenAIProvider ──
// We mock the module so ModelRouter creates mock providers instead of real ones
vi.mock('../../src/llm/providers/openai.js', () => {
  return {
    OpenAIProvider: vi.fn().mockImplementation((_apiKey: string, model = 'gpt-4o-mini') => ({
      name: 'openai',
      model,
      parseText: vi.fn().mockResolvedValue({
        data: 'mock-parsed',
        tokensUsed: { input: 10, output: 20 },
        latencyMs: 100,
        model,
      }),
      parseImage: vi.fn().mockResolvedValue({
        data: 'mock-image-parsed',
        tokensUsed: { input: 15, output: 25 },
        latencyMs: 150,
        model,
      }),
      chatWithTools: vi.fn().mockResolvedValue({
        message: { role: 'assistant', content: 'mock response' },
        tokensUsed: { input: 50, output: 100 },
        latencyMs: 500,
        model,
        finishReason: 'stop',
      }),
    })),
  };
});

// ── Helpers ──

function createMockUsageTracker(): LLMUsageTracker {
  return {
    recordCall: vi.fn(),
    getSummary: vi.fn().mockReturnValue({ totalCalls: 0 }),
    reset: vi.fn(),
    totalCallCount: 0,
  } as unknown as LLMUsageTracker;
}

// Default config used by tests (isolated from env vars)
const TEST_CONFIG: ModelConfig = {
  reasoning: { provider: 'openai', model: 'o4-mini', maxTokens: 16384 },
  structuredOutput: { provider: 'openai', model: 'gpt-4.1', maxTokens: 16384 },
  fast: { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 4096 },
  weak: { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 2048 },
};

async function createRouter(
  config?: Partial<ModelConfig>,
  usageTracker?: LLMUsageTracker,
): Promise<ModelRouter> {
  // Merge test defaults with any overrides
  const fullConfig: ModelConfig = {
    ...TEST_CONFIG,
    ...config,
  };
  const router = new ModelRouter('model-router', {
    apiKey: 'test-key',
    config: fullConfig,
    usageTracker,
  });
  const container = new ServiceContainer();
  container.register('model-router', router);
  await container.boot();
  return router;
}

// ── Tests ──

describe('ModelConfig', () => {
  describe('DEFAULT_MODEL_CONFIG', () => {
    it('has all four roles defined', () => {
      expect(DEFAULT_MODEL_CONFIG.reasoning).toBeDefined();
      expect(DEFAULT_MODEL_CONFIG.structuredOutput).toBeDefined();
      expect(DEFAULT_MODEL_CONFIG.fast).toBeDefined();
      expect(DEFAULT_MODEL_CONFIG.weak).toBeDefined();
    });

    it('reasoning uses gpt-5.4 by default', () => {
      expect(DEFAULT_MODEL_CONFIG.reasoning.model).toBe('gpt-5.4');
    });

    it('structuredOutput uses gpt-4.1 by default', () => {
      expect(DEFAULT_MODEL_CONFIG.structuredOutput.model).toBe('gpt-4.1');
    });

    it('fast uses gpt-4.1-mini by default', () => {
      expect(DEFAULT_MODEL_CONFIG.fast.model).toBe('gpt-4.1-mini');
    });

    it('weak uses gpt-4.1-nano by default', () => {
      expect(DEFAULT_MODEL_CONFIG.weak.model).toBe('gpt-4.1-nano');
    });

    it('all roles use openai provider', () => {
      expect(DEFAULT_MODEL_CONFIG.reasoning.provider).toBe('openai');
      expect(DEFAULT_MODEL_CONFIG.structuredOutput.provider).toBe('openai');
      expect(DEFAULT_MODEL_CONFIG.fast.provider).toBe('openai');
      expect(DEFAULT_MODEL_CONFIG.weak.provider).toBe('openai');
    });
  });

  describe('loadModelConfig', () => {
    const savedEnv: Record<string, string | undefined> = {};
    const envKeys = ['MODEL_REASONING', 'MODEL_STRUCTURED', 'MODEL_FAST', 'MODEL_WEAK', 'MODEL_MAX_TOKENS'];

    beforeEach(() => {
      // Save and clear all MODEL_* env vars
      for (const key of envKeys) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
    });

    it('returns defaults when no env vars set', () => {
      const config = loadModelConfig();
      expect(config.reasoning.model).toBe('gpt-5.4');
      expect(config.structuredOutput.model).toBe('gpt-4.1');
      expect(config.fast.model).toBe('gpt-4.1-mini');
      expect(config.weak.model).toBe('gpt-4.1-nano');
    });

    it('overrides reasoning model from env', () => {
      process.env.MODEL_REASONING = 'o3';
      const config = loadModelConfig();
      expect(config.reasoning.model).toBe('o3');
    });

    it('overrides structured model from env', () => {
      process.env.MODEL_STRUCTURED = 'gpt-4o';
      const config = loadModelConfig();
      expect(config.structuredOutput.model).toBe('gpt-4o');
    });

    it('overrides fast model from env', () => {
      process.env.MODEL_FAST = 'gpt-3.5-turbo';
      const config = loadModelConfig();
      expect(config.fast.model).toBe('gpt-3.5-turbo');
    });

    it('overrides weak model from env', () => {
      process.env.MODEL_WEAK = 'gpt-3.5-turbo';
      const config = loadModelConfig();
      expect(config.weak.model).toBe('gpt-3.5-turbo');
    });

    it('applies global max tokens override', () => {
      process.env.MODEL_MAX_TOKENS = '8192';
      const config = loadModelConfig();
      expect(config.reasoning.maxTokens).toBe(8192);
      expect(config.structuredOutput.maxTokens).toBe(8192);
      expect(config.fast.maxTokens).toBe(8192);
      expect(config.weak.maxTokens).toBe(8192);
    });

    afterEach(() => {
      // Restore env vars
      for (const key of envKeys) {
        if (savedEnv[key] !== undefined) {
          process.env[key] = savedEnv[key];
        } else {
          delete process.env[key];
        }
      }
    });
  });

  describe('roleToConfigKey', () => {
    it('maps reasoning → reasoning', () => {
      expect(roleToConfigKey('reasoning')).toBe('reasoning');
    });

    it('maps structured-output → structuredOutput', () => {
      expect(roleToConfigKey('structured-output')).toBe('structuredOutput');
    });

    it('maps fast → fast', () => {
      expect(roleToConfigKey('fast')).toBe('fast');
    });

    it('maps weak → weak', () => {
      expect(roleToConfigKey('weak')).toBe('weak');
    });
  });

  describe('MODEL_ROLES', () => {
    it('has exactly four roles', () => {
      expect(MODEL_ROLES).toHaveLength(4);
    });

    it('contains all expected roles', () => {
      expect(MODEL_ROLES).toContain('reasoning');
      expect(MODEL_ROLES).toContain('structured-output');
      expect(MODEL_ROLES).toContain('fast');
      expect(MODEL_ROLES).toContain('weak');
    });
  });
});

describe('ModelRouter', () => {
  describe('construction and boot', () => {
    it('creates without error', async () => {
      const router = await createRouter();
      expect(router).toBeDefined();
      expect(router.name).toBe('model-router');
    });

    it('has providers for all four roles after boot', async () => {
      const router = await createRouter();
      for (const role of MODEL_ROLES) {
        expect(router.hasProvider(role)).toBe(true);
      }
    });

    it('uses default config when no override provided', async () => {
      const router = await createRouter();
      const map = router.getModelMap();
      expect(map.reasoning).toBe('o4-mini');
      expect(map['structured-output']).toBe('gpt-4.1');
      expect(map.fast).toBe('gpt-4o-mini');
      expect(map.weak).toBe('gpt-4o-mini');
    });
  });

  describe('getModel', () => {
    it('returns a provider for each role', async () => {
      const router = await createRouter();
      for (const role of MODEL_ROLES) {
        const provider = router.getModel(role);
        expect(provider).toBeDefined();
        expect(provider.name).toBe('openai');
      }
    });

    it('returns provider with correct model for each role', async () => {
      const router = await createRouter({
        reasoning: { provider: 'openai', model: 'o3', maxTokens: 16384 },
        structuredOutput: { provider: 'openai', model: 'gpt-4o', maxTokens: 16384 },
        fast: { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 4096 },
        weak: { provider: 'openai', model: 'gpt-3.5-turbo', maxTokens: 2048 },
      });

      expect(router.getModel('reasoning').model).toBe('o3');
      expect(router.getModel('structured-output').model).toBe('gpt-4o');
      expect(router.getModel('fast').model).toBe('gpt-4o-mini');
      expect(router.getModel('weak').model).toBe('gpt-3.5-turbo');
    });

    it('deduplicates providers with same model', async () => {
      // fast and weak both default to gpt-4o-mini — should share provider
      const router = await createRouter();
      const fast = router.getModel('fast');
      const weak = router.getModel('weak');
      expect(fast).toBe(weak); // Same object reference
    });
  });

  describe('config override', () => {
    it('accepts partial config override', async () => {
      const router = await createRouter({
        reasoning: { provider: 'openai', model: 'o3', maxTokens: 32768 },
      });

      expect(router.getModel('reasoning').model).toBe('o3');
      // Other roles should keep defaults
      expect(router.getModel('structured-output').model).toBe('gpt-4.1');
      expect(router.getModel('fast').model).toBe('gpt-4o-mini');
    });

    it('getRoleConfig returns correct config for each role', async () => {
      const router = await createRouter({
        reasoning: { provider: 'openai', model: 'o3', maxTokens: 32768 },
      });

      const config = router.getRoleConfig('reasoning');
      expect(config.model).toBe('o3');
      expect(config.maxTokens).toBe(32768);
    });
  });

  describe('updateConfig', () => {
    it('updates model at runtime', async () => {
      const router = await createRouter();
      expect(router.getModel('reasoning').model).toBe('o4-mini');

      router.updateConfig({
        reasoning: { provider: 'openai', model: 'o3', maxTokens: 32768 },
      });

      expect(router.getModel('reasoning').model).toBe('o3');
    });

    it('preserves unchanged roles on partial update', async () => {
      const router = await createRouter();
      router.updateConfig({
        fast: { provider: 'openai', model: 'gpt-3.5-turbo', maxTokens: 2048 },
      });

      expect(router.getModel('fast').model).toBe('gpt-3.5-turbo');
      expect(router.getModel('reasoning').model).toBe('o4-mini'); // unchanged
    });
  });

  describe('getModelMap', () => {
    it('returns map with all four roles', async () => {
      const router = await createRouter();
      const map = router.getModelMap();
      expect(Object.keys(map)).toHaveLength(4);
      expect(map).toHaveProperty('reasoning');
      expect(map).toHaveProperty('structured-output');
      expect(map).toHaveProperty('fast');
      expect(map).toHaveProperty('weak');
    });
  });

  describe('reason()', () => {
    it('calls parseText on the reasoning model', async () => {
      const router = await createRouter();
      const { z } = await import('zod');
      const schema = z.string();

      const result = await router.reason({
        rawOutput: 'test output',
        command: 'test-cmd',
        schema,
      });

      expect(result.data).toBe('mock-parsed');
      expect(result.model).toBe('o4-mini');
    });

    it('tracks usage when tracker provided', async () => {
      const tracker = createMockUsageTracker();
      const router = await createRouter(undefined, tracker);
      const { z } = await import('zod');

      await router.reason({
        rawOutput: 'test',
        command: 'plan',
        schema: z.string(),
      });

      expect(tracker.recordCall).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'reasoning:plan',
          model: 'o4-mini',
        }),
      );
    });
  });

  describe('chat()', () => {
    it('calls chatWithTools on the structured-output model', async () => {
      const router = await createRouter();

      const result = await router.chat({
        messages: [
          { role: 'system', content: 'You are a test assistant' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(result.message.role).toBe('assistant');
      expect(result.model).toBe('gpt-4.1');
    });

    it('tracks usage when tracker provided', async () => {
      const tracker = createMockUsageTracker();
      const router = await createRouter(undefined, tracker);

      await router.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(tracker.recordCall).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'structured-output:chat-with-tools',
          model: 'gpt-4.1',
        }),
      );
    });

    it('throws if provider does not support chatWithTools', async () => {
      const router = await createRouter();
      // Remove chatWithTools from the provider
      const provider = router.getModel('structured-output');
      delete (provider as Record<string, unknown>).chatWithTools;

      await expect(router.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      })).rejects.toThrow('does not support chatWithTools');
    });
  });

  describe('fast()', () => {
    it('calls parseText on the fast model', async () => {
      const router = await createRouter();
      const { z } = await import('zod');

      const result = await router.fast({
        rawOutput: 'error context',
        command: 'analyze-error',
        schema: z.string(),
      });

      expect(result.data).toBe('mock-parsed');
      expect(result.model).toBe('gpt-4o-mini');
    });
  });

  describe('summarize()', () => {
    it('calls parseText on the weak model', async () => {
      const router = await createRouter();

      const result = await router.summarize('Long conversation text...');

      expect(result.data).toBe('mock-parsed');
      expect(result.model).toBe('gpt-4o-mini');
    });

    it('tracks usage with "summarize" command', async () => {
      const tracker = createMockUsageTracker();
      const router = await createRouter(undefined, tracker);

      await router.summarize('text');

      expect(tracker.recordCall).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'weak:summarize',
        }),
      );
    });
  });

  describe('fallback behavior', () => {
    it('falls back to fast model when reasoning unavailable', async () => {
      const router = await createRouter();
      // Simulate: clear reasoning provider
      (router as unknown as Record<string, unknown>)['providers'] = new Map([
        ['fast', router.getModel('fast')],
      ]);

      const provider = router.getModel('reasoning');
      expect(provider.model).toBe('gpt-4o-mini'); // falls back to fast
    });
  });

  describe('destroy', () => {
    it('clears all providers on destroy', async () => {
      const router = await createRouter();
      expect(router.hasProvider('reasoning')).toBe(true);

      const container = new ServiceContainer();
      container.register('model-router', router);
      // Manually call destroy
      await router.destroy();

      expect(router.hasProvider('reasoning')).toBe(false);
    });
  });

  // EX9.3: one local model for every role
  describe('useProvider (Ollama)', () => {
    const local = {
      name: 'ollama', model: 'qwen3:8b', contextWindow: 8192,
      parseText: vi.fn(), parseImage: vi.fn(),
      chatWithTools: vi.fn().mockResolvedValue({
        message: { role: 'assistant', content: 'ok' }, tokensUsed: { input: 10, output: 2 }, latencyMs: 5, model: 'qwen3:8b', finishReason: 'stop',
      }),
    };

    it('routes every role to the local model and back', async () => {
      const router = await createRouter();
      router.useProvider(local as never);
      for (const role of ['reasoning', 'structured-output', 'fast', 'weak'] as const) {
        expect(router.getModel(role)).toBe(local);
      }
      expect(router.getModelMap()).toEqual({ reasoning: 'qwen3:8b', 'structured-output': 'qwen3:8b', fast: 'qwen3:8b', weak: 'qwen3:8b' });
      expect(router.toolProvider?.contextWindow).toBe(8192);
      await router.chat({ messages: [{ role: 'user', content: 'hi' }] });
      expect(local.chatWithTools).toHaveBeenCalled();
      router.useProvider(null);
      expect(router.getModel('fast').name).toBe('openai');
    });

    it('counts as configured without an OpenAI key', async () => {
      const router = new ModelRouter('model-router', { apiKey: '' });
      expect(router.hasApiKey()).toBe(false);
      router.useProvider(local as never);
      expect(router.hasApiKey()).toBe(true);
    });
  });
});
