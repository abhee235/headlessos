---
description: "Implement a new feature following the DDD workflow"
mode: "agent"
---

# New Feature Implementation

You are implementing a feature in the HeadlessOS project. Follow the DDD workflow strictly.

## Pre-flight checklist

1. Read [docs/CONTEXT.md](../../docs/CONTEXT.md) for project overview
2. Read [docs/PROGRESS.md](../../docs/PROGRESS.md) to find the current Task ID
3. Read the relevant phase doc in `docs/phases/phase-{n}.md` for the detailed spec
4. Check [docs/TRACEABILITY.md](../../docs/TRACEABILITY.md) for existing files in this area

## Implementation steps

1. Identify the Task ID (e.g., `M1.4` or `EX6-A.3`)
2. Read the spec from the phase doc
3. Write the code matching the spec exactly
4. Write tests (Vitest) — every feature needs tests
5. Run `npm test` to verify all tests pass
6. Update `docs/PROGRESS.md` — mark task ✅
7. Update `docs/TRACEABILITY.md` — record files created

## Key rules
- TypeScript strict, no `any`
- Backend: Fastify + ServiceContainer pattern
- Frontend: React 19 + Zustand + TailwindCSS
- All data validated with Zod schemas
- SSH via `ssh2` directly, SFTP for file ops
- See [AGENTS.md](../../AGENTS.md) for full ruleset

## User request

{input}
