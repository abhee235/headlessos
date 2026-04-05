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
| M4.3 | Parser: `ps aux` | [phase-4](phases/phase-4.md) | `server/src/parsers/deterministic/ps.ts` | ⬜ |
| M4.4 | Parser: `ls -la` | [phase-4](phases/phase-4.md) | `server/src/parsers/deterministic/ls.ts` | ⬜ |
| M4.5 | Parser: `ip -brief addr` | [phase-4](phases/phase-4.md) | `server/src/parsers/deterministic/ip.ts` | ✅ |
| M4.6 | Parser: `systemctl` | [phase-4](phases/phase-4.md) | `server/src/parsers/deterministic/systemctl.ts` | ⬜ |
| M4.7 | Caching Layer | [phase-4](phases/phase-4.md) | `server/src/cache/cache.ts` | ⬜ |
| M4.8 | LLM Usage Stats | [phase-4](phases/phase-4.md) | `server/src/routes/stats.ts` | ⬜ |
| M5.1 | Command Validation | [phase-5](phases/phase-5.md) | security validators | ⬜ |
| M5.2 | Path Validation | [phase-5](phases/phase-5.md) | security validators | ⬜ |
| M5.3 | Credential Encryption | [phase-5](phases/phase-5.md) | config/encryption | ⬜ |
| M5.4 | Error Handling | [phase-5](phases/phase-5.md) | across all routes | ⬜ |
| M5.5 | Test Suite | [phase-5](phases/phase-5.md) | `server/tests/` | ⬜ |
| M5.6 | UI Polish | [phase-5](phases/phase-5.md) | `client/src/components/` | ⬜ |

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
