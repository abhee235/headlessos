---
applyTo: "docs/**/*.md"
---

# Documentation Editing Rules

## Document-Driven Development
This project follows strict DDD. Documentation is the source of truth.

## When Editing Documentation
1. Cross-reference: if your change affects other docs, update them too
2. Keep consistent: terminology must match across all docs
3. Update PROGRESS.md: after any task completion, update checkboxes and changelog
4. ADR format: new architectural decisions go in DECISIONS.md

## Cross-Reference Map
| If you change... | Also check... |
|-----------------|---------------|
| ARCHITECTURE.md | CONTEXT.md, relevant phase doc, DECISIONS.md |
| phases/phase-{n}.md | PROGRESS.md, TRACEABILITY.md |
| API_SPEC.md | relevant phase doc, ARCHITECTURE.md |
| SECURITY.md | AGENTS.md, relevant phase doc |
| LLM_STRATEGY.md | ARCHITECTURE.md, relevant phase doc |
| DECISIONS.md | CONTEXT.md, relevant technical doc |
| PROGRESS.md | TRACEABILITY.md (if marking task complete) |

## PROGRESS.md Conventions
- `⬜` = Not started, `🔄` = In progress, `✅` = Complete
- Changelog entry format: `- YYYY-MM-DD: Brief description`

## NEVER
- Never remove documentation without moving content elsewhere
- Never change an ADR status without a superseding ADR
- Never edit docs without reading current content first
- Never add a task to a phase doc without a PROGRESS.md entry
