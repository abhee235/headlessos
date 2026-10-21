// EX2.1: Multi-Model Router
// @see docs/phases/phase-ex2.md
//
// Routes LLM calls to the optimal model based on task type.
// Inspired by Aider's three-model-role pattern (architect, editor, weak).
// Extends to four roles: reasoning, structured-output, fast, weak.

import { BaseService } from '../services/base-service.js';
import type {
  LLMProvider,
  ParseTextInput,
  ParseResult,
  ChatWithToolsInput,
  ChatWithToolsResult,
} from './provider.js';
import { OpenAIProvider } from './providers/openai.js';
import type { LLMUsageTracker } from './usage-tracker.js';
import {
  type ModelRole,
  type ModelConfig,
  type ModelRoleConfig,
  MODEL_ROLES,
  loadModelConfig,
  roleToConfigKey,
} from '../config/models.js';
import { withSpan, setSpanAttributes } from '../observatory/context.js';

export interface ModelRouterOptions {
  apiKey: string;
  config?: Partial<ModelConfig>;
  usageTracker?: LLMUsageTracker;
}

/**
 * Multi-Model Router — routes LLM calls to the optimal model based on role.
 *
 * Roles:
 * - reasoning:         Planning, reflection (o3, o4-mini)
 * - structured-output: Schema generation with tools (gpt-4.1, gpt-4o)
 * - fast:              Quick tasks, error analysis (gpt-4.1-mini)
 * - weak:              Cheapest — summaries, classification (gpt-4.1-nano)
 */
export class ModelRouter extends BaseService {
  private providers = new Map<ModelRole, LLMProvider>();
  private config!: ModelConfig;
  private apiKey: string;
  private configOverride?: Partial<ModelConfig>;
  private usageTracker?: LLMUsageTracker;

  constructor(name: string, options: ModelRouterOptions) {
    super(name);
    this.apiKey = options.apiKey;
    this.configOverride = options.config;
    this.usageTracker = options.usageTracker;
  }

  protected override async _construct(): Promise<void> {
    // Load config from env + defaults, apply overrides
    const envConfig = loadModelConfig();
    this.config = this.mergeConfig(envConfig, this.configOverride);

    // Create providers for each role
    this.createProviders();
  }

  protected override async _destroy(): Promise<void> {
    this.providers.clear();
  }

  // ── Public API ──

  /**
   * Get the LLMProvider for a specific role.
   * Falls back to 'fast' if the requested role's provider can't be created.
   */
  getModel(role: ModelRole): LLMProvider {
    const provider = this.providers.get(role);
    if (provider) return provider;

    // Fallback chain: requested → fast → weak → any available
    const fallbackOrder: ModelRole[] = ['fast', 'weak', 'structured-output', 'reasoning'];
    for (const fallback of fallbackOrder) {
      const fbProvider = this.providers.get(fallback);
      if (fbProvider) return fbProvider;
    }

    throw new Error(`No LLM provider available for role '${role}' or any fallback`);
  }

