---
applyTo: "**/*.test.ts"
---

# Testing Rules

## Framework
- Vitest — no Jest, no Mocha
- `describe/it/expect` pattern
- Async tests with `async/await`

## Test Priorities (in order)
1. Parsers — deterministic AND LLM-backed
2. Security validators — path traversal, command injection, ID validation
3. Zod schemas — ensure schemas reject bad data
4. Command Orchestrator — execution plans, retry logic, fallback chains
5. API routes — integration tests with mocked SSH

## Parser Test Pattern
```typescript
import { describe, it, expect } from 'vitest';
import { readFixture } from '../helpers/read-fixture';
import { parseDiskUsage } from '../../src/parsers/deterministic/disk-usage';
import { DiskUsageSchema } from '../../src/parsers/schemas/system';

describe('parseDiskUsage', () => {
  it('parses df -h output correctly', () => {
    const raw = readFixture('df-h-output.txt');
    const result = parseDiskUsage(raw);
    const validated = DiskUsageSchema.parse(result);
    expect(validated.filesystems).toHaveLength(3);
  });
});
```

## Rules
- Every parser MUST have tests before being marked complete
- Every security validator MUST have tests covering injection attacks
- Tests MUST use Zod `.parse()` to validate output
- NEVER mock Zod schemas — use real schemas
- Mock SSH and LLM calls, not parsing logic
- Store fixtures in `server/tests/fixtures/terminal-outputs/`
