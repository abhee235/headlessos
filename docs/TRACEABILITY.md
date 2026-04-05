# Traceability Matrix

> Links every task to its documentation, code files, and git commits.
> Updated after each task completion to maintain a full audit trail.

## How This Works

Every task has a **Task ID** (format: `M{milestone}.{task}`, e.g., `M1.4`).

This ID is used consistently across:
1. **This file** — records what was built, where, and when
2. **Git commits** — `feat(M1.4): implement command orchestrator`
3. **Code comments** — `// M1.4: Command Orchestrator` (at the top of primary files)
4. **Phase docs** — `docs/phases/phase-{n}.md` (detailed spec per task)
5. **PROGRESS.md** — current status dashboard

### Git Commit Convention

```
feat(M1.4): implement command orchestrator
fix(M2.3): handle SFTP timeout on large directories
refactor(M1.1): extract retry logic into shared utility
docs(M0): update phase-0 after scaffolding complete
test(M4.1): add edge case fixtures for df parser
```

Format: `{type}({taskID}): {description}`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

### Code File Header Convention

Every primary file created by a task includes a comment header:

```typescript
/**
 * M1.4: Command Orchestrator
 * @see docs/phases/phase-1.md#task-14-command-orchestrator
 *
 * Handles multi-command execution, parallel runs, retry with
 * error context, and command fallbacks.
 */
```

---

## Completed Tasks

<!-- 
After completing a task, add an entry here:

