// EX10.2: Context plan — one window, every budget
// @see docs/phases/phase-ex10.md §2

import { describe, it, expect } from 'vitest';
import { planContext, planForProvider, windowTier } from '../../../src/agent/context/plan.js';
import { recommendedMaxOutput } from '../../../src/llm/model-limits.js';

const local = (window: number) => planContext({ contextWindow: window, maxOutputTokens: recommendedMaxOutput(window), local: true });

describe('planContext', () => {
  it('matches the worked table in the phase doc', () => {
    expect(local(8_192)).toMatchObject({ maxOutput: 2_048, reserve: 2_048, trigger: 5_120, hard: 8_120, keepRecent: 1_536, stopAt: 4_505, resultChars: 3_686, actionBudget: 8, tier: 'minimal' });
    expect(local(16_384)).toMatchObject({ maxOutput: 2_048, reserve: 2_048, trigger: 11_468, hard: 14_468, keepRecent: 3_584, stopAt: 9_011, resultChars: 8_000, actionBudget: 13, tier: 'minimal' });
    expect(local(65_536)).toMatchObject({ maxOutput: 8_192, reserve: 8_192, trigger: 45_875, hard: 54_344, keepRecent: 14_336, stopAt: 36_044, resultChars: 8_000, actionBudget: 40, tier: 'lean' });
    const hosted = planContext({ contextWindow: 128_000, maxOutputTokens: recommendedMaxOutput(128_000), local: false });
    expect(hosted).toMatchObject({ maxOutput: 16_000, reserve: 16_000, trigger: 99_000, hard: 109_000, keepRecent: 28_000, stopAt: 99_000, actionBudget: 40, tier: 'full' });
  });

  it('reproduces the reference golden trigger on large windows: window − 20K − 13K', () => {
    for (const window of [131_072, 200_000, 1_000_000]) {
      expect(planContext({ contextWindow: window, maxOutputTokens: 20_000, local: false }).trigger).toBe(window - 20_000 - 13_000);
    }
  });

  it('keeps stopAt ≤ trigger ≤ hard ≤ window for every window and reply cap', () => {
    for (const window of [2_048, 4_096, 8_192, 12_000, 16_384, 32_768, 40_960, 65_536, 131_072, 262_144]) {
      for (const maxOutputTokens of [512, 2_048, recommendedMaxOutput(window), 16_384]) {
        for (const isLocal of [true, false]) {
          const p = planContext({ contextWindow: window, maxOutputTokens: Math.min(maxOutputTokens, window / 2), local: isLocal });
          expect(p.stopAt, `${window}/${maxOutputTokens}/${isLocal}`).toBeLessThanOrEqual(p.trigger);
          expect(p.trigger).toBeLessThanOrEqual(p.hard);
          expect(p.hard).toBeLessThanOrEqual(window);
          expect(p.trigger + p.maxOutput).toBeLessThanOrEqual(window);
        }
      }
    }
  });

  it('compacts local models deeper than hosted ones', () => {
    const l = planContext({ contextWindow: 65_536, maxOutputTokens: 8_192, local: true });
    const h = planContext({ contextWindow: 65_536, maxOutputTokens: 8_192, local: false });
    expect(l.trigger).toBe(h.trigger);
    expect(l.stopAt).toBeLessThan(h.stopAt);
    expect(h.stopAt).toBe(h.trigger);
  });
});

describe('windowTier', () => {
  it('is minimal under 24K, lean under 96K, full above', () => {
    expect([windowTier(16_384), windowTier(24_000), windowTier(65_536), windowTier(96_000)]).toEqual(['minimal', 'lean', 'lean', 'full']);
  });
});

describe('planForProvider', () => {
  it('uses the provider’s limits, or a hosted 128K plan without them', () => {
    expect(planForProvider({ limits: { contextWindow: 65_536, source: 'auto-cap', maxOutputTokens: 8_192, local: true } })).toMatchObject({ window: 65_536, local: true });
    expect(planForProvider(null)).toMatchObject({ window: 128_000, local: false, actionBudget: 40 });
    expect(planForProvider({ contextWindow: 8_192, name: 'ollama' })).toMatchObject({ window: 8_192, local: true, actionBudget: 8 });
  });
});
