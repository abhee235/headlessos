---
applyTo: "server/src/parsers/schemas/**/*.ts,shared/**/*.ts"
---

# Zod Schema Rules

## Zod is the Single Source of Truth
- Every data structure crossing a boundary MUST have a Zod schema
- TypeScript types are DERIVED from schemas: `type X = z.infer<typeof XSchema>`
- NEVER define separate TypeScript interfaces and Zod schemas — derive one from the other

## Schema Pattern
```typescript
import { z } from 'zod';

export const ContainerSchema = z.object({
  id: z.string().regex(/^[a-f0-9]+$/),
  name: z.string(),
  status: z.enum(['running', 'stopped', 'paused', 'restarting']),
  ports: z.array(z.object({
    host: z.number().int().positive(),
    container: z.number().int().positive(),
    protocol: z.enum(['tcp', 'udp']),
  })),
});

export type Container = z.infer<typeof ContainerSchema>;
```

## Dual Purpose: Validation + LLM
Schemas serve two roles:
1. **Runtime validation**: `Schema.parse(data)` throws on invalid data
2. **LLM structured output**: `zodResponseFormat(Schema, 'name')` for OpenAI

Design tips:
- Use clear field names (LLM needs to understand the schema)
- Add `.describe()` to ambiguous fields
- Keep schemas flat when possible — deeply nested schemas confuse LLMs

## Rules
- NEVER use `z.any()` — always be specific
- NEVER skip validation — every parsed result gets `.parse()`
- Prefer `z.enum()` over `z.string()` for known value sets
- Use `z.coerce.number()` when parsing string numbers from terminal output
- Export both the schema AND the inferred type