### M{x}.{y}: Task Title
- **Status:** ✅ Complete
- **Date:** YYYY-MM-DD
- **Phase Doc:** [phase-{x}.md](phases/phase-{x}.md#task-xy)
- **Files Created:**
  - `path/to/file1.ts`
  - `path/to/file2.ts`
- **Files Modified:**
  - `path/to/existing.ts` — added XYZ
- **Tests:**
  - `server/tests/path/to/test.test.ts`
- **Commits:**
  - `abc1234` feat(M{x}.{y}): description
- **Verification:** All checks passed ✅
- **Notes:** Any deviations from spec, discovered issues, etc.
-->

_No tasks completed yet._

## M1.1: SSH Connection Manager

- **Files Created:**
  - `server/src/ssh/connection-manager.ts`
- **Verification:** TypeScript compiles, service registers in container ✅

## M1.2: LLM Provider + OpenAI

- **Files Created:**
  - `server/src/llm/provider.ts` — LLMProvider interface, SYSTEM_PROMPT, buildTextPrompt
  - `server/src/llm/providers/openai.ts` — OpenAIProvider using responses.parse + zodTextFormat
- **Verification:** TypeScript compiles, OpenAI SDK v5.23 API validated ✅

## M1.3: Parsing Pipeline

- **Files Created:**
  - `server/src/parsers/pipeline.ts`
- **Verification:** TypeScript compiles, registers as service ✅

## M1.4: Command Orchestrator

- **Files Created:**
  - `server/src/orchestrator/orchestrator.ts`
- **Verification:** TypeScript compiles, parallel execution + retry logic implemented ✅

## M1.5: Terminal WebSocket Bridge

- **Files Created:**
  - `server/src/routes/terminal.ts`
- **Verification:** TypeScript compiles, WebSocket route registered ✅

## M1.6: Config Store

- **Files Created:**
  - `server/src/config/store.ts`
- **Verification:** CRUD via REST API works, persists to `~/.headlessos/servers.json` ✅

## M1.7: API Routes (Phase 1)

- **Files Created:**
  - `server/src/routes/servers.ts`
- **Modified:**
  - `server/src/index.ts` — wired all services + routes
- **Verification:** `GET/POST/PUT/DELETE /api/servers` all work, connect/disconnect/status endpoints registered ✅

## M1.8: Frontend Shell (Layout)

- **Files Created:**
  - `client/src/store/app-store.ts` — Zustand store with servers, tabs, terminal state
  - `client/src/lib/api.ts` — API client for server CRUD + connection
  - `client/src/components/Shell/Sidebar.tsx` — server list + connection controls
  - `client/src/components/Shell/TabContainer.tsx` — tab bar + content area
  - `client/src/components/Shell/TerminalPanel.tsx` — bottom toggle panel
  - `client/src/components/Shell/Layout.tsx` — main layout composition
- **Modified:**
  - `client/src/App.tsx` — replaced Phase 0 status card with Shell Layout
- **Verification:** TypeScript compiles, UI renders at :3000 ✅

## M1.9: Terminal Component (xterm.js)

- **Files Created:**
  - `client/src/components/Terminal/TerminalView.tsx` — xterm.js + FitAddon + AttachAddon + WebSocket
- **Verification:** TypeScript compiles, component integrated into TerminalPanel ✅

## M2.1: Dashboard Backend

- **Status:** ✅ Complete
- **Date:** 2026-04-04
- **Phase Doc:** [phase-2.md](phases/phase-2.md)
- **Files Created:**
  - `server/src/parsers/schemas/system.ts` — Zod schemas: SystemInfo, DiskUsage, MemoryInfo, Network, SystemDashboard
  - `server/src/parsers/deterministic/df.ts` — Deterministic parser for `df -h`
  - `server/src/parsers/deterministic/free.ts` — Deterministic parser for `free -m`
  - `server/src/parsers/deterministic/ip.ts` — Deterministic parser for `ip -brief addr`
  - `server/src/parsers/deterministic/system-info.ts` — Combined parser for `uname -a && uptime -p && cat /etc/os-release`
  - `server/src/parsers/deterministic/index.ts` — Barrel export of all parsers
  - `server/src/routes/system.ts` — 3 endpoints: full dashboard, disk-only, memory-only
- **Files Modified:**
  - `server/src/index.ts` — registered deterministic parsers + system routes
- **Verification:** All 3 endpoints return valid JSON via curl, all 4 steps parsed deterministically in ~8ms ✅
- **Notes:** Also satisfies M4.1 (df), M4.2 (free), M4.5 (ip) — these parsers were built as part of the dashboard.

## M2.2: Dashboard Frontend

- **Status:** ✅ Complete
- **Date:** 2026-04-04
- **Phase Doc:** [phase-2.md](phases/phase-2.md)
- **Files Created:**
  - `client/src/components/Dashboard/DashboardView.tsx` — Main dashboard with auto-refresh, loading/error states
  - `client/src/components/Dashboard/UptimeCard.tsx` — System info card: uptime, OS, kernel, arch
  - `client/src/components/Dashboard/MemoryCard.tsx` — RAM/Swap progress bars with percentages
  - `client/src/components/Dashboard/DiskCard.tsx` — Disk usage bars, color-coded by utilization
  - `client/src/components/Dashboard/NetworkCard.tsx` — Interface list with status and IPs
  - `client/src/lib/apps.ts` — App definitions registry (Dashboard, Files)
- **Files Modified:**
  - `client/src/lib/api.ts` — added SystemDashboard types + fetchSystemDashboard()
  - `client/src/components/Shell/TabContainer.tsx` — renders DashboardView/FileExplorerView by appId
  - `client/src/components/Shell/Sidebar.tsx` — added APPS launcher section
- **Verification:** Chrome DevTools MCP screenshot — dashboard renders with real data (hostname, OS, memory, disk, network) ✅

## M2.3: File Explorer Backend

- **Status:** ✅ Complete
- **Date:** 2026-04-04
- **Phase Doc:** [phase-2.md](phases/phase-2.md)
- **Files Created:**
  - `server/src/security/validators.ts` — validatePath, shellEscape, validateContainerId, validatePid, validateServiceName
  - `server/src/routes/files.ts` — 7 SFTP endpoints: list, read, write, mkdir, rename, delete, download
- **Files Modified:**
  - `server/src/index.ts` — registered file routes
- **Verification:** curl verified directory listing, file read, path traversal blocked (400 response) ✅
- **Notes:** Also contributes to M5.1/M5.2 — security validators built early.

## M2.4: File Explorer Frontend

- **Status:** ✅ Complete
- **Date:** 2026-04-04
- **Phase Doc:** [phase-2.md](phases/phase-2.md)
- **Files Created:**
  - `client/src/components/FileExplorer/FileExplorerView.tsx` — Breadcrumb navigation, directory loading, file viewer integration
  - `client/src/components/FileExplorer/FileList.tsx` — Table view with Name/Size/Modified/Permissions, inline rename, delete with confirm
  - `client/src/components/FileExplorer/FileViewer.tsx` — Text file editor with save, modified indicator
  - `client/src/components/FileExplorer/FileActions.tsx` — New File/New Folder buttons with inline input
- **Files Modified:**
  - `client/src/lib/api.ts` — added file CRUD functions (fetchFiles, readFile, writeFile, createDirectory, renameFile, deleteFile)
- **Verification:** Chrome DevTools MCP — root listing displays, directory navigation works, file operations verified ✅

## M2.5: File Operations (CRUD)

- **Status:** ✅ Complete
- **Date:** 2026-04-04
- **Phase Doc:** [phase-2.md](phases/phase-2.md)
- **Files:** Integrated across M2.3 + M2.4 files
- **Verification:** End-to-end in browser: create file → edit → save (75B) → rename → create folder → delete folder → delete file. All operations confirmed via API ✅

## M2.6: Auto-Refresh

- **Status:** ✅ Complete
- **Date:** 2026-04-04
- **Phase Doc:** [phase-2.md](phases/phase-2.md)
- **Files:** `client/src/components/Dashboard/DashboardView.tsx` — setInterval at 30s, "last updated" timestamp display
- **Verification:** Dashboard shows latency (5ms) and "just now" timestamp, updates on interval ✅

---

## Task Index (Quick Reference)

| Task ID | Title | Phase Doc | Primary Files | Status |
|---------|-------|-----------|---------------|--------|
| M0.1 | Initialize Monorepo | [phase-0](phases/phase-0.md) | `package.json`, `server/`, `client/`, `shared/` | ✅ |
| M0.2 | Service Container | [phase-0](phases/phase-0.md) | `server/src/services/base-service.ts`, `container.ts` | ✅ |
| M0.3 | Shared Types | [phase-0](phases/phase-0.md) | `shared/types.ts` | ✅ |
| M0.4 | Fastify Server Setup | [phase-0](phases/phase-0.md) | `server/src/index.ts` | ✅ |
| M0.5 | React + Vite + Tailwind | [phase-0](phases/phase-0.md) | `client/src/App.tsx`, `vite.config.ts` | ✅ |
| M0.6 | Dev Script | [phase-0](phases/phase-0.md) | root `package.json` | ✅ |
| M1.1 | SSH Connection Manager | [phase-1](phases/phase-1.md) | `server/src/ssh/connection-manager.ts` | ✅ |
| M1.2 | LLM Provider + OpenAI | [phase-1](phases/phase-1.md) | `server/src/llm/provider.ts`, `providers/openai.ts` | ✅ |
| M1.3 | Parsing Pipeline | [phase-1](phases/phase-1.md) | `server/src/parsers/pipeline.ts` | ✅ |
| M1.4 | Command Orchestrator | [phase-1](phases/phase-1.md) | `server/src/orchestrator/orchestrator.ts` | ✅ |
| M1.5 | Terminal WebSocket | [phase-1](phases/phase-1.md) | `server/src/routes/terminal.ts` | ✅ |
| M1.6 | Config Store | [phase-1](phases/phase-1.md) | `server/src/config/store.ts` | ✅ |
| M1.7 | API Routes (Phase 1) | [phase-1](phases/phase-1.md) | `server/src/routes/servers.ts` | ✅ |
| M1.8 | Frontend Shell | [phase-1](phases/phase-1.md) | `client/src/components/Shell/`, `store/app-store.ts`, `lib/api.ts` | ✅ |
| M1.9 | Terminal Component | [phase-1](phases/phase-1.md) | `client/src/components/Terminal/TerminalView.tsx` | ✅ |
| M2.1 | Dashboard Backend | [phase-2](phases/phase-2.md) | `server/src/routes/system.ts`, `parsers/schemas/system.ts`, `parsers/deterministic/*.ts` | ✅ |
| M2.2 | Dashboard Frontend | [phase-2](phases/phase-2.md) | `client/src/components/Dashboard/`, `lib/apps.ts` | ✅ |
| M2.3 | File Explorer Backend | [phase-2](phases/phase-2.md) | `server/src/routes/files.ts`, `security/validators.ts` | ✅ |
| M2.4 | File Explorer Frontend | [phase-2](phases/phase-2.md) | `client/src/components/FileExplorer/` | ✅ |
| M2.5 | File Operations | [phase-2](phases/phase-2.md) | (integration across files routes + frontend) | ✅ |
| M2.6 | Auto-Refresh | [phase-2](phases/phase-2.md) | `client/src/components/Dashboard/DashboardView.tsx` | ✅ |
| M3.1 | Docker Backend | [phase-3](phases/phase-3.md) | `server/src/routes/docker.ts` | ⬜ |
| M3.2 | Docker Frontend | [phase-3](phases/phase-3.md) | `client/src/components/Docker/` | ⬜ |
| M3.3 | Docker Log Streaming | [phase-3](phases/phase-3.md) | WebSocket log handler | ⬜ |
| M3.4 | Process Manager Backend | [phase-3](phases/phase-3.md) | `server/src/routes/processes.ts` | ⬜ |
| M3.5 | Process Manager Frontend | [phase-3](phases/phase-3.md) | `client/src/components/Processes/` | ⬜ |
| M3.6 | Services Manager | [phase-3](phases/phase-3.md) | `server/src/routes/services.ts` | ⬜ |
| M4.1 | Parser: `df -h` | [phase-4](phases/phase-4.md) | `server/src/parsers/deterministic/df.ts` | ✅ |
| M4.2 | Parser: `free -m` | [phase-4](phases/phase-4.md) | `server/src/parsers/deterministic/free.ts` | ✅ |
| M4.3 | Parser: `ps aux` | [phase-4](phases/phase-4.md) | `server/src/parsers/deterministic/ps-aux.ts` (done in M7.1) | ✅ |
| M4.4 | Parser: `ls -la` | [phase-4](phases/phase-4.md) | N/A — skipped (SFTP readdir() used) | ⏭️ |
| M4.5 | Parser: `ip -brief addr` | [phase-4](phases/phase-4.md) | `server/src/parsers/deterministic/ip.ts` | ✅ |
| M4.6 | Parser: `systemctl` | [phase-4](phases/phase-4.md) | `server/src/parsers/deterministic/systemctl.ts`, `schemas/services.ts` | ✅ |
| M4.7 | Caching Layer | [phase-4](phases/phase-4.md) | `server/src/cache/output-cache.ts` | ✅ |
| M4.8 | LLM Usage Stats | [phase-4](phases/phase-4.md) | `server/src/llm/usage-tracker.ts`, `server/src/routes/stats.ts` | ✅ |
| M5.1 | Command Validation | [phase-5](phases/phase-5.md) | `server/src/security/validators.ts` | ✅ |
| M5.2 | Path Validation | [phase-5](phases/phase-5.md) | `server/src/security/validators.ts` | ✅ |
| M5.3 | Credential Encryption | [phase-5](phases/phase-5.md) | `server/src/security/encryption.ts`, `server/src/config/store.ts` | ✅ |
| M5.4 | Error Handling | [phase-5](phases/phase-5.md) | `server/src/security/validators.ts` (sanitizeErrorMessage, shellEscape) | ✅ |
| M5.5 | Test Suite | [phase-5](phases/phase-5.md) | `server/tests/security/` (81 + 22 tests) | ✅ |
| M5.6 | UI Polish | [phase-5](phases/phase-5.md) | `client/src/components/` (Terminal, Desktop, FileViewer, Dashboard, Login) | ✅ |
| M7.1 | Terminal Settings | [phase-7](phases/phase-7.md) | `client/src/store/preferences-store.ts`, `client/src/components/Terminal/TerminalView.tsx` | ✅ |
| M7.2 | Server Admin App | [phase-7](phases/phase-7.md) | See M7.2 detailed entry below | ✅ |

---

## M7.2: Server Admin App

**Status:** ✅ Complete  
**Spec:** [phase-7.md](phases/phase-7.md)  

### Files Created

| File | Purpose |
|------|---------|
| `server/src/parsers/schemas/serveradmin.ts` | 18+ Zod schemas for all 8 sections |
| `server/src/parsers/deterministic/ss.ts` | parseSsListening, parseSsConnections |
| `server/src/parsers/deterministic/ufw.ts` | parseUfwStatus |
| `server/src/parsers/deterministic/etc-passwd.ts` | parseEtcPasswd |
| `server/src/parsers/deterministic/who.ts` | parseWho, parseLast |
| `server/src/parsers/deterministic/sshd-config.ts` | parseSshdConfig |
| `server/src/parsers/deterministic/nginx.ts` | parseNginxSites, parseNginxConfigTest, parseCertbotCertificates |
| `server/src/parsers/deterministic/apt.ts` | parseAptUpgradable, parseDpkgCount |
| `server/src/parsers/deterministic/crontab.ts` | parseCrontab, parseSystemCrontab |
| `server/src/parsers/deterministic/du.ts` | parseDu |
| `server/src/parsers/deterministic/findmnt.ts` | parseFindmnt, parseSwapon |
| `server/src/parsers/deterministic/ip-route.ts` | parseIpRoute, parseResolvConf |
| `server/src/parsers/deterministic/journalctl.ts` | parseJournalctl, parseDmesg |
| `server/src/routes/serveradmin.ts` | 11 REST endpoints (8 GET, 2 POST, 1 DELETE) |
| `client/src/components/ServerAdmin/ServerAdminView.tsx` | Main shell with sidebar navigation |
| `client/src/components/ServerAdmin/NetworkSection.tsx` | Ports, connections, routes, DNS |
| `client/src/components/ServerAdmin/FirewallSection.tsx` | UFW CRUD + toggle |
| `client/src/components/ServerAdmin/SecuritySection.tsx` | Users, sessions, SSH config, fail2ban |
| `client/src/components/ServerAdmin/WebServerSection.tsx` | Nginx sites, config test, SSL certs |
| `client/src/components/ServerAdmin/PackagesSection.tsx` | Installed count, upgradable packages |
| `client/src/components/ServerAdmin/CronSection.tsx` | Cron job list |
| `client/src/components/ServerAdmin/LogsSection.tsx` | Journal/dmesg/syslog viewer |
| `client/src/components/ServerAdmin/StorageSection.tsx` | Mounts, dir sizes, swap |
| `server/tests/parsers/serveradmin-parsers.test.ts` | 51 parser tests covering all 23 parsers |

### Files Modified

| File | Change |
|------|--------|
| `server/src/parsers/deterministic/index.ts` | Barrel export expanded from 8 to 31 parsers |
| `server/src/index.ts` | Registered serverAdminRoutes |
| `client/src/components/ui/FileIcon.tsx` | Added ServerAdminIcon |
| `client/src/lib/apps.ts` | Added serveradmin AppDefinition |
| `client/src/store/window-store.ts` | Added serveradmin defaults + singleInstance |
| `client/src/components/Desktop/WindowManager.tsx` | Added ServerAdminView case |
| `client/src/components/Desktop/Desktop.tsx` | Added desktop icon + context menu entry |
| `client/src/lib/api.ts` | Added 8 interfaces + 11 API functions |

### Verification

- TypeScript: Clean (only pre-existing FileStatInfo error)
- Tests: 137 total (95 server + 42 client), all passing
- Parser tests: 51 dedicated tests covering all 23 new parsers

---

## M5.1–M5.5: Security Hardening + Test Suite

**Status:** ✅ Complete  
**Spec:** [phase-5.md](phases/phase-5.md)  

### Files Created

| File | Purpose |
|------|---------|
| `server/src/security/encryption.ts` | AES-256-GCM credential encryption: encrypt, decrypt, isEncrypted |
| `server/tests/security/encryption.test.ts` | 22 tests for encryption module (roundtrip, unicode, backward compat) |

### Files Rewritten

| File | Change |
|------|--------|
| `server/src/security/validators.ts` | 53 → 367 lines: ALLOWED_COMMANDS (60+ patterns), BLOCKED_COMMANDS (17 patterns), SecurityError class, enhanced validators (containerId 12-64 hex, PID 1-4194304, signal 1-31), new validators (validateDockerImageRef, validateISODate, validateLogSource, validatePositiveInt), sanitizeErrorMessage |
| `server/tests/security/validators.test.ts` | 16 → 81 tests: full coverage of all validators, allowlist/blocklist, shellEscape, sanitizeErrorMessage, constants integrity |

### Files Modified (Security Hardening)

| File | Change |
|------|--------|
| `server/src/config/store.ts` | Encrypt passwords on save (AES-256-GCM), decrypt on load, auto-migrate plaintext, file perms 0600/0700 |
| `server/src/routes/serveradmin.ts` | Fixed CRITICAL: validate unit with validateServiceName + shellEscape, validate source with validateLogSource |
| `server/src/routes/docker.ts` | Fixed CRITICAL: replaced start-only since regex with validateISODate + shellEscape, removed local isValidDockerRef, shellEscape on docker run args |
| `server/src/routes/services.ts` | Replaced local isValidServiceName with central validateServiceName, added shellEscape to systemctl/journalctl |
| `server/src/routes/taskmanager.ts` | Added validateSignal import and usage for kill endpoint |
| `docs/PROGRESS.md` | M5.1-M5.5 marked ✅, milestone 5/6, changelog entry |

### Security Findings Fixed

| Severity | Location | Issue | Fix |
|----------|----------|-------|-----|
| CRITICAL | serveradmin.ts logs | `unit` param interpolated into journalctl with zero validation | validateServiceName + shellEscape |
| CRITICAL | docker.ts logs | `since` validated with start-only regex `^\d{4}-\d{2}-\d{2}` allowing injection after date | validateISODate (fully anchored) + shellEscape |
| HIGH | docker.ts run | env vars, volumes, command args joined without escaping | shellEscape on all user values |
| MEDIUM | docker.ts, services.ts | Duplicate local validators instead of central | Unified to central validators.ts |
| MEDIUM | docker.ts | isValidDockerRef too permissive | Replaced with isValidContainerIdParam (hex 12-64) |

### Verification

- TypeScript: Clean (only pre-existing FileStatInfo error)
- Tests: 224 total (182 server + 42 client), all passing
- Security validator tests: 81
- Encryption tests: 22
- All 2 CRITICAL + 1 HIGH injection vectors fixed

---

## M5.6: UI Polish

**Status:** ✅ Complete  
**Spec:** [phase-5.md](phases/phase-5.md)  

### Files Modified

| File | Change |
|------|--------|
| `client/src/components/Terminal/TerminalView.tsx` | Added loading overlay, context menu (Copy/Paste/Clear/Select All), reconnect banner, theme-aware dark/light colors, connection status tracking |
| `client/src/components/Desktop/Desktop.tsx` | Wired View submenu (icon sizes), Sort by submenu, Refresh handler, About HeadlessOS dialog, dynamic icon sizing from preferences |
| `client/src/components/Desktop/DesktopLayout.tsx` | Global keyboard shortcuts: F5 (refresh), Ctrl/Cmd+Shift+Esc (Task Manager) |
| `client/src/components/FileExplorer/FileViewer.tsx` | Replaced `alert()` with `toast()`, added success toast on save, added Retry button on error state |
| `client/src/components/FileExplorer/FileList.tsx` | Replaced `alert()` with `toast()` for delete/rename errors |
| `client/src/components/FileExplorer/FileActions.tsx` | Replaced `alert()` with `toast()` for create errors |
| `client/src/components/Dashboard/DashboardView.tsx` | Added proper empty state with Refresh button (replaced `return null`) |
| `client/src/components/Login/LoginScreen.tsx` | Added loading spinner while fetching servers (`loadingServers` state) |
| `client/src/store/preferences-store.ts` | Added `desktopIconSize` (small/medium/large) and `desktopSortBy` (name/type/date) preferences with persistence |
| `docs/phases/phase-5.md` | Expanded M5.6 spec into 5 detailed subtasks (M5.6a-M5.6e) |
| `docs/PROGRESS.md` | M5.6 marked ✅, M5 milestone 6/6, changelog entry |

### Verification

- TypeScript: Clean compilation (zero errors)
- Tests: 224 total (182 server + 42 client), all passing
- Zero `alert()` calls remaining in codebase
- All desktop context menu items functional
- Terminal has loading, context menu, reconnect UI, theme-aware colors
- Global shortcuts: F5 and Cmd+Shift+Esc working

---

## M4.6–M4.8: Deterministic Parsers + Caching + LLM Stats

**Status:** ✅ Complete  
**Spec:** [phase-4.md](phases/phase-4.md)  

### Context

M4.1, M4.2, M4.5 were already done in M2.1. M4.3 (ps-aux) was done in M7.1. M4.4 (ls-la) skipped — project uses SFTP. This entry covers the remaining M4.6, M4.7, M4.8 tasks.

### Files Created

| File | Purpose |
|------|---------|
| `server/src/parsers/schemas/services.ts` | Zod schema: `ServiceInfoSchema`, `ServiceListSchema` |
| `server/src/parsers/deterministic/systemctl.ts` | `parseSystemctlListUnits` — extracted from services.ts inline parser |
| `server/src/cache/output-cache.ts` | `OutputCache` — hash-based cache with TTL, stats, server invalidation |
| `server/src/llm/usage-tracker.ts` | `LLMUsageTracker` — tracks tokens, cost, latency per LLM call |
| `server/src/routes/stats.ts` | `GET /api/stats/llm` + `POST /api/stats/llm/reset` |
| `server/tests/parsers/systemctl.test.ts` | 11 tests for systemctl parser + Zod validation |
| `server/tests/cache/output-cache.test.ts` | 12 tests for OutputCache (get/set/TTL/invalidate/stats) |
| `server/tests/llm/usage-tracker.test.ts` | 13 tests for LLMUsageTracker (recording, cost, models, reset) |

### Files Modified

| File | Change |
|------|--------|
| `server/src/parsers/deterministic/index.ts` | Added systemctlParser to allParsers[] (31 → 32 parsers) |
| `server/src/routes/services.ts` | Removed inline parseServiceList(), imported parseSystemctlListUnits from deterministic parser |
| `server/src/parsers/pipeline.ts` | Added cache integration (check before parse, store after), usage tracker recording, `parsedBy: 'cache'` variant |
| `server/src/orchestrator/orchestrator.ts` | Pass serverId to pipeline.parse() for cache keying, updated StepResult.parsedBy to include 'cache' |
| `server/src/index.ts` | Created OutputCache + LLMUsageTracker, wired to pipeline, registered statsRoutes, added serveradmin to auto-reconnect, cache stats in /api/v1/status |
| `AGENTS.md` | Added Output Cache + LLM Usage Tracking patterns to §7 Backend Patterns |
| `.github/copilot-instructions.md` | Added Output Cache + LLM Usage Tracking to Key Patterns |
| `docs/phases/phase-4.md` | Complete rewrite with current state: M4.3 done, M4.4 skipped, M4.6-M4.8 detailed specs |
| `docs/PROGRESS.md` | M4 marked ✅ 8/8, all tasks updated, changelog entry |

### Verification

- TypeScript: Clean (only pre-existing FileStatInfo error)
- Tests: 260 total (218 server + 42 client), all passing
- Systemctl parser: 11 tests (typical, failed, mixed states, sorting, filtering, edge cases)
- OutputCache: 12 tests (get/set, TTL expiration, invalidation, stats, reset)
- LLM Usage Tracker: 13 tests (recording, cost estimation, model pricing, reset)
- Pipeline integrates cache and usage tracker seamlessly

---

## How to Use This File

### After completing a task:
1. Copy the template from "Completed Tasks" section
2. Fill in all fields (files, commits, verification)
3. Update the Task Index status from ⬜ to ✅
4. Also update PROGRESS.md

### When refactoring:
If a later task modifies files created by an earlier task, add a note:
```markdown
- **Modified by:** M2.1 — added system dashboard route alongside server routes
```

### Finding what created a file:
Search this file for the filename to find which task created or last modified it.
