---
description: "Create a new Zod schema for data validation and LLM structured output"
mode: "agent"
---

# New Zod Schema

Create a Zod schema that serves dual purpose: runtime validation AND LLM structured output.

## File locations
- Server parser schemas: `server/src/parsers/schemas/{category}.ts` (system, services, taskmanager, serveradmin)
- Shared schemas: `shared/schemas/`
- Test: `server/tests/parsers/schemas/{name}.test.ts`

## Schema template
```typescript
import { z } from 'zod';

export const {Name}Schema = z.object({
  // Use clear field names — LLM needs to understand the schema
  // Use .describe() on ambiguous fields for LLM context
  // Prefer z.enum() over z.string() for known value sets
  // Use z.coerce.number() when parsing string numbers from terminal output
});

export type {Name} = z.infer<typeof {Name}Schema>;
```

## Rules
- Zod is the single source of truth — NEVER define a separate TypeScript interface
- Derive types with `z.infer<typeof Schema>`
- Add `.describe()` to fields the LLM might misinterpret
- Keep schemas flat when possible — deeply nested schemas confuse LLMs
- NEVER use `z.any()` — always be specific
- Export BOTH the schema AND the inferred type
- Use `z.enum()` for known value sets, `z.coerce.number()` for terminal string→number
- Write tests that verify the schema accepts valid data and rejects invalid data
- See [AGENTS.md](../../AGENTS.md) §9 for full Zod patterns

## Dual purpose design

Schemas serve two roles:
1. **Runtime validation**: `Schema.parse(data)` throws on invalid data
2. **LLM structured output**: `zodResponseFormat(Schema, 'name')` for OpenAI

## Schema to create

{input}
