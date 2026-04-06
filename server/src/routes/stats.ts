// M4.8: LLM Usage Stats Route
// @see docs/phases/phase-4.md
//
// GET /api/stats/llm — returns LLM usage summary + cache stats

import type { FastifyInstance } from 'fastify';
import type { LLMUsageTracker } from '../llm/usage-tracker.js';
import type { OutputCache } from '../cache/output-cache.js';

interface StatsRouteOpts {
  usageTracker: LLMUsageTracker;
  outputCache: OutputCache;
}

export async function statsRoutes(
  fastify: FastifyInstance,
  opts: StatsRouteOpts,
): Promise<void> {
  const { usageTracker, outputCache } = opts;

  // ── GET /api/stats/llm — LLM usage summary ──

  fastify.get('/api/stats/llm', async () => {
    const cacheStats = outputCache.getStats();
    const summary = usageTracker.getSummary(cacheStats);
    return { success: true, data: summary };
  });

  // ── POST /api/stats/llm/reset — Reset stats ──

  fastify.post('/api/stats/llm/reset', async () => {
    usageTracker.reset();
    outputCache.reset();
    return { success: true };
  });
}
