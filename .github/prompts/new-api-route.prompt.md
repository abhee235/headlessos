---
description: "Add a new Fastify API route"
mode: "agent"
---

# New API Route

Add a new Fastify API endpoint to the HeadlessOS backend.

## File locations
- Route: `server/src/routes/{name}.ts`
- Register in: `server/src/index.ts` via `fastify.register()`

## Route template
```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Request/response schemas
const ParamsSchema = z.object({ /* ... */ });
const ResponseSchema = z.object({ /* ... */ });

export async function {name}Routes(fastify: FastifyInstance) {
  fastify.get('/api/{resource}', async (request, reply) => {
    // 1. Validate params
    // 2. Get services from container
    // 3. Execute via SSH/orchestrator
    // 4. Parse and validate response
    // 5. Return typed JSON
  });
}
```

## Rules
- Use Fastify patterns (`fastify.register()`, NOT Express)
- Validate ALL request params with Zod
- Never expose raw SSH errors — sanitize messages
- Use CommandOrchestrator for multi-command flows
- NEVER interpolate user input into shell commands
- See [docs/API_SPEC.md](../../docs/API_SPEC.md) for existing endpoints

## Endpoint to create

{input}