  /**
   * Parse with reasoning model (for planning, reflection).
   */
  async reason<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    return withSpan('ModelRouter.reason', 'LLM', async () => {
      const provider = this.getModel('reasoning');
      const result = await provider.parseText(input);
      this.trackUsage('reasoning', input.command, result);
      setSpanAttributes({
        model: result.model,
        modelRole: 'reasoning',
        tokenUsage: { inputTokens: result.tokensUsed.input, outputTokens: result.tokensUsed.output, totalTokens: result.tokensUsed.input + result.tokensUsed.output },
        costUsd: this.computeSpanCost(result.model, result.tokensUsed),
        input: input.userPrompt ?? input.systemPrompt ?? input.command,
        output: result.data,
      });
      return result;
    }, { input: input.command });
  }

  /**
   * Generate structured output with native function calling.
   * Used by the Reactive Executor for tool-calling loops.
   */
  async chat(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
    return withSpan('ModelRouter.chat', 'LLM', async () => {
      const provider = this.getModel('structured-output');
      if (!provider.chatWithTools) {
        throw new Error(`Provider '${provider.name}' (model: ${provider.model}) does not support chatWithTools`);
      }
      const result = await provider.chatWithTools(input);
      this.trackChatUsage('structured-output', 'chat-with-tools', result);
      setSpanAttributes({
        model: result.model,
        modelRole: 'structured-output',
        tokenUsage: { inputTokens: result.tokensUsed.input, outputTokens: result.tokensUsed.output, totalTokens: result.tokensUsed.input + result.tokensUsed.output },
        costUsd: this.computeSpanCost(result.model, result.tokensUsed),
        input: input.messages?.slice(-2).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 200) : '[complex]' })),
        output: result.message.tool_calls ?? result.message.content,
      });
      return result;
    }, { input: input.messages?.length ? `${input.messages.length} messages` : 'chat' });
  }

  /**
   * Fast operation — error analysis, simple parsing.
   */
  async fast<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    return withSpan('ModelRouter.fast', 'LLM', async () => {
      const provider = this.getModel('fast');
      const result = await provider.parseText(input);
      this.trackUsage('fast', input.command, result);
      setSpanAttributes({
        model: result.model,
        modelRole: 'fast',
        tokenUsage: { inputTokens: result.tokensUsed.input, outputTokens: result.tokensUsed.output, totalTokens: result.tokensUsed.input + result.tokensUsed.output },
        costUsd: this.computeSpanCost(result.model, result.tokensUsed),
        input: input.userPrompt ?? input.systemPrompt ?? input.command,
        output: result.data,
      });
      return result;
    }, { input: input.command });
  }

  /**
   * Weak/cheap operation — context summarization, classification.
   */
  async summarize(text: string, systemPrompt?: string): Promise<ParseResult<string>> {
    return withSpan('ModelRouter.summarize', 'LLM', async () => {
      const provider = this.getModel('weak');
      // For summarization, we use a simple string schema
      const { z } = await import('zod');
      const StringSchema = z.string();
      const result = await provider.parseText({
        rawOutput: text,
        command: 'summarize',
        schema: StringSchema,
        systemPrompt: systemPrompt ?? 'Summarize the following concisely, preserving key facts and decisions. Return just the summary text.',
      });
      this.trackUsage('weak', 'summarize', result);
      setSpanAttributes({
        model: result.model,
        modelRole: 'weak',
        tokenUsage: { inputTokens: result.tokensUsed.input, outputTokens: result.tokensUsed.output, totalTokens: result.tokensUsed.input + result.tokensUsed.output },
        costUsd: this.computeSpanCost(result.model, result.tokensUsed),
        input: text.slice(0, 500), // Truncate for storage
        output: result.data,
      });
      return result;
    }, { input: 'summarize' });
  }

  /**
   * Get the config for a specific role.
   */
  getRoleConfig(role: ModelRole): ModelRoleConfig {
    return this.config[roleToConfigKey(role)];
  }

  /**
   * Get all configured roles and their models.
   */
  getModelMap(): Record<ModelRole, string> {
    const map = {} as Record<ModelRole, string>;
    for (const role of MODEL_ROLES) {
      const config = this.getRoleConfig(role);
      map[role] = config.model;
    }
    return map;
  }

  /**
   * Update model configuration at runtime.
   * Creates new providers for changed models.
   */
  updateConfig(update: Partial<ModelConfig>): void {
    this.config = this.mergeConfig(this.config, update);
    this.createProviders();
  }

  /**
   * Check if a role has a provider configured.
   */
  hasProvider(role: ModelRole): boolean {
    return this.providers.has(role);
  }

  // ── Internal ──

  private createProviders(): void {
    this.providers.clear();

    // Deduplicate: if multiple roles use the same model, share the provider
    const providerByModel = new Map<string, LLMProvider>();

    for (const role of MODEL_ROLES) {
      const roleConfig = this.getRoleConfig(role);
      const key = `${roleConfig.provider}:${roleConfig.model}`;

      let provider = providerByModel.get(key);
      if (!provider) {
        provider = this.createProvider(roleConfig);
        providerByModel.set(key, provider);
      }
      this.providers.set(role, provider);
    }
  }

  private createProvider(config: ModelRoleConfig): LLMProvider {
    switch (config.provider) {
      case 'openai':
        return new OpenAIProvider(this.apiKey, config.model);
      default:
        // Future: anthropic, ollama
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  private mergeConfig(base: ModelConfig, override?: Partial<ModelConfig>): ModelConfig {
    if (!override) return { ...base };
    return {
      reasoning: override.reasoning ?? base.reasoning,
      structuredOutput: override.structuredOutput ?? base.structuredOutput,
      fast: override.fast ?? base.fast,
      weak: override.weak ?? base.weak,
    };
  }

  private trackUsage<T>(role: ModelRole, command: string, result: ParseResult<T>): void {
    if (!this.usageTracker) return;
    this.usageTracker.recordCall({
      command: `${role}:${command}`,
      model: result.model,
      inputTokens: result.tokensUsed.input,
      outputTokens: result.tokensUsed.output,
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
    });
  }

  private trackChatUsage(role: ModelRole, command: string, result: ChatWithToolsResult): void {
    if (!this.usageTracker) return;
    this.usageTracker.recordCall({
      command: `${role}:${command}`,
      model: result.model,
      inputTokens: result.tokensUsed.input,
      outputTokens: result.tokensUsed.output,
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
    });
  }

  private computeSpanCost(model: string, tokensUsed: { input: number; output: number }): number {
    // Reuse MODEL_PRICING from usage-tracker module pattern
    const SPAN_PRICING: Record<string, { input: number; output: number }> = {
      'gpt-6-luna': { input: 0.0001, output: 0.0005 },
      'gpt-4.1': { input: 0.002, output: 0.008 },
      'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
      'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-5.4': { input: 0.01, output: 0.04 },
      'o4-mini': { input: 0.0011, output: 0.0044 },
    };
    const pricing = SPAN_PRICING[model] ?? { input: 0.005, output: 0.015 };
    return (tokensUsed.input / 1000) * pricing.input + (tokensUsed.output / 1000) * pricing.output;
  }
}
