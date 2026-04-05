# Phase 4: Deterministic Parsers + Optimization

> **Milestone:** M4 | **Duration:** Week 4 | **Status:** Not started
> **Prerequisites:** M3 complete (all apps working with LLM parsing)
> **Definition of Done:** Most common commands use deterministic parsers. LLM usage drops by ~80%. Caching prevents redundant LLM calls.

---

## Task 4.1: Deterministic Parser — `df -h`

**Task ID:** `M4.1`
**File: `server/src/parsers/deterministic/df.ts`**
**Test: `server/tests/parsers/df.test.ts`**

Split by whitespace, skip header, extract filesystem/size/used/available/percent/mount.

**Verification:** 100% fixture match on 10+ samples

---

## Task 4.2: Deterministic Parser — `free -m`

**Task ID:** `M4.2`
**File: `server/src/parsers/deterministic/free.ts`**
**Test: `server/tests/parsers/free.test.ts`**

Match "Mem:" and "Swap:" rows, extract values.

**Verification:** 100% fixture match on 10+ samples

---

## Task 4.3: Deterministic Parser — `ps aux`

**Task ID:** `M4.3`
**File: `server/src/parsers/deterministic/ps.ts`**
**Test: `server/tests/parsers/ps.test.ts`**

Split by whitespace (max 11 fields — command can contain spaces).

**Verification:** 100% fixture match on 10+ samples

---

## Task 4.4: Deterministic Parser — `ls -la`

**Task ID:** `M4.4`
**File: `server/src/parsers/deterministic/ls.ts`**
**Test: `server/tests/parsers/ls.test.ts`**

Regex per line for permissions, owner, group, size, date, name.

**Verification:** 100% fixture match on 10+ samples

---

## Task 4.5: Deterministic Parser — `ip -brief addr`

**Task ID:** `M4.5`
**File: `server/src/parsers/deterministic/ip.ts`**
**Test: `server/tests/parsers/ip.test.ts`**

Simple space-separated split.

**Verification:** 100% fixture match on 10+ samples

---

## Task 4.6: Deterministic Parser — `systemctl list-units`

**Task ID:** `M4.6`
**File: `server/src/parsers/deterministic/systemctl.ts`**
**Test: `server/tests/parsers/systemctl.test.ts`**

Columnar split + state matching.

**Verification:** 100% fixture match on 10+ samples

---

## Task 4.7: Caching Layer

**Task ID:** `M4.7`
**File: `server/src/cache/cache.ts`**

Hash-based cache: if terminal output hasn't changed between polls, skip re-parsing.

```typescript
class OutputCache {
  get<T>(serverId: string, command: string, rawOutput: string): T | null;
  set<T>(serverId: string, command: string, rawOutput: string, data: T, ttlMs: number): void;
}
```

**Verification:**
- [ ] Identical output returns cached result (no LLM call)
- [ ] Changed output invalidates cache
- [ ] TTL expiry works

---

## Task 4.8: LLM Usage Stats Endpoint

**Task ID:** `M4.8`
**File: `server/src/routes/stats.ts`**

Endpoint to show LLM usage: calls, tokens, cost estimate, cache savings.

**Verification:**
- [ ] Shows total LLM calls, tokens, estimated cost
- [ ] Shows cache hit rate
