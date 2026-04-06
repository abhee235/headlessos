// M4.8: Tests for LLMUsageTracker
// @see docs/phases/phase-4.md

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMUsageTracker } from '../../src/llm/usage-tracker.js';
import type { CacheStats } from '../../src/cache/output-cache.js';

describe('LLMUsageTracker', () => {
  let tracker: LLMUsageTracker;

  beforeEach(() => {
    tracker = new LLMUsageTracker();
  });

  describe('recordCall', () => {
    it('tracks a single LLM call', () => {
      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o',
        inputTokens: 500,
        outputTokens: 200,
        latencyMs: 1200,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      const summary = tracker.getSummary();
      expect(summary.totalCalls).toBe(1);
      expect(summary.totalInputTokens).toBe(500);
      expect(summary.totalOutputTokens).toBe(200);
      expect(summary.averageLatencyMs).toBe(1200);
    });

    it('accumulates multiple calls', () => {
      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o',
        inputTokens: 500,
        outputTokens: 200,
        latencyMs: 1200,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      tracker.recordCall({
        command: 'free -m',
        model: 'gpt-4o',
        inputTokens: 300,
        outputTokens: 100,
        latencyMs: 800,
        timestamp: '2026-04-06T12:00:01.000Z',
      });

      const summary = tracker.getSummary();
      expect(summary.totalCalls).toBe(2);
      expect(summary.totalInputTokens).toBe(800);
      expect(summary.totalOutputTokens).toBe(300);
      expect(summary.averageLatencyMs).toBe(1000); // (1200 + 800) / 2
    });

    it('tracks calls by model', () => {
      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      tracker.recordCall({
        command: 'free -m',
        model: 'gpt-4o-mini',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 300,
        timestamp: '2026-04-06T12:00:01.000Z',
      });

      tracker.recordCall({
        command: 'ps aux',
        model: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
        timestamp: '2026-04-06T12:00:02.000Z',
      });

      const summary = tracker.getSummary();
      expect(summary.callsByModel).toEqual({
        'gpt-4o': 2,
        'gpt-4o-mini': 1,
      });
    });

    it('tracks calls by command', () => {
      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
        timestamp: '2026-04-06T12:00:01.000Z',
      });

      tracker.recordCall({
        command: 'free -m',
        model: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
        timestamp: '2026-04-06T12:00:02.000Z',
      });

      const summary = tracker.getSummary();
      expect(summary.callsByCommand).toEqual({
        'df -h': 2,
        'free -m': 1,
      });
    });
  });

  describe('cost estimation', () => {
    it('calculates cost for gpt-4o', () => {
      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 1000,
        latencyMs: 1000,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      const summary = tracker.getSummary();
      // gpt-4o: input $0.0025/1K, output $0.01/1K
      // 1K input = $0.0025, 1K output = $0.01 → total = $0.0125
      expect(summary.estimatedCostUsd).toBeCloseTo(0.0125, 4);
    });

    it('calculates cost for gpt-4o-mini', () => {
      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o-mini',
        inputTokens: 1000,
        outputTokens: 1000,
        latencyMs: 500,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      const summary = tracker.getSummary();
      // gpt-4o-mini: input $0.00015/1K, output $0.0006/1K
      // 1K input = $0.00015, 1K output = $0.0006 → total = $0.00075
      expect(summary.estimatedCostUsd).toBeCloseTo(0.00075, 5);
    });

    it('uses default pricing for unknown models', () => {
      tracker.recordCall({
        command: 'df -h',
        model: 'some-unknown-model',
        inputTokens: 1000,
        outputTokens: 1000,
        latencyMs: 1000,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      const summary = tracker.getSummary();
      // Default: input $0.005/1K, output $0.015/1K → $0.02
      expect(summary.estimatedCostUsd).toBeCloseTo(0.02, 3);
    });

    it('handles model prefix matching', () => {
      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o-2024-08-06',
        inputTokens: 1000,
        outputTokens: 1000,
        latencyMs: 1000,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      const summary = tracker.getSummary();
      // Should match gpt-4o pricing
      expect(summary.estimatedCostUsd).toBeCloseTo(0.0125, 4);
    });
  });

  describe('getSummary', () => {
    it('returns zero values when no calls recorded', () => {
      const summary = tracker.getSummary();
      expect(summary.totalCalls).toBe(0);
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.totalOutputTokens).toBe(0);
      expect(summary.estimatedCostUsd).toBe(0);
      expect(summary.averageLatencyMs).toBe(0);
      expect(summary.callsByModel).toEqual({});
      expect(summary.callsByCommand).toEqual({});
    });

    it('includes cache stats when provided', () => {
      const cacheStats: CacheStats = {
        totalEntries: 10,
        hits: 50,
        misses: 10,
        hitRate: 83.33,
        memoryBytes: 4096,
      };

      const summary = tracker.getSummary(cacheStats);
      expect(summary.cache).toEqual(cacheStats);
    });

    it('omits cache stats when not provided', () => {
      const summary = tracker.getSummary();
      expect(summary.cache).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('clears all tracked data', () => {
      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o',
        inputTokens: 500,
        outputTokens: 200,
        latencyMs: 1000,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      tracker.reset();

      const summary = tracker.getSummary();
      expect(summary.totalCalls).toBe(0);
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.totalOutputTokens).toBe(0);
      expect(summary.estimatedCostUsd).toBe(0);
      expect(summary.callsByModel).toEqual({});
      expect(summary.callsByCommand).toEqual({});
    });
  });

  describe('totalCallCount', () => {
    it('returns the number of recorded calls', () => {
      expect(tracker.totalCallCount).toBe(0);

      tracker.recordCall({
        command: 'df -h',
        model: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
        timestamp: '2026-04-06T12:00:00.000Z',
      });

      expect(tracker.totalCallCount).toBe(1);
    });
  });
});
