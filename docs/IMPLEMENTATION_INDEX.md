# Implementation Plan — Index

> This file is the **index** for the implementation plan. Detailed specs live in per-phase files under `docs/phases/`.
> This keeps each file manageable as the project grows.

## Phase Overview

| Phase | Focus | Duration | Status | Details |
|-------|-------|----------|--------|---------|
| Phase 0 | Project scaffolding | Day 1-2 | Not started | [phase-0.md](phases/phase-0.md) |
| Phase 1 | SSH + Terminal + LLM parsing | Week 1 | Not started | [phase-1.md](phases/phase-1.md) |
| Phase 2 | Dashboard + File Explorer | Week 2 | Not started | [phase-2.md](phases/phase-2.md) |
| Phase 3 | Docker + Processes + Services | Week 3 | Not started | [phase-3.md](phases/phase-3.md) |
| Phase 4 | Deterministic parsers + caching | Week 4 | Not started | [phase-4.md](phases/phase-4.md) |
| Phase 5 | Polish, security, testing | Week 5 | Not started | [phase-5.md](phases/phase-5.md) |
| Phase 6 | Desktop UI system | Week 6-7 | In progress | [phase-6.md](phases/phase-6.md) |
| Phase 7 | System settings + Server Admin | Week 8 | In progress | [phase-7.md](phases/phase-7.md) |
| **Phase EX1** | **Dynamic UI Engine (Experimental)** | **TBD** | **Not started** | [phase-ex1.md](phases/phase-ex1.md) |
| **Phase EX2** | **UI Generation Agent (Experimental)** | **TBD** | **Not started** | [phase-ex2.md](phases/phase-ex2.md) |

## Task ID System

Every task has a unique ID: **`M{milestone}.{task}`** (e.g., `M1.4`)

This ID is the universal link across:
- **Phase docs** — detailed spec: `docs/phases/phase-{n}.md`
- **Traceability** — audit trail: [TRACEABILITY.md](TRACEABILITY.md)
- **Progress** — status dashboard: [PROGRESS.md](PROGRESS.md)
- **Git commits** — `feat(M1.4): implement command orchestrator`
- **Code comments** — `// M1.4: Command Orchestrator` at top of primary files

## Dependency Graph

```
Phase 0 (Foundation)
  └── Phase 1 (Core: SSH + Terminal + LLM + Orchestrator)
        ├── Phase 2 (Dashboard + Files)
        │     └── Phase 3 (Docker + Processes + Services)
        │           └── Phase 4 (Deterministic parsers + caching)
        ├── Phase 5 (Security + Testing + Polish) ← can start in parallel with Phase 4
        ├── Phase 6 (Desktop UI System) ← can start after Phase 3
        ├── Phase 7 (System Settings + Server Admin) ← depends on Phase 1 + Phase 6
        └── Phase EX1 (Dynamic UI Engine) ← depends on Phase 1 (LLM + Zod) + Phase 6 (shadcn/ui)
              ├── EX1 P1: JSON→UI Renderer (schema + widgets + layouts)
              ├── EX1 P2: LLM→JSON Generation (templates + streaming generator + command palette)
              └── EX1 P3: Full Integration (terminal capture + live refresh + desktop tabs + actions)
                    └── Phase EX2 (UI Generation Agent) ← depends on EX1.1 + EX1.2 + EX1.7
                          ├── EX2 P1: Agent Core (model router + tools + guardrails + context + reactive loop)
                          ├── EX2 P2: Interactive UIs (FormWidget + write-back + error recovery)
                          └── EX2 P3: Frontend Integration (agent panel + WebSocket + hooks)
```

## Quick Links

| I need... | Go to... |
|-----------|----------|
| Detailed task spec | `docs/phases/phase-{n}.md` |
| Current task status | [PROGRESS.md](PROGRESS.md) |
| What files a task created | [TRACEABILITY.md](TRACEABILITY.md) |
| Architecture decisions | [DECISIONS.md](DECISIONS.md) |
| System architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| API endpoints | [API_SPEC.md](API_SPEC.md) |

## Document Lifecycle

```
1. Task starts     → Read phase doc for spec
2. During work     → Code files reference Task ID in header comment
3. Task completes  → Update TRACEABILITY.md (files, commits, verification)
                   → Update PROGRESS.md (status checkbox)
                   → If spec deviated, update phase doc to match reality
4. Phase completes → Update this index (status column)
                   → Archive milestone summary in docs/archive/
```

## Archiving Completed Phases

When a full phase is complete:
1. Mark this index's status as "✅ Complete"
2. Create `docs/archive/M{n}-summary.md` with:
   - What was built
   - Any deviations from original spec
   - Lessons learned
3. The phase doc stays in `docs/phases/` as the historical record
4. PROGRESS.md collapses the milestone to a one-liner

This prevents PROGRESS.md and this file from growing unbounded.
