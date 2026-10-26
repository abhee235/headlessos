// M4.8: LLM Usage Tracker — tracks tokens, cost, latency per LLM call
// @see docs/phases/phase-4.md
//
// Records every LLM call made via the parsing pipeline.
// Provides aggregate statistics exposed via GET /api/stats/llm.

import type { CacheStats } from '../cache/output-cache.js';

export interface UsageEntry {
  command: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  timestamp: string;
}

export interface UsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  averageLatencyMs: number;
  callsByModel: Record<string, number>;
  callsByCommand: Record<string, number>;
  cache?: CacheStats;
}

// Per-model pricing (USD per 1K tokens) — approximate as of 2025-2026
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // EX11.2: Haiku 5.5's rate for prompts up to 100K tokens ($0.50 / $2.50 per 1M above)
  'claude-haiku-5-5': { input: 0.0001, output: 0.0005 },
  'claude-sonnet-5-5': { input: 0.002, output: 0.01 },
  'claude-opus-5-5': { input: 0.004, output: 0.02 },
  'gpt-6-luna': { input: 0.0001, output: 0.0005 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-5.4': { input: 0.01, output: 0.04 },
  'o4-mini': { input: 0.0011, output: 0.0044 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-4-sonnet': { input: 0.003, output: 0.015 },
};


/**
 * In-memory LLM usage tracker.
 * Records every LLM call and computes aggregate statistics.
 */
export class LLMUsageTracker {
  private entries: UsageEntry[] = [];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalLatencyMs = 0;
  private totalCostUsd = 0;
  private callsByModel = new Map<string, number>();
  private callsByCommand = new Map<string, number>();

  /**
   * Record a completed LLM call.
   */
  recordCall(entry: UsageEntry): void {
    this.entries.push(entry);
    this.totalInputTokens += entry.inputTokens;
    this.totalOutputTokens += entry.outputTokens;
    this.totalLatencyMs += entry.latencyMs;

    // Cost estimate — EX10.7: only models with a known price count (local models cost nothing)
    const pricing = this.getPricing(entry.model);
    if (pricing) {
      this.totalCostUsd +=
        (entry.inputTokens / 1000) * pricing.input +
        (entry.outputTokens / 1000) * pricing.output;
    }

    // Per-model count
    const modelCount = this.callsByModel.get(entry.model) ?? 0;
    this.callsByModel.set(entry.model, modelCount + 1);

    // Per-command count
    const cmdCount = this.callsByCommand.get(entry.command) ?? 0;
    this.callsByCommand.set(entry.command, cmdCount + 1);
  }

  /**
   * Get aggregate usage summary.
   */
  getSummary(cacheStats?: CacheStats): UsageSummary {
    const totalCalls = this.entries.length;

    return {
      totalCalls,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      estimatedCostUsd: Math.round(this.totalCostUsd * 1_000_000) / 1_000_000, // 6 decimal places
      averageLatencyMs: totalCalls > 0 ? Math.round(this.totalLatencyMs / totalCalls) : 0,
      callsByModel: Object.fromEntries(this.callsByModel),
      callsByCommand: Object.fromEntries(this.callsByCommand),
      ...(cacheStats ? { cache: cacheStats } : {}),
    };
  }

  /**
   * Reset all tracked data.
   */
  reset(): void {
    this.entries = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalLatencyMs = 0;
    this.totalCostUsd = 0;
    this.callsByModel.clear();
    this.callsByCommand.clear();
  }

  /**
   * Get the number of recorded calls.
   */
  get totalCallCount(): number {
    return this.entries.length;
  }

  // ── Internal ──

  private getPricing(model: string): { input: number; output: number } | undefined {
    // Try exact match first
    if (MODEL_PRICING[model]) return MODEL_PRICING[model];

    // Try prefix match (e.g., "gpt-4o-2024-08-06" → "gpt-4o")
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
      if (model.startsWith(key)) return pricing;
    }

    // EX10.7: no guessed price — an unknown model (e.g. a local Ollama one) adds nothing
    return undefined;
  }
}
