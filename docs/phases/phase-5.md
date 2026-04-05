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

Based on a full component audit (2026-04-06), M5.6 is broken into 5 subtasks:

### M5.6a: Toast/Alert Consistency
- Replace `alert()` with `toast()` in **FileViewer** (save errors)
- Ensure `toast()` is used consistently for user-facing notifications

### M5.6b: Terminal UI Polish
- Add **loading state** while WebSocket connects (spinner overlay)
- Add **context menu** on terminal: Copy, Paste, Clear, Select All
- Add **reconnect button/UI** when disconnected (not just inline red text)
- Adapt terminal **background to light/dark theme** (currently hardcoded dark)

### M5.6c: Desktop Context Menu Wiring
- Wire **Refresh** handler (refresh active window/desktop)
- Wire **View** submenu (icon size, arrangement — store in preferences)
- Wire **Sort by** submenu (name, date, size, type)
- Wire **About HeadlessOS** dialog (version, tech stack, credits)
- Wire **Ctrl+Shift+Esc** shortcut label to actually open Task Manager

### M5.6d: Empty/Loading State Fixes
- **DashboardView**: Show proper empty state message instead of returning `null`
- **DashboardView**: Add context menus on cards (Copy hostname, Refresh)
- **LoginScreen**: Show spinner while `loadingServers` is true
- **TerminalView disconnected**: Replace inline text with proper DisconnectedState-style UI

### M5.6e: Global Keyboard Shortcuts
- Register global `keydown` listener for:
  - **F5**: Refresh active view
  - **Ctrl+Shift+Esc** (or **Cmd+Shift+Esc**): Open Task Manager
- Ensure shortcuts shown in context menus actually work

> **Out of scope** (tracked elsewhere):
> - File clipboard ops (Cut/Copy/Paste) → M6.7
> - Skeleton loading placeholders → nice-to-have, not required (spinners are adequate)
> - ServerAdmin section context menus → low priority (table rows are display-only)
> - "Open in Terminal" from file explorer → requires terminal tab integration

**Verification:**
- [ ] No `alert()` calls remain in the codebase
- [ ] Terminal has loading, context menu, reconnect, theme adaptation
- [ ] Desktop context menu items all functional (no dead handlers)
- [ ] All views handle loading, error, empty states
- [ ] F5 and Ctrl/Cmd+Shift+Esc shortcuts work globally
- [ ] All tests pass
