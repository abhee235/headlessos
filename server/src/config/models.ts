
// EX2.1: Multi-Model Configuration
// @see docs/phases/phase-ex2.md

/**
 * Model roles for the UI Generation Agent.
 * Each role maps to a specific use case:
 * - reasoning: Planning, reflection (o3, o4-mini)
 * - structured-output: Schema generation with tools (gpt-4.1, gpt-4o)
 * - fast: Quick tasks, error analysis (gpt-4o-mini)
 * - weak: Cheapest — summaries, classification (gpt-4o-mini)
 */
export type ModelRole = 'reasoning' | 'structured-output' | 'fast' | 'weak';

export const MODEL_ROLES: readonly ModelRole[] = [
  'reasoning',
  'structured-output',
  'fast',
  'weak',
] as const;

export interface ModelRoleConfig {
  provider: string;   // 'openai' (future: 'anthropic', 'ollama')
  model: string;
  maxTokens: number;
}

export interface ModelConfig {
  reasoning: ModelRoleConfig;
  structuredOutput: ModelRoleConfig;
  fast: ModelRoleConfig;
  weak: ModelRoleConfig;
}

/**
 * Default model configuration.
 * Uses gpt-4o-mini for all roles as a safe, cheap default.
 * Override via environment variables for production use.
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  reasoning: {
    provider: 'openai',
    model: 'o4-mini',
    maxTokens: 16384,
  },
  structuredOutput: {
    provider: 'openai',
    model: 'gpt-4.1',
    maxTokens: 16384,
  },
  fast: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    maxTokens: 4096,
  },
  weak: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    maxTokens: 2048,
  },
};

/**
 * Load model configuration from environment variables.
 * Falls back to defaults for any unset value.
 *
 * Environment variables:
 *   MODEL_REASONING        — reasoning model name (default: o4-mini)
 *   MODEL_STRUCTURED       — structured output model (default: gpt-4.1)
 *   MODEL_FAST             — fast model (default: gpt-4o-mini)
 *   MODEL_WEAK             — weak/cheap model (default: gpt-4o-mini)
 *   MODEL_MAX_TOKENS       — global max tokens override (optional)
 */
export function loadModelConfig(): ModelConfig {
  const defaults = DEFAULT_MODEL_CONFIG;
  const globalMaxTokens = process.env.MODEL_MAX_TOKENS
    ? parseInt(process.env.MODEL_MAX_TOKENS, 10)
    : undefined;

  return {
    reasoning: {
      provider: 'openai',
      model: process.env.MODEL_REASONING || defaults.reasoning.model,
      maxTokens: globalMaxTokens ?? defaults.reasoning.maxTokens,
    },
    structuredOutput: {
      provider: 'openai',
      model: process.env.MODEL_STRUCTURED || defaults.structuredOutput.model,
      maxTokens: globalMaxTokens ?? defaults.structuredOutput.maxTokens,
    },
    fast: {
      provider: 'openai',
      model: process.env.MODEL_FAST || defaults.fast.model,
      maxTokens: globalMaxTokens ?? defaults.fast.maxTokens,
    },
    weak: {
      provider: 'openai',
      model: process.env.MODEL_WEAK || defaults.weak.model,
      maxTokens: globalMaxTokens ?? defaults.weak.maxTokens,
    },
  };
}

/**
 * Map a ModelRole to the corresponding key in ModelConfig.
 */
export function roleToConfigKey(role: ModelRole): keyof ModelConfig {
  switch (role) {
    case 'reasoning': return 'reasoning';
    case 'structured-output': return 'structuredOutput';
    case 'fast': return 'fast';
    case 'weak': return 'weak';
  }
}
