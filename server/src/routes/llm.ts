// M10.7: LLM Configuration Routes — get/set LLM provider config at runtime
// EX8.20: GPT-6 Luna is the default; a model change without a key keeps the key in memory
// @see docs/PROGRESS.md

import type { FastifyInstance } from 'fastify';
import type { ParsingPipeline } from '../parsers/pipeline.js';
import type { LLMProvider } from '../llm/provider.js';
import { DEFAULT_OPENAI_MODEL, OpenAIProvider } from '../llm/providers/openai.js';

interface LLMConfig {
  provider: 'openai' | 'none';
  model: string;
  hasApiKey: boolean;
}

interface LLMRouteOpts {
  pipeline: ParsingPipeline;
}

export async function llmRoutes(app: FastifyInstance, opts: LLMRouteOpts): Promise<void> {
  const { pipeline } = opts;
  const currentProvider = () => (pipeline as unknown as { llmProvider?: LLMProvider & { model?: string } }).llmProvider;

  // ── GET /api/llm/config — current LLM configuration ──
  app.get('/api/llm/config', async () => {
    const provider = currentProvider();
    const config: LLMConfig = {
      provider: provider ? (provider.name as 'openai') : 'none',
      model: provider?.model ?? DEFAULT_OPENAI_MODEL,
      hasApiKey: !!provider,
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
        return { success: true, data: { provider: 'none', model: '', hasApiKey: false } };
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
        console.log(`🤖 LLM provider updated: OpenAI (${chosen})`);
        return {
          success: true,
          data: {
            provider: 'openai',
            model: chosen,
            hasApiKey: true,
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
