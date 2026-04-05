# Phase 5: Polish, Security, Testing

> **Milestone:** M5 | **Duration:** Week 5 | **Status:** Not started
> **Prerequisites:** M4 complete (all parsers, caching)
> **Definition of Done:** Security hardened, tests passing, UI polished with proper loading/error states.

---

## Task 5.1: Command Validation + Allowlists

**Task ID:** `M5.1`
**Ref:** [SECURITY.md](../SECURITY.md)

Implement command allowlist validation, path sanitization, ID validators.

**Verification:**
- [ ] Blocked commands rejected
- [ ] Injection attempts prevented
- [ ] Path traversal attacks blocked

---

## Task 5.2: Path Validation + Sanitization

**Task ID:** `M5.2`
Implement and enforce `validatePath()`, `validateContainerId()`, `validatePid()`, `shellEscape()`.

**Verification:**
- [ ] Traversal attacks blocked (`../../etc/passwd`)
- [ ] Hex-only container IDs enforced
- [ ] Integer-only PIDs enforced

---

## Task 5.3: Credential Encryption

**Task ID:** `M5.3`
Encrypt passwords at rest in `~/.headlessos/servers.json`.

**Verification:**
- [ ] Passwords encrypted in file
- [ ] Decryption works on read

---

## Task 5.4: Error Handling

**Task ID:** `M5.4`
Graceful degradation: connection drops, LLM failures, timeouts. User feedback via toast/error states.

**Verification:**
- [ ] Connection drop shows meaningful error
- [ ] LLM failure retries, then returns error state
- [ ] Timeout handling for long commands

---

## Task 5.5: Test Suite

**Task ID:** `M5.5`
**Ref:** [TESTING.md](../TESTING.md)

Unit + integration tests. 80%+ coverage on parsers + security validators.

**Verification:**
- [ ] All parser tests pass
- [ ] All security validator tests pass
- [ ] Coverage ≥80% on targeted modules

---

## Task 5.6: UI Polish

**Task ID:** `M5.6`
> **Ref:** [ARCHITECTURE.md § Design Patterns](../ARCHITECTURE.md#design-patterns-reference-from-puter-analysis) — patterns 3, 4, 5

- Context menus for all data views (files, containers, processes, services)
- Single-instance tab enforcement
- Process tree visualization
- Loading/error/empty states for all views
- Dark theme, keyboard shortcuts, toast notifications

**Verification:**
- [ ] All states handled (loading, error, empty, data)
- [ ] Context menus work on all data views
- [ ] Single-instance tabs enforced
- [ ] Dark theme consistent
