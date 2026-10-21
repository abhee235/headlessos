// EX10.2: Context plan — every budget of an agent run, from one window
// @see docs/phases/phase-ex10.md §2, docs/DECISIONS.md (ADR-025)
//
// Pure. Constants follow cascade-ai `context/compactionPlan.ts`, so on large
// windows the trigger lands where Cascade's golden tests pin it.

import { HOSTED_PLAN_CAP, recommendedMaxOutput, type ModelLimits } from '../../llm/model-limits.js';

const SUMMARY_OUTPUT_RESERVE = 20_000;
const AUTOCOMPACT_BUFFER = 13_000;
const HARD_BUFFER = 3_000;
const WALL_MARGIN = 1_024;
const TRIGGER_PCT = 0.7;
const RESERVE_FRACTION = 0.25;
const KEEP_RECENT_RATIO = 0.25;
const DEEP_TARGET_FRACTION = 0.55;
const MASK_FRACTION = 0.01;
const RESULT_FRACTION = 0.15;
const ACTION_SHARE = 0.1;
/** roughly what one action tool definition costs in the prompt */
const TOKENS_PER_ACTION = 120;
export const MINIMAL_TIER_MAX = 24_000;
export const FULL_TIER_MIN = 96_000;

export type PromptTier = 'minimal' | 'lean' | 'full';

export interface ContextPlan {
  window: number;
  maxOutput: number;
  /** room kept free for the reply */
  reserve: number;
  effectiveWindow: number;
  /** compact when the prompt reaches this many tokens */
  trigger: number;
  /** above this, compaction drops whatever it must (survival) */
  hard: number;
  /** tokens at the end of the history that stay verbatim */
  keepRecent: number;
  /** compaction stops once the prompt is at or under this */
  stopAt: number;
  /** older results longer than this are stubbed first */
  maskChars: number;
  /** what one tool result may cost as the model first sees it */
  resultChars: number;
  /** catalog actions offered natively */
  actionBudget: number;
  tier: PromptTier;
  local: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function windowTier(window: number): PromptTier {
  return window < MINIMAL_TIER_MAX ? 'minimal' : window < FULL_TIER_MIN ? 'lean' : 'full';
}

export function planContext(limits: Pick<ModelLimits, 'contextWindow' | 'maxOutputTokens' | 'local'>): ContextPlan {
  const window = limits.contextWindow;
  const maxOutput = limits.maxOutputTokens;
  const reserve = Math.min(SUMMARY_OUTPUT_RESERVE, maxOutput, Math.floor(window * RESERVE_FRACTION));
  const effectiveWindow = window - reserve;
  // the wire wall: prompt + a full reply must fit in the window. Cascade applies it only when
  // the reply cap is small next to the window; on small windows that lets a reply overflow,
  // so it always applies here, never pulling the trigger below a quarter of the window.
  const trigger = Math.max(
    Math.floor(window / 4),
    Math.min(Math.floor(Math.max(TRIGGER_PCT * window, effectiveWindow - AUTOCOMPACT_BUFFER)), window - maxOutput - WALL_MARGIN),
  );
  const hard = Math.min(window, Math.max(effectiveWindow - HARD_BUFFER, trigger + HARD_BUFFER));
  const keepRecent = Math.floor(effectiveWindow * KEEP_RECENT_RATIO);
  // local backends reuse the KV cache for an unchanged prefix: compact rarely, deeply
  const deepTarget = Math.max(keepRecent + Math.min(2_000, Math.floor(window / 8)), Math.floor(window * DEEP_TARGET_FRACTION));
  const stopAt = limits.local ? Math.min(trigger, deepTarget) : trigger;
  return {
    window,
    maxOutput,
    reserve,
    effectiveWindow,
    trigger,
    hard,
    keepRecent,
    stopAt,
    maskChars: clamp(Math.floor(window * 4 * MASK_FRACTION), 1_000, 8_000),
    resultChars: clamp(Math.floor(effectiveWindow * 4 * RESULT_FRACTION), 1_500, 8_000),
    actionBudget: limits.local ? clamp(Math.floor((ACTION_SHARE * window) / TOKENS_PER_ACTION), 8, 40) : 40,
    tier: windowTier(window),
    local: limits.local,
  };
}

/** The plan for a provider; one with no limits is planned like a hosted model at 128K. */
export function planForProvider(provider?: { limits?: ModelLimits; contextWindow?: number; name?: string } | null): ContextPlan {
  if (provider?.limits) return planContext(provider.limits);
  const window = provider?.contextWindow ?? HOSTED_PLAN_CAP;
  return planContext({ contextWindow: window, maxOutputTokens: recommendedMaxOutput(window), local: provider?.name === 'ollama' });
}
