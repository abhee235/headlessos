// M10.7: LLM Configuration Routes — get/set LLM provider config at runtime
// EX8.20: GPT-6 Luna is the default; a model change without a key keeps the key in memory
// EX8.21: changes reach the agents and Dynamic UI through onChange
// EX8.22: saved encrypted to ~/.headlessos/llm.json, so they survive restarts
// EX9.3: Ollama (a local model) as a second provider; the OpenAI key stays in memory
// @see docs/PROGRESS.md, docs/phases/phase-ex9.md §8

import type { FastifyInstance } from 'fastify';
import type { ParsingPipeline } from '../parsers/pipeline.js';
import type { LLMProvider } from '../llm/provider.js';
import { DEFAULT_OPENAI_MODEL, OpenAIProvider } from '../llm/providers/openai.js';
import {
  OllamaProvider, checkOllamaUrl, listOllamaModels, ollamaContextWindow,
} from '../llm/providers/ollama.js';
import type { LLMSettingsUpdate, OllamaSettings } from '../llm/llm-settings-store.js';

/** EX8.22: where the active key came from */
export type KeySource = 'settings' | 'env' | null;

interface LLMConfig {
  provider: 'openai' | 'ollama' | 'none';
  model: string;
  hasApiKey: boolean;
  keySource: KeySource;
  /** EX9.3: the active or last saved Ollama settings */
  ollama?: OllamaSettings & { contextWindow?: number };
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
    save: (update: LLMSettingsUpdate) => void;
    clear: () => void;
  };
  /** EX8.22: where the startup key came from */
  keySource?: KeySource;
  /** EX9.3: the OpenAI provider kept in memory while Ollama is active (switch back without a key) */
  openai?: OpenAIProvider | null;
  /** EX9.3: saved Ollama settings (prefill), and a fetch for tests */
  ollama?: { saved?: OllamaSettings; fetch?: typeof fetch };
}

const OllamaBody = (value: unknown): { baseUrl: string; model: string; allowRemote: boolean } | null => {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.baseUrl !== 'string' || typeof v.model !== 'string') return null;
  const model = v.model.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) return null;
  return { baseUrl: v.baseUrl.trim(), model, allowRemote: v.allowRemote === true };
};

export async function llmRoutes(app: FastifyInstance, opts: LLMRouteOpts): Promise<void> {
  const { pipeline, onChange, persist } = opts;
  let keySource: KeySource = opts.keySource ?? null;
  const currentProvider = () => (pipeline as unknown as { llmProvider?: LLMProvider & { model?: string } }).llmProvider;
  const ollamaFetch = opts.ollama?.fetch ?? fetch;
  // EX9.3: the OpenAI key outlives a switch to Ollama, so switching back needs none
  let lastOpenAI: OpenAIProvider | null = opts.openai ?? (currentProvider() instanceof OpenAIProvider ? currentProvider() as OpenAIProvider : null);
  let savedOllama: OllamaSettings | undefined = opts.ollama?.saved;

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
    const isOllama = provider instanceof OllamaProvider;
    const config: LLMConfig = {
      provider: provider ? (isOllama ? 'ollama' : 'openai') : 'none',
      model: provider?.model ?? DEFAULT_OPENAI_MODEL,
      hasApiKey: !!provider,
      keySource: provider && !isOllama ? keySource : null,
      ...(isOllama
        ? { ollama: { baseUrl: provider.baseUrl, model: provider.model, contextWindow: provider.contextWindow, ...(savedOllama?.allowRemote ? { allowRemote: true } : {}) } }
        : savedOllama ? { ollama: savedOllama } : {}),
    };
    return { success: true, data: config };
  });

  // ── GET /api/llm/ollama/models — EX9.3: installed models, for the picker ──
  app.get<{ Querystring: { baseUrl?: string; allowRemote?: string } }>('/api/llm/ollama/models', async (req) => {
    const checked = checkOllamaUrl(req.query.baseUrl ?? '', req.query.allowRemote === 'true');
    if (!checked.ok) return { success: false, error: checked.error };
    try {
      return { success: true, data: await listOllamaModels(checked.url, ollamaFetch) };
    } catch (err) {
      return { success: false, error: `Ollama is not reachable at ${checked.url}: ${err instanceof Error ? err.message : String(err)}` };
    }
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
        lastOpenAI = null;
        savedOllama = undefined;
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
        else if (lastOpenAI) llmProvider = lastOpenAI.withModel(chosen); // EX9.3: back from Ollama
        else return { success: false, error: 'API key is required for OpenAI provider' };
        lastOpenAI = llmProvider;
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

      if (provider === 'ollama') {
        const body = OllamaBody((req.body as { ollama?: unknown }).ollama);
        if (!body) return { success: false, error: 'Choose an Ollama URL and a model' };
        const checked = checkOllamaUrl(body.baseUrl, body.allowRemote);
        if (!checked.ok) return { success: false, error: checked.error };
        let installed: string[];
        try {
          installed = (await listOllamaModels(checked.url, ollamaFetch)).map((m) => m.name);
        } catch (err) {
          return { success: false, error: `Ollama is not reachable at ${checked.url}: ${err instanceof Error ? err.message : String(err)}` };
        }
        const model = installed.includes(body.model) ? body.model
          : installed.includes(`${body.model}:latest`) ? `${body.model}:latest` : null;
        if (!model) {
          return { success: false, error: `Model "${body.model}" is not installed in Ollama. Installed: ${installed.join(', ') || 'none'}` };
        }
        const contextWindow = await ollamaContextWindow(checked.url, model, ollamaFetch);
        const llmProvider = new OllamaProvider({ baseUrl: checked.url, model, contextWindow, fetch: ollamaFetch });
        pipeline.setLLMProvider(llmProvider);
        onChange?.(llmProvider);
        savedOllama = { baseUrl: checked.url, model, ...(body.allowRemote ? { allowRemote: true } : {}) };
        const persisted = tryPersist(() => persist?.save({ provider: 'ollama', ollama: savedOllama! }));
        console.log(`🦙 LLM provider updated: Ollama ${model} at ${checked.url} (context ${contextWindow})${persisted ? ' — saved' : ' — this session only'}`);
        return {
          success: true,
          data: { provider: 'ollama', model, hasApiKey: true, keySource: null, ollama: { ...savedOllama, contextWindow }, persisted },
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
