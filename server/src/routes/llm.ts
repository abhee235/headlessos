// M10.7: LLM Configuration Routes — get/set LLM provider config at runtime
// EX8.20: GPT-6 Luna is the default; a model change without a key keeps the key in memory
// EX8.21: changes reach the agents and Dynamic UI through onChange
// EX8.22: saved encrypted to ~/.headlessos/llm.json, so they survive restarts
// @see docs/PROGRESS.md

import type { FastifyInstance } from 'fastify';
import type { ParsingPipeline } from '../parsers/pipeline.js';
import type { LLMProvider } from '../llm/provider.js';
import { DEFAULT_OPENAI_MODEL, OpenAIProvider } from '../llm/providers/openai.js';

/** EX8.22: where the active key came from */
export type KeySource = 'settings' | 'env' | null;

interface LLMConfig {
  provider: 'openai' | 'none';
  model: string;
  hasApiKey: boolean;
  keySource: KeySource;
}

interface LLMRouteOpts {
  pipeline: ParsingPipeline;
  /**
   * EX8.21: called after every change so the investigation agent, Dynamic UI and
   * the UI Agent's model router use it too. `apiKey` is set only when a new key
   * was entered ('' when the LLM was turned off).
   */
  onChange?: (provider: LLMProvider | null, apiKey?: string) => void;
  /** EX8.22: save to / clear from disk (encrypted); omitted in tests */
  persist?: {
    save: (update: { model: string; apiKey?: string }) => void;
    clear: () => void;
  };
  /** EX8.22: where the startup key came from */
  keySource?: KeySource;
}

export async function llmRoutes(app: FastifyInstance, opts: LLMRouteOpts): Promise<void> {
  const { pipeline, onChange, persist } = opts;
  let keySource: KeySource = opts.keySource ?? null;
  const currentProvider = () => (pipeline as unknown as { llmProvider?: LLMProvider & { model?: string } }).llmProvider;

  /** true when saved (or nothing to save); false when the disk write failed */
  function tryPersist(fn: () => void): boolean {
    if (!persist) return false;
    try { fn(); return true; } catch (err) {
      console.warn('⚠️  Could not save LLM settings:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  // ── GET /api/llm/config — current LLM configuration ──
  app.get('/api/llm/config', async () => {
    const provider = currentProvider();
    const config: LLMConfig = {
      provider: provider ? (provider.name as 'openai') : 'none',
      model: provider?.model ?? DEFAULT_OPENAI_MODEL,
      hasApiKey: !!provider,
      keySource: provider ? keySource : null,
    };
    return { success: true, data: config };
  });

  // ── PUT /api/llm/config — update LLM configuration ──
  app.put<{ Body: { provider: string; apiKey?: string; model?: string } }>(
    '/api/llm/config',
    async (req) => {
      const { provider, apiKey, model } = req.body;

      if (provider === 'none') {
        // Disable LLM
        pipeline.setLLMProvider(undefined as unknown as import('../llm/provider.js').LLMProvider);
        onChange?.(null, '');
        keySource = null;
        const persisted = tryPersist(() => persist?.clear());
        return { success: true, data: { provider: 'none', model: '', hasApiKey: false, keySource, persisted } };
      }

      if (provider === 'openai') {
        const chosen = model ?? DEFAULT_OPENAI_MODEL;
        const current = currentProvider();
        // EX8.20: no new key → keep the one already in memory and only switch model
        let llmProvider: OpenAIProvider;
        if (apiKey) llmProvider = new OpenAIProvider(apiKey, chosen);
        else if (current instanceof OpenAIProvider) llmProvider = current.withModel(chosen);
        else return { success: false, error: 'API key is required for OpenAI provider' };
        pipeline.setLLMProvider(llmProvider);
        onChange?.(llmProvider, apiKey || undefined);
        if (apiKey) keySource = 'settings';
        // EX8.22: the model always, the key only when a new one was entered
        const persisted = tryPersist(() => persist?.save({ model: chosen, ...(apiKey ? { apiKey } : {}) }));
        console.log(`🤖 LLM provider updated: OpenAI (${chosen})${persisted ? ' — saved' : ' — this session only'}`);
        return {
          success: true,
          data: {
            provider: 'openai',
            model: chosen,
            hasApiKey: true,
            keySource,
            persisted,
          },
        };
      }

      return { success: false, error: `Unknown provider: ${provider}` };
    },
  );

  // ── GET /api/llm/models — available models per provider ──
  app.get('/api/llm/models', async () => {
    return {
      success: true,
      data: {
        openai: [
          { id: 'gpt-6-luna', name: 'GPT-6 Luna', description: 'Default — newest, 1M context, $0.10 / $0.50 per 1M tokens', recommended: true },
          { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: 'Fastest, lowest cost — classification & summaries' },
          { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Fast, affordable — parsing' },
          { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Structured output, schema generation' },
          { id: 'gpt-4o', name: 'GPT-4o', description: 'Capable general-purpose model' },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Legacy mini model' },
          { id: 'o4-mini', name: 'o4-mini', description: 'Reasoning model' },
          { id: 'gpt-5.4', name: 'GPT-5.4', description: 'Most capable, highest cost — planning & reflection' },
        ],
      },
    };
  });
}
