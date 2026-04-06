# Phase 4: Deterministic Parsers + Optimization

> **Milestone:** M4 | **Duration:** Week 4 | **Status:** 🔄 In progress (3/8 → completing)
> **Prerequisites:** M3 complete (all apps working with LLM parsing)
> **Definition of Done:** Most common commands use deterministic parsers. LLM usage drops by ~80%. Caching prevents redundant LLM calls. LLM usage stats are tracked.

---

## Task 4.1: Deterministic Parser — `df -h` ✅

**Task ID:** `M4.1`
**File:** `server/src/parsers/deterministic/df.ts`
**Status:** Completed in M2.1 — dashboard backend built all system parsers.
**Verification:** Used by system dashboard route, validated with Zod ✅

---

## Task 4.2: Deterministic Parser — `free -m` ✅

**Task ID:** `M4.2`
**File:** `server/src/parsers/deterministic/free.ts`
**Status:** Completed in M2.1 — dashboard backend built all system parsers.
**Verification:** Used by system dashboard route, validated with Zod ✅

---

## Task 4.3: Deterministic Parser — `ps aux` ✅

**Task ID:** `M4.3`
**File:** `server/src/parsers/deterministic/ps-aux.ts`
**Schema:** `server/src/parsers/schemas/taskmanager.ts` → `ProcessListSchema`
**Test:** `server/tests/parsers/ps-aux.test.ts`
**Status:** Already built in M7.1 (Task Manager). Parser is `psAuxParser`, registered in `allParsers[]`.

Parses `ps aux --no-headers` output:
- Splits by whitespace, handles COMMAND field with spaces (parts[10:])
- Extracts: pid, user, cpu, memory, vsz, rss, stat, started, time, command
- Skips header line if present, skips lines with < 11 fields

**Verification:**
- [x] Parser registered in pipeline
- [x] Used by `taskManagerRoutes` via `CommandOrchestrator`
- [ ] Fixture tests with varied real-world ps output (add in M4.3 test task)

---

## Task 4.4: Deterministic Parser — `ls -la` ⏭️ SKIPPED

**Task ID:** `M4.4`
**Status:** Skipped — not needed.

**Rationale:** HeadlessOS uses **SFTP `readdir()`** for all file listing operations (per ADR in SECURITY.md and ARCHITECTURE.md). The `ls -la` command is never exec'd — file metadata comes from SFTP `stat()`. Building this parser would have no consumer.

If a future feature (e.g., ReAct agent browsing output) needs `ls` parsing, it can be added then.

---

## Task 4.5: Deterministic Parser — `ip -brief addr` ✅

**Task ID:** `M4.5`
**File:** `server/src/parsers/deterministic/ip.ts`
**Status:** Completed in M2.1 — dashboard backend built all system parsers.
**Verification:** Used by system dashboard route, validated with Zod ✅

---

## Task 4.6: Deterministic Parser — `systemctl list-units`

**Task ID:** `M4.6`
**File:** `server/src/parsers/deterministic/systemctl.ts` (new)
**Schema:** `server/src/parsers/schemas/services.ts` (new Zod schema)
**Test:** `server/tests/parsers/systemctl.test.ts`

**Current state:** An inline `parseServiceList()` function exists in `server/src/routes/services.ts` (lines 16–66). It parses `systemctl list-units --type=service --all --no-pager --no-legend` output but:
- Is NOT registered in the parser registry
- Uses `ServiceInfo` type from `shared/types.ts` instead of a Zod schema
- Bypasses the parsing pipeline entirely

**Work required:**
1. Create `server/src/parsers/schemas/services.ts` — Zod schema for `ServiceInfo[]`
2. Create `server/src/parsers/deterministic/systemctl.ts` — extract + enhance the inline parser
3. Register `systemctlParser` in `allParsers[]`
4. Update `server/src/routes/services.ts` — import from deterministic parser, remove inline function
5. Add fixture-based tests

**Verification:**
- [ ] Parser registered in pipeline
- [ ] Services route uses extracted parser
- [ ] 100% fixture match on varied systemctl output
- [ ] Zod validation of all parsed output

---

## Task 4.7: Caching Layer

**Task ID:** `M4.7`
**Files:**
- `server/src/cache/output-cache.ts` — hash-based cache service
- `server/tests/cache/output-cache.test.ts`

Hash-based cache: if terminal output hasn't changed between polls, skip re-parsing.
Integrates with `ParsingPipeline` — cache is checked before parsing, result is cached after parsing.

```typescript
export class OutputCache extends BaseService {
  /** Get cached parse result if rawOutput hash matches */
  get<T>(serverId: string, command: string, rawOutput: string): T | null;

  /** Cache a parse result keyed by (serverId, command, hash(rawOutput)) */
  set<T>(serverId: string, command: string, rawOutput: string, data: T, ttlMs?: number): void;

  /** Invalidate all cache entries for a server */
  invalidateServer(serverId: string): void;

  /** Get cache statistics */
  getStats(): CacheStats;
}

interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  hitRate: number;      // percentage 0-100
  memoryBytes: number;  // approximate
}
```

**Integration points:**
- `ParsingPipeline.parse()` — check cache before parsing, store result after
- `ConnectionManager` — `invalidateServer()` on disconnect
- Dashboard auto-refresh — highest benefit (30s interval, same output usually)

**Verification:**
- [ ] Identical output returns cached result (no re-parse)
- [ ] Changed output invalidates and re-parses
- [ ] TTL expiry evicts stale entries
- [ ] `invalidateServer()` clears all entries for a server
- [ ] `getStats()` returns accurate hit/miss counts
- [ ] Cache integrates with pipeline automatically

---

## Task 4.8: LLM Usage Stats

**Task ID:** `M4.8`
**Files:**
- `server/src/llm/usage-tracker.ts` — in-memory + persistent stats tracker
- `server/src/routes/stats.ts` — REST endpoint for stats
- `server/tests/llm/usage-tracker.test.ts`

Tracks every LLM call: tokens used, cost estimate, model, command, latency.
Also tracks cache hit/miss from M4.7.

```typescript
export class LLMUsageTracker {
  /** Record an LLM call */
  recordCall(entry: UsageEntry): void;

  /** Get usage summary */
  getSummary(): UsageSummary;

  /** Reset stats */
  reset(): void;
}

interface UsageEntry {
  command: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  timestamp: string;
}

interface UsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;   // based on model pricing
  averageLatencyMs: number;
  callsByModel: Record<string, number>;
  callsByCommand: Record<string, number>;
  cache: CacheStats;          // from OutputCache
}
```

**API Endpoint:** `GET /api/stats/llm`

**Integration points:**
- `ParsingPipeline.parse()` — after LLM call, record usage
- `OutputCache.getStats()` — include cache stats in summary

**Verification:**
- [ ] LLM calls are tracked with tokens + cost
- [ ] `GET /api/stats/llm` returns valid JSON
- [ ] Cost estimates use correct per-model pricing
- [ ] Cache stats included in response
