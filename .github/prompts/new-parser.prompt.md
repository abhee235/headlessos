---
description: "Create a new deterministic parser for a Linux command"
mode: "agent"
---

# New Deterministic Parser

Create a deterministic parser for a Linux command output.

## File locations
- Parser: `server/src/parsers/deterministic/{name}.ts`
- Schema: `server/src/parsers/schemas/{category}.ts` (system, services, taskmanager, serveradmin)
- Test: `server/tests/parsers/{name}.test.ts`
- Fixture: `server/tests/fixtures/terminal-outputs/{name}-output.txt`

## Implementation steps

1. Collect real terminal output from the Lima VM (`./dev/vm.sh ssh` then run the command)
2. Save the output as a fixture file
3. Define the Zod schema (derive TypeScript type with `z.infer`)
4. Write the deterministic parser (regex-based, <1ms target)
5. Register it in `server/src/parsers/deterministic/index.ts`
6. Write tests using the fixture + Zod validation
7. Run `npm run test:server` to verify

## Parser template
```typescript
import { z } from 'zod';

export function parse{Name}(raw: string): z.infer<typeof {Name}Schema> {
  const lines = raw.trim().split('\n');
  // Parse each line with regex
  // Return typed object matching the Zod schema
}
```

## Rules
- Prefer regex over string splitting for robustness
- Handle edge cases: empty output, error messages, unusual formats
- Export both parser function and schema
- NEVER send ANSI to the parser — it receives pre-stripped output

## Command to parse

{input}
