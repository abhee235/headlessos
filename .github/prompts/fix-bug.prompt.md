---
description: "Diagnose and fix a bug with proper testing"
mode: "agent"
---

# Bug Fix

Diagnose and fix a bug in HeadlessOS.

## Workflow

1. Reproduce — understand the bug from the description
2. Locate — find the relevant source files
3. Diagnose — identify the root cause
4. Fix — make the minimal change needed
5. Test — write a regression test proving the fix works
6. Verify — run `npm test` to ensure nothing else broke

## Key references
- File location guide: see [AGENTS.md](../../AGENTS.md) §18
- Architecture: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- API spec: [docs/API_SPEC.md](../../docs/API_SPEC.md)

## Rules
- Write a regression test BEFORE marking the fix done
- Don't refactor unrelated code
- If the fix touches security-sensitive code, review [docs/SECURITY.md](../../docs/SECURITY.md)

## Bug description

{input}
