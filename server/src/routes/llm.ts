// M10.7: LLM Configuration Routes — get/set LLM provider config at runtime
// @see docs/PROGRESS.md

import type { FastifyInstance } from 'fastify';
import type { ParsingPipeline } from '../parsers/pipeline.js';

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

  // ── GET /api/llm/config — current LLM configuration ──
  app.get('/api/llm/config', async () => {
    const provider = (pipeline as unknown as { llmProvider?: { name: string; model?: string } }).llmProvider;
    const config: LLMConfig = {
      provider: provider ? (provider.name as 'openai') : 'none',
      model: (provider as { model?: string } | undefined)?.model ?? 'gpt-4.1-mini',
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
        if (!apiKey) {
          return { success: false, error: 'API key is required for OpenAI provider' };
        }
        const { OpenAIProvider } = await import('../llm/providers/openai.js');
        const llmProvider = new OpenAIProvider(apiKey, model ?? 'gpt-4.1-mini');
        pipeline.setLLMProvider(llmProvider);
        console.log(`🤖 LLM provider updated: OpenAI (${model ?? 'gpt-4.1-mini'})`);
        return {
          success: true,
          data: {
            provider: 'openai',
            model: model ?? 'gpt-4.1-mini',
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
          { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: 'Fastest, lowest cost — classification & summaries' },
          { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Fast, affordable — best for parsing', recommended: true },
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
