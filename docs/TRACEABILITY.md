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

## M11.8: Electron Dynamic Port Signal (PORT=0 fix)

- **Status:** ✅ Complete
- **Date:** 2026-04-26
- **Phase Doc:** M11.2 (Electron Desktop Wrapper)
- **Files Modified:**
  - `server/src/index.ts` — fixed `PORT=0` guard (`!= null` instead of `||`); emits `HEADLESSOS_PORT:<actualPort>` to stdout after bind so the Electron `utilityProcess` parent can read the OS-assigned port
- **Tests:** Existing server suite unaffected
- **Commits:**
  - `fix(M11.8): emit HEADLESSOS_PORT signal and fix PORT=0 fallback`
- **Verification:** `electron/main.js` `stdout` handler already parses `HEADLESSOS_PORT:<n>`; server now emits the signal ✅
- **Notes:** `Number('0') || 3001` evaluated to 3001 (0 is falsy), causing PORT=0 to be silently ignored. Fixed with explicit null check.

## EX6-C.8: Branded Loading Spinner Rollout

- **Status:** ✅ Complete
- **Date:** 2026-04-18
- **Phase Doc:** [phase-ex6.md](phases/phase-ex6.md)
- **Files Created:**
  - `client/src/components/ui/spinner.tsx`
- **Files Modified:**
  - `client/src/components/Login/LoginScreen.tsx`
  - `client/src/components/Login/AddServerForm.tsx`
  - `client/src/components/Terminal/TerminalView.tsx`
  - `client/src/components/Services/ServicesView.tsx`
  - `client/src/components/Agent/AgentPanel.tsx`
  - `client/src/components/Agent/AgentView.tsx`
  - `client/src/components/Agent/UIAgentView.tsx`
  - `client/src/components/ServerAdmin/FirewallSection.tsx`
  - `client/src/components/ServerAdmin/LogsSection.tsx`
  - `client/src/components/ServerAdmin/PackagesSection.tsx`
  - `client/src/components/ServerAdmin/CronSection.tsx`
  - `client/src/components/ServerAdmin/SecuritySection.tsx`
  - `client/src/components/ServerAdmin/NetworkSection.tsx`
  - `client/src/components/ServerAdmin/StorageSection.tsx`
  - `client/src/components/ServerAdmin/WebServerSection.tsx`
  - `client/src/components/Desktop/WallpaperPicker.tsx`
  - `client/src/components/Desktop/SessionTile.tsx`
  - `client/src/components/FileExplorer/FileSearchDialog.tsx`
  - `client/src/components/FileExplorer/TrashDialog.tsx`
  - `client/src/components/FileExplorer/UploadDropZone.tsx`
  - `client/src/components/DynamicUI/DynamicUITabView.tsx`
  - `client/src/components/Observatory/ObservatoryView.tsx`
- **Verification:**
  - `npm run test:client` passed (36 files, 539 tests) ✅
  - Search check confirmed no `Loader2` usage remains in `client/src/**` ✅
- **Notes:**
  - `npm run build --workspace=client` reports unrelated pre-existing TypeScript errors in Dynamic UI and Command Palette type paths.

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
| M6.1 | Desktop & File Icons | [phase-6](phases/phase-6.md) | `client/src/components/ui/FileIcon.tsx` | ✅ |
| M6.2 | Context Menus | [phase-6](phases/phase-6.md) | `client/src/components/ui/context-menu.tsx` | ✅ |
| M6.3 | Wallpaper System | [phase-6](phases/phase-6.md) | `client/src/components/Desktop/Wallpaper.tsx`, `client/src/lib/wallpapers.ts` | ✅ |
| M6.4 | Theme System | [phase-6](phases/phase-6.md) | `client/src/styles.css`, `client/src/store/theme-store.ts` | ✅ |
| M6.5 | Window Chrome Polish | [phase-6](phases/phase-6.md) | `client/src/store/window-store.ts`, `client/src/components/Desktop/Window.tsx` | ✅ |
| M6.6 | Taskbar & Start Menu | [phase-6](phases/phase-6.md) | `client/src/components/Desktop/Taskbar.tsx`, `StartMenu.tsx` | ✅ |
| M6.7 | File Operations | [phase-6](phases/phase-6.md) | `client/src/store/clipboard-store.ts`, `server/src/routes/files.ts`, `FileListNew.tsx` | ✅ |
| M6.8 | Toast System | [phase-6](phases/phase-6.md) | `client/src/components/ui/sonner.tsx` | ✅ |
| M6.9 | Keyboard Shortcuts | [phase-6](phases/phase-6.md) | `client/src/hooks/useKeyboardShortcuts.ts`, `FileListNew.tsx` | ✅ |
| M6.10 | Selection & Multi-Select | [phase-6](phases/phase-6.md) | `client/src/hooks/useSelection.ts`, `FileListNew.tsx`, `FileExplorerView.tsx` | ✅ |
| M6.11 | Login Flow | [phase-6](phases/phase-6.md) | `client/src/components/Desktop/StartMenu.tsx`, `Login/` | ✅ |

---

## M7.4–M7.6: Appearance + General + Notifications

**Status:** ✅ Complete  
**Spec:** [phase-7.md](phases/phase-7.md)  

### Files Modified

| File | Change |
|------|--------|
| `client/src/store/preferences-store.ts` | Added 6 new fields (accentColorIndex, autoRefreshInterval, dateFormat, showToasts, toastPosition + setters), ACCENT_PRESETS (8 oklch entries), applyAccentColor(), resetAllPreferences(), DateFormat/ToastPosition types |
| `client/src/store/theme-store.ts` | Rewrote: Theme = 'dark'\|'light'\|'auto', resolvedTheme, prefers-color-scheme listener, applyTheme re-applies accent color |
| `client/src/components/Desktop/SettingsView.tsx` | 6-page sidebar (General/Appearance/Wallpaper/Terminal/Notifications/About), rewrote AppearancePage (accent swatches + theme auto + icon size), added GeneralPage (clock format + auto-refresh), added NotificationsPage (toast toggle/position + clear cache + reset all) |
| `client/src/components/Desktop/Taskbar.tsx` | Clock uses dateFormat preference (12h/24h), theme icon uses resolvedTheme |
| `client/src/components/ui/sonner.tsx` | Uses resolvedTheme, toastPosition, showToasts suppression |
| `client/src/components/Terminal/TerminalView.tsx` | Uses resolvedTheme instead of theme |
| `client/tests/store/preferences-store.test.ts` | Added 15 new tests for M7.4/M7.5/M7.6 preferences (accent, dateFormat, autoRefresh, toasts, reset) |

### Verification

- TypeScript: Clean compilation, no errors
- Tests: 307 total (228 server + 79 client), all passing
- 15 new preference tests cover all new fields + resetAllPreferences

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

## M6: Desktop UI System (Complete)

### M6.5: Window Chrome Polish ✅
**Completed:** 2026-04-08

| File | Changes |
|------|---------|
| `client/src/store/window-store.ts` | Added SnapZone type, preSnap field, snapWindow(), setSnapPreview(), restoreWindow() from preSnap |
| `client/src/components/Desktop/Window.tsx` | detectSnapZone() (8px edge), un-maximize on drag (proportional), snap preview during drag, snap commit on mouseup |
| `client/src/components/Desktop/DesktopLayout.tsx` | SnapPreview component (border-primary/40, backdrop-blur), cleaned up to use useKeyboardShortcuts hook |

### M6.7: File Operation UI (Copy/Paste) ✅
**Completed:** 2026-04-08

| File | Changes |
|------|---------|
| `client/src/store/clipboard-store.ts` | **NEW** — Zustand store: ClipboardEntry[], copy/cut/clear/hasEntries |
| `server/src/routes/files.ts` | Added POST /files/copy (cp -r via exec), POST /files/move (SFTP rename), shellEscapeForCopy() |
| `client/src/lib/api.ts` | Added copyFile(), moveFile() API functions |
| `client/src/components/FileExplorer/FileListNew.tsx` | Clipboard integration, handleCopy/Cut/Paste, context menu Cut/Copy/Paste functional |
| `client/tests/store/clipboard-store.test.ts` | **NEW** — 9 tests: copy, cut, clear, hasEntries, switching ops |
| `server/tests/routes/files.test.ts` | **NEW** — 10 tests: shellEscapeForCopy, command construction |

### M6.9: Keyboard Shortcuts ✅
**Completed:** 2026-04-08

| File | Changes |
|------|---------|
| `client/src/hooks/useKeyboardShortcuts.ts` | **NEW** — Global shortcuts: Alt+F4 (close), Ctrl+Space (start menu), Ctrl+Tab (cycle), Ctrl+` (terminal), Ctrl+Shift+Esc (task manager) |
| `client/src/components/Desktop/DesktopLayout.tsx` | Replaced inline keyboard handler with useKeyboardShortcuts() hook, removed unused store imports |
| `client/src/components/FileExplorer/FileListNew.tsx` | File-local shortcuts: Ctrl+C/X/V/A, Delete, F2, F5, Enter, Escape |

### M6.10: Selection & Multi-Select ✅
**Completed:** 2026-04-08

| File | Changes |
|------|---------|
| `client/src/hooks/useSelection.ts` | **NEW** — Generic hook: click/Ctrl+Click/Shift+Click range, selectAll, clearSelection, getSelectedItems |
| `client/src/components/FileExplorer/FileListNew.tsx` | Selection integration in DetailsView/ListView/IconGridView (bg-primary/12 highlight, opacity-50 for cut items), status bar selection count, containerRef for keyboard events |
| `client/src/components/FileExplorer/FileExplorerView.tsx` | selectedCount state, onSelectionChange callback, status bar shows "N selected" |
| `client/tests/hooks/useSelection.test.ts` | **NEW** — 13 tests: click, ctrl+click, shift+click range, selectAll, clearSelection, getSelectedItems |

### M6.11: Login Flow ✅
**Completed:** 2026-04-08

| File | Changes |
|------|---------|
| `client/src/components/Desktop/StartMenu.tsx` | Added Lock + Switch User buttons in footer (lucide Lock, ArrowLeftRight icons) |

### Verification

- TypeScript: Clean (no real errors, only TailwindCSS lint suggestions)
- Tests: 292 total (228 server + 64 client), all passing
- useSelection hook: 13 tests (click, ctrl, shift range, selectAll, clear, getSelectedItems)
- Clipboard store: 9 tests (copy, cut, clear, hasEntries, switching ops)
- File copy/move: 10 tests (shell escaping, command construction)

---

## M8.1: Fail2ban Management

### Files Created

| File | Purpose |
|------|---------|
| `server/src/parsers/deterministic/fail2ban.ts` | Deterministic parser for `fail2ban-client status <jail>` output |
| `docs/phases/phase-8.md` | Phase 8 spec — Server Admin CRUD operations (M8.1–M8.8) |

### Files Modified

| File | Changes |
|------|---------|
| `server/src/security/validators.ts` | Added `validateIpAddress()`, `validateJailName()`, 3 fail2ban commands to allowlist |
| `server/src/parsers/schemas/serveradmin.ts` | Added `Fail2banJailDetailSchema`, `Fail2banJailDetail` type |
| `server/src/routes/serveradmin.ts` | Added 4 endpoints: GET jail detail, POST ban, POST unban, POST reload |
| `client/src/lib/api.ts` | Added `Fail2banJailDetail` interface, `fetchFail2banJailDetail`, `fail2banBanIp`, `fail2banUnbanIp`, `fail2banReload` |
| `client/src/components/ServerAdmin/SecuritySection.tsx` | Interactive fail2ban tab: clickable jails, jail detail, ban/unban IP, reload config |
| `server/tests/security/validators.test.ts` | Added 14 tests for `validateIpAddress` and `validateJailName` |
| `server/tests/parsers/serveradmin-parsers.test.ts` | Added 5 tests for `parseFail2banJailStatus` |

### Verification

- TypeScript: Clean compile (no errors)
- Tests: 321 total (242 server + 79 client), all passing
- New validator tests: 14 (IPv4, IPv6, injection attacks, jail name validation)
- New parser tests: 5 (typical output, no banned IPs, multiple log files, missing fields, Zod validation)

---

## M8.2: Firewall Advanced Rules

### Files Created

| File | Purpose |
|------|---------|
| `server/src/parsers/deterministic/ufw-apps.ts` | Deterministic parser for `sudo ufw app list` output |

### Files Modified

| File | Changes |
|------|---------|
| `server/src/security/validators.ts` | Added `validateCidr()`, `validatePortRange()`, `validateUfwAppName()`; expanded UFW allowlist with deny, advanced (from IP/CIDR), app list, app allow/deny patterns |
| `server/src/parsers/schemas/serveradmin.ts` | Added `AddAdvancedFirewallRuleSchema`, `UfwAppProfileSchema`, `UfwAppListSchema`, `AllowDenyAppSchema` with derived types |
| `server/src/routes/serveradmin.ts` | Added 3 endpoints: POST advanced rule, GET app profiles, POST allow/deny app |
| `client/src/lib/api.ts` | Added `AdvancedFirewallRule`, `UfwAppProfile` interfaces + `addAdvancedFirewallRule()`, `fetchUfwAppProfiles()`, `allowDenyUfwApp()` |
| `client/src/components/ServerAdmin/FirewallSection.tsx` | Tabbed UI: Basic Rules, Advanced Rules (IP/CIDR + port range + comment), App Profiles (list + allow/deny) |
| `server/tests/security/validators.test.ts` | Added 18 tests for `validateCidr`, `validatePortRange`, `validateUfwAppName` |
| `server/tests/parsers/serveradmin-parsers.test.ts` | Added 6 tests for `parseUfwAppList` |

### Verification

- TypeScript: Clean compile (no errors)
- Tests: 339 total (260 server + 79 client), all passing
- New validator tests: 18 (CIDR notation, port ranges, UFW app names, injection attacks)
- New parser tests: 6 (typical output, Zod validation, empty list, blank lines, no header)

---

## M8.3: Nginx Site Management

### Files Created

None (all changes to existing files).

### Files Modified

| File | Changes |
|------|--------|
| `server/src/security/validators.ts` | Added `validateNginxSiteName()`; expanded nginx allowlist with enable/disable/reload/restart/config read commands |
| `server/src/parsers/schemas/serveradmin.ts` | Added `NginxSiteConfigSchema`, `NginxSiteConfig` type |
| `server/src/routes/serveradmin.ts` | Added 6 endpoints: POST enable/disable site, POST reload/restart, GET site config, POST test config |
| `client/src/lib/api.ts` | Added `NginxSiteConfig` interface + `enableNginxSite()`, `disableNginxSite()`, `reloadNginx()`, `restartNginx()`, `fetchNginxSiteConfig()`, `testNginxConfig()` |
| `client/src/components/ServerAdmin/WebServerSection.tsx` | Full rewrite: enable/disable toggles per site, reload/restart/test buttons, config viewer dialog |
| `server/tests/security/validators.test.ts` | Added 6 tests for `validateNginxSiteName` (valid names, path traversal, injection, long names) |

### Verification

- TypeScript: Clean compile (no errors)
- Tests: 345 total (266 server + 79 client), all passing
- New validator tests: 6 (site names, path traversal, command injection, edge cases)

---

## EX3: Smart Layout Engine & Progressive UI — Completed

> 26/26 tasks complete. 12 new templates (27 total), progressive rendering pipeline, entrance animations, 117 QA tests. 2,224 total tests (1,778 server + 446 client).

### EX3-B.3: Expand to 25+ Templates
- **Status:** ✅ Complete
- **Files created:** `server/src/dynamic-ui/templates/docker-images.ts`, `docker-compose.ts`, `memory-analysis.ts`, `network-interfaces.ts`, `system-logs-journal.ts`, `ssl-certificates.ts`, `environment-variables.ts`, `git-repositories.ts`, `database-status.ts`, `backup-status.ts`, `kernel-modules.ts`, `port-scan.ts`
- **Files modified:** `server/src/dynamic-ui/templates/index.ts` (12 new imports, ALL_TEMPLATES expanded to 27)
- **Verification:** All 27 templates pass DynamicViewSchema.safeParse(); 383 dynamic-ui tests passing

### EX3-B.4: FakeLLM Generator
- **Status:** ✅ Complete
- **Files created:** `server/src/dynamic-ui/fake-generator.ts` (FakeLLMGenerator class: generate, generateFromCommand, generateAll, hasTemplate, size)
- **Verification:** Deterministic view generation from all 27 templates; tested in ex3-template-qa.test.ts

### EX3-C.1: WorkingView & Mutation Tools
- **Status:** ✅ Complete
- **Files created:** `server/src/dynamic-ui/working-view.ts` (WorkingView class + createSkeleton helper: addWidget, replaceWidget, updateMetadata, addTab, addSidebarItem, addSection, getSnapshot, getDiff, validate)
- **Verification:** All mutation methods tested; getDiff tracks changes; validate uses DynamicViewSchema

### EX3-C.2: layout_update Event Pipeline
- **Status:** ✅ Complete
- **Files modified:** `server/src/agent/executor.ts` (LayoutUpdatePhase type, layout_update AgentEvent), `client/src/hooks/useUIAgent.ts` (layout_update parseServerMessage + store handler), `client/src/components/Agent/AgentPanel.tsx` (layout_update AgentEventType)
- **Verification:** WebSocket events flow from executor → useUIAgent → store

### EX3-C.3: Early Window Opening
- **Status:** ✅ Complete
- **Files modified:** `client/src/components/Agent/UIAgentView.tsx` (preview opens on isRunning, skeleton loading with animated pulse placeholders)
- **Verification:** Window opens immediately when generation starts; shows skeleton before first partial_view

### EX3-C.4: Multi-Step Executor Prompt
- **Status:** ✅ Complete
- **Files created:** `server/src/dynamic-ui/prompts/multi-step.ts` (buildMultiStepPrompt + formatClassification)
- **Verification:** Generates structured prompt with skeleton, classification, build order, widget selection rules

### EX3-D.1: DynamicUIWindow Component
- **Status:** ✅ Complete
- **Files modified:** `client/src/components/DynamicUI/DynamicAppWindow.tsx` (GenerationPhase type, phase-based rendering, SkeletonBody component, phase-aware footer with generation stats)
- **Verification:** Renders loading/skeleton/progressive/complete phases correctly

### EX3-D.2: View Toolbar
- **Status:** ✅ Complete
- **Files modified:** `client/src/components/DynamicUI/DynamicAppWindow.tsx` (Copy JSON button with clipboard + toast)
- **Verification:** Toolbar: Regenerate, Copy JSON, JSON toggle, Pin, Save as App

### EX3-D.3: Entrance Animations
- **Status:** ✅ Complete
- **Files modified:** `client/src/styles.css` (widgetEnter/tabSlideIn @keyframes, .animate-widget-enter with --stagger-index, prefers-reduced-motion), `client/src/components/DynamicUI/WidgetRenderer.tsx` (index prop, stagger), `client/src/components/DynamicUI/ContentRenderer.tsx` (index prop), `client/src/components/DynamicUI/layouts/StackLayout.tsx`, `GridLayout.tsx`, `TabsLayout.tsx` (pass index, animate-tab-slide-in)
- **Verification:** Widgets enter with staggered fade+translateY; tabs slide in; animations disabled with prefers-reduced-motion

### EX3-D.4: Template QA Tests
- **Status:** ✅ Complete
- **Files created:** `server/tests/dynamic-ui/ex3-template-qa.test.ts` (117 tests: 27 template schema validation, FakeLLMGenerator API, WorkingView mutations, multi-step prompts, layout patterns)
- **Files modified:** `server/tests/dynamic-ui/template-library.test.ts` (assertion updated ≥25), `server/tests/dynamic-ui/generator.test.ts` (cat /var/log/syslog→system-logs-journal)
- **Verification:** All 383 dynamic-ui tests passing; all 2,224 tests passing (1,778 server + 446 client)

---

## EX4: LLM Observatory — Completed

> Phoenix-inspired embedded LLM tracing. 16/16 tasks complete. 133 backend tests + 75 frontend tests = 208 new tests.

### EX4-A.1: Trace & Span Zod Schemas
- **Status:** ✅ Complete
- **Files created:** `shared/schemas/observatory.ts`
- **Files modified:** `shared/schemas/index.ts`
- **Tests:** `server/tests/observatory/schemas.test.ts` — 42 tests
- **Verification:** All schemas validate, reject invalid data, infer correct types

### EX4-A.2: TraceStore (In-Memory Ring Buffer)
- **Status:** ✅ Complete
- **Files created:** `server/src/observatory/trace-store.ts`
- **Tests:** `server/tests/observatory/trace-store.test.ts` — 35 tests
- **Verification:** Ring buffer FIFO eviction, cumulative rollup, tree building, event emission

### EX4-A.3: Instrumentation Context (AsyncLocalStorage)
- **Status:** ✅ Complete
- **Files created:** `server/src/observatory/context.ts`
- **Tests:** `server/tests/observatory/context.test.ts` — 14 tests
- **Verification:** withTrace/withSpan auto parent-child linking, async context propagation

### EX4-B.1: Instrument ModelRouter
- **Status:** ✅ Complete
- **Files modified:** `server/src/llm/model-router.ts`
- **Tests:** `server/tests/llm/model-router-spans.test.ts` — 7 tests
- **Verification:** reason/chat/fast/summarize create LLM spans with model, tokens, content

### EX4-B.2: Instrument Agent Pipeline
- **Status:** ✅ Complete
- **Files modified:** `server/src/agent/ui-agent.ts`, `executor.ts`, `planner.ts`, `reflector.ts`, `investigation-agent.ts`
- **Tests:** `server/tests/agent/agent-spans.test.ts` — 11 tests
- **Verification:** UIAgent/Executor/Planner/Reflector/InvestigationAgent emit spans

### EX4-B.3: Instrument DynamicUIGenerator
- **Status:** ✅ Complete
- **Files modified:** `server/src/dynamic-ui/generator.ts`
- **Tests:** `server/tests/dynamic-ui/generator-spans.test.ts` — 5 tests
- **Verification:** Generator creates traces with CHAIN root and LLMGenerate child span

### EX4-C.1: Observatory REST Routes
- **Status:** ✅ Complete
- **Files created:** `server/src/routes/observatory.ts`
- **Files modified:** `server/src/index.ts`
- **Tests:** `server/tests/routes/observatory.test.ts` — 19 tests (REST + WS)
- **Verification:** GET traces/traceId/spanId/stats, POST clear, content stripping

### EX4-C.2: WebSocket Live Trace Events
- **Status:** ✅ Complete
- **Files modified:** `server/src/routes/observatory.ts`
- **Tests:** Included in `server/tests/routes/observatory.test.ts`
- **Verification:** WS /ws/observatory broadcasts trace:start/end, span:start/end events

### EX4-D.1: Observatory App Registration
- **Status:** ✅ Complete
- **Files created:** `client/src/components/Observatory/ObservatoryView.tsx`
- **Files modified:** `client/src/components/ui/FileIcon.tsx` (ObservatoryIcon), `client/src/lib/apps.ts`, `client/src/components/Desktop/WindowManager.tsx`, `client/src/components/Desktop/Window.tsx`, `client/src/store/window-store.ts`, `client/src/components/Desktop/StartMenu.tsx`
- **Tests:** `client/tests/components/Observatory/registration.test.ts` — 3 tests
- **Verification:** Desktop app, Start Menu, Command Palette, lazy loading

### EX4-D.2: Trace List View
- **Status:** ✅ Complete
- **Files created:** `client/src/components/Observatory/TraceListView.tsx`, `client/src/store/observatory-store.ts`
- **Tests:** `client/tests/components/Observatory/TraceListView.test.tsx` — 10 tests, `client/tests/store/observatory-store.test.ts` — 17 tests
- **Verification:** Table with status/name/trigger/tokens/cost/latency, filtering, WebSocket updates

### EX4-D.3: Observatory Stats Dashboard
- **Status:** ✅ Complete
- **Files created:** `client/src/components/Observatory/StatsPanel.tsx`
- **Tests:** `client/tests/components/Observatory/StatsPanel.test.tsx` — 5 tests
- **Verification:** 6 stat-cards with formatted tokens, cost, latency, model/kind breakdowns

### EX4-E.1: Trace Detail Layout
- **Status:** ✅ Complete
- **Files created:** `client/src/components/Observatory/TraceDetailView.tsx`
- **Tests:** `client/tests/components/Observatory/TraceDetailView.test.tsx` — 8 tests
- **Verification:** Two-panel resizable layout (tree 60% + detail 40%), header + footer

### EX4-E.2: Trace Tree Component
- **Status:** ✅ Complete
- **Files created:** `client/src/components/Observatory/TraceTree.tsx`
- **Tests:** `client/tests/components/Observatory/TraceTree.test.tsx` — 7 tests
- **Verification:** Recursive tree, color-coded SpanKind icons, expand/collapse, connector lines

### EX4-E.3: Timeline Bars
- **Status:** ✅ Complete
- **Files created:** `client/src/components/Observatory/TimelineBar.tsx`
- **Tests:** `client/tests/components/Observatory/TimelineBar.test.tsx` — 7 tests
- **Verification:** Horizontal bars relative to trace total, color-coded by kind, min-width

### EX4-E.4: Span Detail Panel
- **Status:** ✅ Complete
- **Files created:** `client/src/components/Observatory/SpanDetailPanel.tsx`
- **Tests:** `client/tests/components/Observatory/SpanDetailPanel.test.tsx` — 8 tests
- **Verification:** Per-kind detail views, input/output/attributes tabs, error display

### EX4-E.5: Live Trace Updates
- **Status:** ✅ Complete
- **Files created:** `client/src/hooks/useObservatorySocket.ts`
- **Tests:** `client/tests/hooks/useObservatorySocket.test.ts` — 10 tests
- **Verification:** WebSocket hook with auto-reconnect, exponential backoff capped at 30s

---

## EX5: CLI App Generation with Sandbox Discovery — In Progress

### EX5-A.1: CLI Discovery Command Allowlist
- **Status:** ✅ Complete
- **Files modified:** `server/src/agent/command-allowlist.ts` — 22 new regex patterns added (which, command -v, type, --help, -h, help, --version, -v, -V, version, man, apropos, dpkg, rpm, apt list/show, brew info, snap info, flatpak info)
- **Tests:** `server/tests/agent/command-allowlist.test.ts` — 7 new test blocks (60+ assertions), 32 total passing
- **Verification:** All CLI discovery patterns validated; injection attacks rejected

### EX5-B.1: SandboxManager Service
- **Status:** ✅ Complete
- **Files created:** `server/src/agent/sandbox-manager.ts`
- **Tests:** `server/tests/agent/sandbox-manager.test.ts` — 33 tests (detectBaseImage: 8, create: 5, exec: 3, install: 5, destroySandbox: 4, destroyAll: 2, getSandbox/listActive: 3, auto-destroy timer: 2, lifecycle: 1)
- **Verification:** SandboxManager extends BaseService; create/exec/install/destroySandbox/destroyAll with mocked SSH; OS auto-detection; TTL auto-cleanup; resource limits (--memory=256m, --cpus=0.5, --network=none, --pids-limit=100)

### EX5-B.2: sandbox_exec Agent Tool
- **Status:** ✅ Complete
- **Files created:** `server/src/agent/tools/sandbox-exec.ts`
- **Files modified:** `server/src/agent/tools/types.ts` (added `sandboxManager?`, `activeSandboxId?` to ToolContext), `server/src/agent/tools/index.ts` (exported sandboxExecTool)
- **Tests:** `server/tests/agent/sandbox-exec.test.ts` — 17 tests (metadata: 1, success path: 3, guard no-manager: 1, guard no-sandbox: 1, allowlist rejection: 1, sandbox blocks: 4, error handling: 2, allowlist integration: 4)
- **Verification:** Route commands through SandboxManager.exec(); read-only allowlist + sandbox-specific block patterns (curl|bash, apt/pip install); caches output in previousOutputs; graceful error handling

### EX5-A.2: Form CommandTemplate & Submit Wiring
- **Status:** ✅ Complete
- **Files created:** `client/src/lib/command-template.ts` (shellEscape + composeCommand utilities)
- **Files modified:** `shared/schemas/dynamic-view.ts` (added commandTemplate, confirmSubmit, confirmMessage to FormWidgetSchema), `client/src/components/DynamicUI/WidgetRenderer.tsx` (FormCommandWrapper component wiring onSubmit → compose command → execute action), `server/src/agent/tools/types.ts` (added sandboxManager + activeSandboxId to ToolContext)
- **Tests:** `client/tests/lib/command-template.test.ts` — 14 tests (shellEscape: 5, composeCommand: 9 — string values, numbers, boolean flags, omit empty, special chars, complex templates, whitespace cleanup)
- **Verification:** FormWidget onSubmit → composeCommand(template, values) → executeWidgetAction() with optional ConfirmDialog; new schema fields validated by Zod

### EX5-B.3: Two-Phase Agent Flow
- **Status:** ✅ Complete
- **Files modified:** `server/src/agent/ui-agent.ts` (sandbox lifecycle in generateCore: create → install → wire context → try/finally destroy; extractToolName helper; UIAgentOptions extended with sandboxMode/toolName; constructor deps extended with sandboxManager/toolRegistry), `server/src/routes/agent-ui.ts` (SandboxManager import, AgentUIRouteDeps extended, sandboxManager/toolRegistry passed to UIAgent, ClientMessage extended with sandboxMode/toolName, forwarded to agent.generate())
- **Tests:** `server/tests/agent/ui-agent-sandbox.test.ts` — 16 tests (lifecycle: 4 — create/install/destroy/context wiring/tool registration; fallback: 3 — creation failure/install failure/destroy failure; disabled: 3 — sandboxMode false/omitted/no manager; abort: 1 — cleanup on abort; extractToolName: 4 — explicit/pattern/fallback; dedup: 1 — skip duplicate registration)
- **Verification:** Sandbox created before agent loop, destroyed in finally block; graceful fallback on Docker unavailability; sandbox context wired into ToolContext for sandbox_exec tool; tool registry dynamically extended with sandbox_exec

### EX5-B.4: Frontend Sandbox Toggle
- **Status:** ✅ Complete
- **Files modified:** `client/src/components/Agent/UIAgentView.tsx` (Shield icon + Switch toggle + Tooltip with Docker-aware messaging; sandboxEnabled/dockerAvailable state; useEffect Docker check on mount; handleGenerate passes sandboxMode option; disabled when Docker unavailable or running), `client/src/hooks/useUIAgent.ts` (GenerateOptions interface with sandboxMode/toolName; generate signature updated to accept options; WebSocket message conditionally includes sandboxMode/toolName), `client/src/lib/api.ts` (checkDockerAvailable function using fetchDockerContainers)
- **Tests:** `client/tests/components/SandboxToggle.test.tsx` — 12 tests (rendering: 4, Docker availability: 3, toggle interaction: 2, generate with sandbox options: 3)
- **Verification:** Toggle renders with Shield icon and "Sandbox Mode" label; disables when Docker unavailable; sandboxMode passed through WebSocket when enabled; all 2,011 tests passing (1,593 server + 418 client)

### EX5-C.1: User App Persistence (Backend)
- **Status:** ✅ Complete
- **Files created:** `server/src/dynamic-ui/app-store.ts` (AppStore class with CRUD + disk persistence + TemplateRegistry integration; SavedAppSchema/CreateAppSchema/UpdateAppSchema Zod schemas; UUID generation; JSON file storage at ~/.headlessos/user-apps/), `server/src/routes/app-store.ts` (5 REST endpoints: GET/POST /api/dynamic-ui/apps, GET/PUT/DELETE /api/dynamic-ui/apps/:id), `server/tests/dynamic-ui/app-store.test.ts` (28 tests: CRUD 8, disk persistence 5, validation 4, TemplateRegistry integration 5, schema tests 4, misc 2), `server/tests/routes/app-store.test.ts` (9 route logic tests)
- **Files modified:** `server/src/index.ts` (AppStore import, instantiation, init, setTemplateRegistry, appStoreRoutes registration)
- **Verification:** All 2,048 tests passing (1,630 server + 418 client); apps persisted to disk as individual JSON files; reloaded on server restart; auto-registered as UITemplates for command pattern matching

### EX5-C.2: Save As App UI (Frontend)
- **Status:** ✅ Complete
- **Files created:** `client/src/components/DynamicUI/SaveAsAppDialog.tsx` (Save As App dialog with name/icon picker/CLI tool/description/tags fields; Lucide icon grid picker; createSavedApp API call; success/error toast notifications), `client/tests/components/SaveAsAppDialog.test.tsx` (15 tests: rendering 3, pre-fill 4, icon picker 2, save action 3, validation 3)
- **Files modified:** `client/src/lib/api.ts` (added SavedApp/CreateAppInput/UpdateAppInput types + fetchSavedApps/fetchSavedApp/createSavedApp/updateSavedApp/deleteSavedApp API functions), `client/src/components/DynamicUI/DynamicAppWindow.tsx` (added Save as App button in toolbar, showSaveDialog state, SaveAsAppDialog integration with pre-fill from view meta), `client/src/components/DynamicUI/index.ts` (added SaveAsAppDialog barrel export)
- **Verification:** All 2,063 tests passing (1,630 server + 433 client); Save button visible in DynamicAppWindow toolbar; dialog pre-fills from view title/description/meta.tool/icon; icon picker grid with 56 icons; validation prevents save without name/icon/cliTool

### EX5-C.3: App Launcher Integration
- **Status:** ✅ Complete
- **Files created:** `client/src/store/saved-app-store.ts` (Zustand store: apps[], loading, fetched; fetchApps→API, removeApp→API+local filter, openApp→openDynamicUIWindow), `client/tests/store/saved-app-store.test.ts` (8 tests: initial state, fetchApps success/error/loading-guard, removeApp success/API-call/error, openApp)
- **Files modified:** `client/src/components/Desktop/StartMenu.tsx` (added "My Apps" subsection in All Apps list view + compact row in pinned view; fetch saved apps on first open; filteredSavedApps search), `client/src/components/Desktop/CommandPalette.tsx` (added "My Apps" CommandGroup with saved apps; fetch on palette open; handleOpenSavedApp callback), `client/tests/components/CommandPalette.test.tsx` (added saved-app-store mock + icon-helper mock + 5 new tests: fetch on open, skip if fetched, My Apps group visible, hidden when empty, cliTool text)
- **Verification:** All 2,076 tests passing (1,630 server + 446 client); saved apps appear in Start Menu "My Apps" section + Command Palette "My Apps" group; search filters by name/cliTool/tags; opening a saved app launches openDynamicUIWindow with stored view JSON

### EX5-A.3: CLI Introspection Prompt Engineering
- **Status:** ✅ Complete
- **Files modified:** `server/src/agent/planner.ts` (added "CLI Tool UI Pattern" section with examples for restic/nginx, cli-introspection dataSourceHint pattern, guidance for full-management + complex + needsWrite), `server/src/agent/executor.ts` (added buildCLIIntrospectionGuidance() method with 3-phase workflow: Discovery→UI Mapping→Form CommandTemplate Wiring; injected into system prompt when dataSourceHints contains 'cli-introspection'; includes CLI→widget mapping table and meta.tool guidance), `server/tests/agent/planner.test.ts` (5 new tests: CLI Tool UI Pattern section, cli-introspection hint, CLI examples, full-management instruction, complex complexity), `server/tests/agent/executor.test.ts` (2 new tests: CLI guidance included for introspection requests, omitted for non-CLI requests)
- **Verification:** All 2,083 tests passing (1,637 server + 446 client); planner prompt recognizes "build UI for X" patterns; executor adds structured CLI discovery workflow when cli-introspection hint is present

---

## M12: Backend Architecture Refactor

> Domain service layer + CommandPolicy chokepoint. Spec: [phase-12.md](phases/phase-12.md). ADR: [ADR-023](DECISIONS.md#adr-023-domain-service-layer--command-policy-chokepoint).

### M12.1: CommandPolicy Chokepoint
- **Status:** ✅ Complete
- **Files created:** `server/src/services/policy/command-policy.ts` (CommandPolicy class: evaluate, assertAllowed, isAllowed, getRiskLevel, getAuditLog cap 500, getStats, setMode, getMode), `server/tests/services/policy/command-policy.test.ts` (29 tests: allowlist, blocklist, modes enforce/audit/off, audit log, risk levels)
- **Files modified:** `server/src/ssh/connection-manager.ts` (added `policy` field, optional resolution in `_init()`, `assertAllowed()` call inside `exec()` before ssh2; `setPolicy()` for tests bypassing the container), `server/src/index.ts` (registers `command-policy` BEFORE `ssh`)
- **Verification:** 29 tests passing; `HEADLESS_POLICY_MODE` env switches modes at boot; BLOCKED_COMMANDS always wins regardless of mode

### M12.2: DockerService + Slim docker.ts
- **Status:** ✅ Complete
- **Files created:** `server/src/services/domain/base.ts` (DomainService base, ServiceResult<T>, ServiceError, ok/fail/sendResult/tryRoute, helpers requireConnected/exec/safeExec/execAction), `server/src/services/domain/docker-service.ts` (listContainers/listImages/containerAction/runContainer/removeContainer/removeImage/getLogs/inspectContainer; container ID validation 12-64 hex), `server/tests/services/domain/docker-service.test.ts` (6 tests)
- **Files modified:** `server/src/routes/docker.ts` (rewritten as thin HTTP wrappers; `send()` helper un-flattens `{containers, dockerAvailable}` to legacy `{success, data, dockerAvailable}`), `server/src/index.ts` (DockerService instantiation + `app.register(dockerRoutes, { connectionManager, dockerService })`)
- **Verification:** All response shapes preserved (frontend zero changes); 6 unit tests + existing route tests pass

### M12.3: FilesService — Deferred
- **Status:** ⏭️ Deferred with rationale
- **Rationale:** `routes/files.ts` already uses SFTP (readdir/readFile/writeFile/rename/unlink), which bypasses CommandPolicy by design (ADR-007: SFTP for file ops, not shell). `validatePath()` is called at every entry. Wrapping SFTP in a domain service would add a layer without adding a policy gate or eliminating duplication. Revisit if SFTP grows orchestration logic.

### M12.4: Admin Domain Services (8)
- **Status:** ✅ Complete
- **Files created:**
  - `server/src/services/domain/admin/index.ts` (barrel)
  - `server/src/services/domain/admin/network-admin-service.ts` (getNetworkInfo parallel 6 cmds, setHostname, setDns, interfaceUp/Down)
  - `server/src/services/domain/admin/firewall-admin-service.ts` (getStatus, addRule, addAdvancedRule with IP/CIDR/portRange validation, deleteRule, toggle, listApps, allowDenyApp)
  - `server/src/services/domain/admin/security-admin-service.ts` (getSecurityInfo parallel passwd/who/last/sshd/fail2ban, getJailDetail, banIp/unbanIp, reloadFail2ban, createUser with PROTECTED_USERS guard, deleteUser refuses root, setPassword, addToGroup, killSession)
  - `server/src/services/domain/admin/webserver-admin-service.ts` (getWebServerInfo Nginx detection→sites+certs, enableSite/disableSite, reloadNginx/restartNginx, readSiteConfig, testNginxConfig)
  - `server/src/services/domain/admin/packages-admin-service.ts` (getPackageInfo, aptUpdate 120s, upgradeAll 300s, install/remove/upgradeOne, search)
  - `server/src/services/domain/admin/cron-admin-service.ts` (getCronInfo, addJob with optional `# description`, deleteJobByIndex, editJobByIndex)
  - `server/src/services/domain/admin/logs-admin-service.ts` (getLogs cap 1000, exportLogs cap 5000, journalctl/dmesg/tail with regex grep fallback)
  - `server/src/services/domain/admin/storage-admin-service.ts` (getStorageInfo parallel du/findmnt/swapon)
  - `server/tests/services/domain/admin-services.test.ts` (39 tests)
- **Files modified:** `server/src/index.ts` (8 service instantiations + container.register calls)
- **Verification:** 39 admin unit tests passing; all command construction, validator rejection, ServiceResult mapping (404/409/400), parallel exec count, edge cases covered

### M12.5: Decompose serveradmin.ts
- **Status:** ✅ Complete
- **Files modified:** `server/src/routes/serveradmin.ts` (rewritten 1,655 → ~520 lines; 8 sections delegating to admin services; helpers `send<T>(reply, promise)` with ServiceError catch + flatten `{message}` → `{success, message}`, `parseBody<T>` Zod safeParse with 400 reply; logs export endpoint sets text/plain Content-Type and Content-Disposition attachment header), `server/src/index.ts` (`app.register(serverAdminRoutes, { network, firewall, security, webServer, packages, cron, logs, storage })`)
- **Verification:** All response shapes preserved (frontend zero changes); existing serveradmin route integration tests pass

### M12.6: Domain Service Unit Tests
- **Status:** ✅ Complete
- **Files:** `server/tests/services/policy/command-policy.test.ts` (29), `server/tests/services/domain/admin-services.test.ts` (39), `server/tests/services/domain/docker-service.test.ts` (6) — total 74 new tests
- **Test infrastructure:** `bootService<T>()` helper instantiates ServiceContainer with `MockConnection` (vi.fn'd `exec`, default `getState→connected`), stub Orchestrator and ParsingPipeline, registers service-under-test, awaits `container.boot()`. `MockConnection extends BaseService` to satisfy two-phase boot.
- **Verification:** Full server suite **1,895/1,895 passing** (was 1,821 before M12; 74 net new). `cd server && npx tsc --noEmit` shows only the 3 known pre-existing errors (ui-agent.ts:343, generator.ts:262, observatory.ts:91 @types/ws).

### M12.7: Documentation
- **Status:** ✅ Complete
- **Files created:** `docs/phases/phase-12.md` (full task spec)
- **Files modified:** `docs/DECISIONS.md` (ADR-023 added before "Template for New ADRs"), `docs/PROGRESS.md` (M12 milestone row + task table + 2026-05-04 changelog entry), `docs/TRACEABILITY.md` (this entry), `docs/ARCHITECTURE.md` (domain layer note + updated request-flow diagram)
- **Verification:** Cross-references between ADR-023, phase-12, PROGRESS, TRACEABILITY all consistent

---

## EX8: LumenOS v3 Design System

> Glass redesign from the Claude Design handoff (`Custom OS UI Design/handoff/`). Spec: [phase-ex8.md](phases/phase-ex8.md).

### EX8.1: Tokens + appearance plumbing
- **Status:** ✅ Complete
- **Files created:** `client/src/lib/lumen-theme.ts`, `client/src/hooks/useLumenAppearance.ts`, `client/tests/lib/lumen-theme.test.ts`, `client/public/icons/fluent/*` (+ LICENSE.txt), six wallpapers in `server/assets/wallpapers/system/`
- **Files modified:** `client/src/styles.css` (Lumen layer, presets, surfaces in `@layer components`), `store/preferences-store.ts` (`glassStrength`, `transparency`; `accentColorIndex` → `LUMEN_ACCENTS`), `store/theme-store.ts`, `App.tsx`, `Desktop/Wallpaper.tsx`, `Desktop/wallpapers.ts` (default Dusk), `client/package.json` (@fontsource)

### EX8.2–EX8.3: Primitives + window chrome
- **Status:** ✅ Complete
- **Files created:** `ui/menu-styles.tsx`, `ui/pane-sidebar.tsx`, `lib/format-shortcut.ts` (+ test)
- **Files modified:** all styled `ui/` primitives, `ui/FileIcon.tsx` (Fluent icons, `AppIcon`), `ui/app-window.tsx`, `Desktop/Window.tsx`, `store/window-store.ts` (`DOCK_RESERVE`), `Desktop/DesktopLayout.tsx`

### EX8.4–EX8.5: Shell, lock and sign-in
- **Status:** ✅ Complete
- **Files created:** `Desktop/QuickSettings.tsx`
- **Files modified:** `Desktop/{Taskbar,StartMenu,NotificationCenter,CommandPalette,Desktop,SessionSwitcher,SessionTile,WindowManager}.tsx`, `ui/sonner.tsx`, `lib/event-bus.ts` (`palette:toggle`), `Login/*`, `ControlCenter/*`; test `tests/components/CommandPalette.test.tsx` (+2)

### EX8.6: Apps
- **Status:** ✅ Complete
- **Files created:** `TaskManager/{parts,ProcessDetailCard}.tsx`, `Dashboard/{parts,ProcessorCard}.tsx`, `ServerAdmin/admin-ui.tsx`, `DynamicUI/widgets/widget-card.tsx`, `Agent/agent-ui.tsx`, `Terminal/lumen-terminal.ts`, `server/src/terminal/control.ts`; tests `client/tests/components/{process-detail,lumen-terminal}.test.tsx`, `server/tests/terminal/control.test.ts`
- **Files modified:** every app folder (FileExplorer, Settings, TaskManager, Dashboard, Terminal, Docker, Services, ServerAdmin, DynamicUI, Agent, Observatory, Fleet); `server/src/routes/{taskmanager,terminal}.ts`, `server/src/services/domain/taskmanager-service.ts`, `server/src/security/validators.ts`, `server/tests/services/domain/taskmanager-service.test.ts`

### EX8.7: Verification
- **Status:** ✅ Complete
- **Verification:** client 564 / server 2010 tests passing, both typechecks clean; Playwright side-by-side vs the prototype (13 screens × 2 themes at 1440×900, plus 1024×768); docs: `UI_DESIGN.md` §5–8, AGENTS.md §19 tokens
- **Commits:** branch `feat/lumen-v3-design` (`feat|fix(EX8.n): …`)

### EX8.8: Code editor (Monaco)
- **Status:** ✅ Complete
- **Files created:** `client/src/components/ui/{code-editor,code-editor-impl}.tsx`, `client/src/lib/{code-language,monaco-setup}.ts`, `client/src/monaco-workers.d.ts`; tests `client/tests/lib/code-language.test.ts`, `client/tests/components/code-editor.test.tsx`
- **Files modified:** `FileExplorer/FileViewer.tsx`, `Docker/ContainerFilesView.tsx`, `client/package.json` (`monaco-editor` 0.57.0, exact)
- **Verification:** Playwright — TS / JSON / nginx.conf in Files (dark + light), container Files editor, JSON worker flags a trailing comma, modified badge + Save; `vite build` emits the lazy editor chunk and per-language workers

### EX8.9: Task Manager — App history, Startup apps, Users, Services
- **Status:** ✅ Complete
- **Files created:** client `TaskManager/{AppHistoryTab,StartupTab,UsersTab,ServicesTab,kit}.tsx`, test `client/tests/components/taskmanager-pages.test.tsx`; server `services/domain/init-system.ts`, `parsers/deterministic/{systemd-analyze,sysv-init,app-usage,user-sessions,startup-items}.ts`, tests `server/tests/parsers/{systemd-analyze,sysv-init,app-usage,user-sessions,startup-items}.test.ts`, `server/tests/services/domain/taskmanager-pages.test.ts`, `server/tests/routes/{taskmanager,services-route}.test.ts`, `server/tests/security/ex89-allowlist.test.ts`
- **Files modified:** `TaskManager/TaskManagerView.tsx`, `client/src/lib/api.ts`; server `services/domain/{taskmanager-service,systemd-service,base}.ts`, `routes/{taskmanager,services}.ts`, `parsers/deterministic/systemctl.ts`, `parsers/schemas/{taskmanager,services}.ts`, `security/validators.ts`, `tests/services/domain/systemd-service.test.ts`
- **Verification:** client 593 / server 2154 tests; Playwright of the four pages on the SysV dev box

### EX8.10: HomeHub
- **Status:** ✅ Complete
- **Files created:** `client/src/components/HomeHub/{HomeHub,cards,hub-ui}.tsx`, `client/public/icons/hub/*` (34 SVG + LICENSE), `client/public/hub/*.jpg`, test `client/tests/components/home-hub.test.tsx`
- **Files modified:** `store/window-store.ts` (`homeHubOpen`, `toggleHomeHub`, `closeHomeHub`), `Desktop/Taskbar.tsx` (well: Launcher `Grip` · Home `House` · Search), `Desktop/DesktopLayout.tsx`, `styles.css` (keyframes)
- **Verification:** pixel diff vs the prototype per card; Playwright interactions (gauge drag 18°→24°, power, play, rooms, Escape and backdrop close)

### EX8.15: HomeHub glance
- **Status:** ✅ Complete
- **Files created:** `server/src/routes/glance.ts`, `server/tests/routes/glance.test.ts`, `client/src/components/HomeHub/glance.tsx`, `client/src/components/Desktop/WeatherCityPicker.tsx`
- **Files modified:** `server/src/index.ts`, `HomeHub/{HomeHub,cards,hub-ui}.tsx`, `Desktop/{DesktopLayout,SettingsView}.tsx`, `lib/api.ts`, `store/preferences-store.ts`, `client/tests/components/home-hub.test.tsx`
- **Verification:** client 611 / server 2159 tests; Playwright of every card on the dev box

## EX9: Safe Agents — Action Catalog, Approvals, Local Models

> Agents run typed actions from a server-side catalog instead of shell commands. Spec: [phase-ex9.md](phases/phase-ex9.md), decision: ADR-024.

### EX9 docs: spec + ADR
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `docs/phases/phase-ex9.md`
- **Files modified:** `docs/DECISIONS.md` (ADR-024; ADR-014 status line points to it), `docs/PROGRESS.md` (EX9 row + section + changelog; backlog B.1 → EX9.3), `docs/SECURITY.md` (§4b agents: typed actions only)

### EX9.0: Remove the UI Agent's write tools
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files modified:** `server/src/agent/tools/index.ts` (`ALL_AGENT_TOOLS` drops `execWriteCommandTool`, `sftpWriteTool`; modules kept for EX9.2)
- **Tests:** `server/tests/agent/tools/tools.test.ts` (8 tools, none write-tier), `server/tests/agent/executor.test.ts` ("default tool set (EX9.0)": both names → Unknown tool, no exec/getSftp)
- **Verification:** server 2180 passed (+1 skipped), `tsc -p server` clean

### EX9.1: Action catalog, runner, enforcement
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `server/src/agent/actions/{index,types,quote,params,runner,tools}.ts`, `server/src/agent/actions/catalog/{index,define,system,network,services,docker,admin,files}.ts`, `server/src/services/policy/agent-scope.ts`
- **Files deleted:** `server/src/agent/tools/{exec-command,sftp-read,sandbox-exec}.ts`, `server/tests/agent/sandbox-exec.test.ts`
- **Files modified:** `services/policy/command-policy.ts` (agent-scope check in every mode, `assertSftpAllowed`), `ssh/connection-manager.ts` (`getSftp` asks the policy), `agent/tools/{index,types,tool-converter,get-server-context,grep-output}.ts`, `agent/{guardrails,command-allowlist,executor,reflector,error-recovery,ui-agent,investigation-agent}.ts`, `routes/agent-ui.ts`, `llm/providers/{fake-ssh-proxy,fake-scenarios,fake-progressive-scenario}.ts`; client `lib/api.ts` (`run_action`, `action`), `components/Agent/AgentView.tsx`
- **Docs:** `docs/phases/phase-ex9.md` (§1, §5, §6, "EX9.1 — as built"), `CLAUDE.md` (agent safety), `docs/ARCHITECTURE.md` (Mode 2 superseded note)
- **Tests created:** `server/tests/agent/actions/{quote-params,catalog,runner,scope-policy,tools}.test.ts`, `server/tests/llm/fake-mode-actions.test.ts`; rewritten `server/tests/agent/investigation-agent.test.ts`
- **Tests modified:** `tests/agent/{command-allowlist,guardrails,executor,fake-llm-e2e,agent-spans,investigation-progress,ui-agent-sandbox}.test.ts`, `tests/agent/tools/tools.test.ts`, `tests/agent/{helpers/mock-ssh,scenarios/system-overview}.ts`, `tests/routes/security-regressions.test.ts` (H2 rewritten for actions); client `tests/components/agent-progress.test.tsx`
- **Verification:** server 2203 passed (+1 skipped), client 624, both typechecks clean

### EX9.2: Approvals for change actions
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `server/src/agent/actions/{approvals,audit}.ts`, `server/src/agent/actions/catalog/changes.ts`, `server/src/routes/actions.ts`; client `components/Agent/ApprovalCard.tsx`, `components/DynamicUI/view-actions.tsx`
- **Files modified:** server `agent/actions/{runner,params,types,tools,catalog/index,catalog/define}.ts`, `agent/investigation-agent.ts`, `agent/tools/types.ts`, `agent/executor.ts` (row-button prompt), `routes/{agent,dynamic-ui}.ts`, `config/store.ts` (`findServer`), `index.ts` (gate, audit, routes, shutdown); shared `schemas/dynamic-view.ts` (`WidgetActionRefSchema`, `command` optional); client `lib/api.ts`, `components/Agent/AgentView.tsx`, `components/DynamicUI/widgets/TableWidget.tsx`
- **Docs:** `docs/phases/phase-ex9.md` ("EX9.2 — as built"), `docs/API_SPEC.md` (Agent Actions & Approvals)
- **Tests created:** `server/tests/agent/actions/{approvals-audit,runner-change}.test.ts`, `server/tests/routes/view-actions.test.ts`, `client/tests/components/approvals.test.tsx`
- **Tests modified:** `server/tests/agent/actions/{catalog,runner}.test.ts`, `server/tests/agent/investigation-agent.test.ts`, `server/tests/parsers/dynamic-view-schema.test.ts`
- **Verification:** server 2257 passed (+2 skipped: the 0o600 file-mode checks on Windows), client 639, both typechecks clean; Playwright measurements in the phase doc
- **Follow-up (refactor):** EX2 write tools deleted (`server/src/agent/tools/{exec-write,sftp-write}.ts`); `agent/guardrails.ts` refuses the `write` tier; tests `tests/agent/{guardrails,tools/tools}.test.ts` updated

### EX9.3: Shared loop, Ollama, weak-model input handling
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `server/src/agent/loop/{run-loop,tool-input}.ts`, `server/src/llm/providers/ollama.ts`
- **Files modified:** server `agent/investigation-agent.ts` (rewritten on the loop), `agent/executor.ts` (repair, prose calls), `agent/ui-agent.ts` (`actionBudget`), `agent/actions/{runner,tools,types}.ts` (aliases, coercion, `actionBudget`, `allowChange` through the context), `agent/tools/types.ts`, `llm/{provider,model-router,llm-settings-store}.ts`, `routes/llm.ts`, `index.ts`; client `lib/api.ts`, `components/Desktop/SettingsView.tsx` (AI page)
- **Docs:** `docs/phases/phase-ex9.md` (§8 + "EX9.3 — as built"), `docs/API_SPEC.md`, `CLAUDE.md`
- **Tests created:** `server/tests/agent/loop/{tool-input,run-loop}.test.ts`, `server/tests/llm/ollama.test.ts`, `client/tests/components/settings-ai.test.tsx`
- **Tests modified:** `server/tests/agent/{investigation-agent,investigation-progress,agent-spans}.test.ts`, `server/tests/llm/{model-router,llm-settings-store}.test.ts`, `server/tests/routes/llm.test.ts`
- **Verification:** server 2281 passed (+2 skipped), client 643, both typechecks clean; Playwright measurements in the phase doc

### EX9.4: Loop guard, context trimming, output caps, benchmark
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `server/src/agent/loop/{loop-guard,context}.ts`, `server/src/agent/bench/bench.ts`, `server/scripts/agent-bench.ts`
- **Files modified:** `server/src/agent/loop/run-loop.ts` (guard, trimming, steps-left note, `stuck`), `server/src/agent/investigation-agent.ts` (context window, output budget, `repaired` flag), `server/src/agent/ui-agent.ts` (output budget), `server/src/agent/actions/{runner,tools}.ts` (`channelCap`, `modelOutputChars`, 60/40 cut), `server/src/agent/tools/types.ts` (`mutating`, `modelOutputChars`), `server/src/ssh/connection-manager.ts` (`ExecOptions.maxBytes`, `truncated`), `server/src/llm/providers/fake-ssh-proxy.ts` (bench outputs), `package.json` + `server/package.json` (`bench:agents`)
- **Docs:** `docs/phases/phase-ex9.md` ("EX9.4 — as built"), `CLAUDE.md` (bench command)
- **Tests created:** `server/tests/agent/loop/guards-budgets.test.ts`, `server/tests/agent/bench.test.ts`
- **Tests modified:** exec-call assertions in `server/tests/agent/{actions/runner,actions/runner-change,actions/tools,loop/run-loop,ui-agent-sandbox}.test.ts`, `server/tests/routes/view-actions.test.ts`
- **Verification:** server 2302 passed (+2 skipped), client 643, both typechecks clean; `scripts/agent-bench.ts` typechecked and `--help` run (no model calls)

### EX9.5: Secret redaction, untrusted-data marking
- **Status:** ✅ Complete (per-server agent login deferred — phase doc §10)
- **Date:** 2026-10-22
- **Files created:** `server/src/agent/actions/redact.ts`
- **Files modified:** `server/src/agent/actions/{types,runner,tools}.ts` (`redacted` count, redaction in the runner and `formatForModel`, `markUntrusted`, `UNTRUSTED_RULE`), `server/src/agent/loop/run-loop.ts` (wraps action results for the model), `server/src/agent/executor.ts` (wraps action results, prompt rule), `server/src/agent/investigation-agent.ts` (prompt rule)
- **Docs:** `docs/phases/phase-ex9.md` (§10 scope note, "EX9.5 — as built"), `docs/SECURITY.md` §4b
- **Tests created:** `server/tests/agent/actions/redact-untrusted.test.ts`
- **Tests modified:** `server/tests/agent/executor.test.ts` (wrapping), `server/tests/agent/investigation-agent.test.ts` (prompt rule)
- **Verification:** server 2329 passed (+2 skipped), client 643, both typechecks clean

## EX10: Context Engineering for Agents

> One context plan per model window drives every agent budget. Spec: [phase-ex10.md](phases/phase-ex10.md), decision: ADR-025.

### EX10 docs: spec + ADR
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `docs/phases/phase-ex10.md`
- **Files modified:** `docs/DECISIONS.md` (ADR-025), `docs/PROGRESS.md` (EX10 row + section + changelog), `docs/TRACEABILITY.md`

### EX10.1: Model limits
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `server/src/llm/model-limits.ts`, `server/tests/llm/model-limits.test.ts`
- **Files modified:** `server/src/llm/provider.ts` (`limits`), `server/src/llm/providers/ollama.ts` (limits, `num_ctx`/`num_predict`/`think: false`, think fallback; `ollamaContextWindow`/`MAX_OLLAMA_CONTEXT` removed), `server/src/llm/providers/openai.ts` (`limits`, `contextWindow`), `server/src/llm/llm-settings-store.ts` (`ollama.contextWindow`), `server/src/routes/llm.ts` (owner window, `limits`, `residency`, `contextOptions`), `server/src/index.ts` (startup probe), `client/src/lib/api.ts` (`ModelLimits`, `OllamaResidency`), `client/src/components/Desktop/SettingsView.tsx` (Context window rows, Memory warning)
- **Docs:** `docs/phases/phase-ex10.md` ("EX10.1 — as built"), `docs/API_SPEC.md` (LLM config)
- **Tests modified:** `server/tests/llm/{ollama,llm-settings-store}.test.ts`, `server/tests/routes/llm.test.ts`, `client/tests/components/settings-ai.test.tsx`
- **Verification:** server 2346 passed (+2 skipped), client 645, both typechecks clean; Playwright measurements in the phase doc

### EX10.2: Context plan and manager
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `server/src/agent/context/{plan,tokens,layers,manager}.ts`, `server/tests/agent/context/{plan,manager}.test.ts`
- **Files modified:** `server/src/agent/loop/run-loop.ts` (`plan`, `summarize`, prepare/observe around every call, `context`/`compacted` events, cut-off and overflow handling, `final.reason: 'length'`), `server/src/agent/investigation-agent.ts` (plan + summarizer; `length` → `max_steps_reached`)
- **Files deleted:** `server/src/agent/loop/context.ts`, `server/src/agent/context-manager.ts`, `server/tests/agent/context-manager.test.ts`
- **Docs:** `docs/phases/phase-ex10.md` (§2 wire wall, §3 drop/survival/forced, "EX10.2 — as built"), `CLAUDE.md` (context bullet)
- **Tests modified:** `server/tests/agent/loop/{run-loop,guards-budgets}.test.ts`
- **Verification:** server 2336 passed (+2 skipped; the EX2.13 context-manager tests were retired with it), client 645, `tsc -p server` clean

### EX10.3: Prompt tiers and plan budgets
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files modified:** `server/src/agent/executor.ts` (prompt blocks per tier), `server/src/agent/investigation-agent.ts` (tiered "how you work", plan budgets), `server/src/agent/ui-agent.ts` (plan, `context.plan`, reviewer budget), `server/src/agent/reflector.ts` (`plan` parameter, head/tail per output), `server/src/agent/actions/tools.ts` (`actionBudget`/`modelOutputChars` removed, `headAndTail` exported), `server/src/agent/tools/types.ts` (`ToolContext.plan`), `server/src/agent/context/plan.ts` (result share 15%)
- **Docs:** `docs/phases/phase-ex10.md` (§2 result cap, §4 reviewer, "EX10.3 — as built")
- **Tests created:** `server/tests/agent/context/prompt-tiers.test.ts`
- **Tests modified:** `server/tests/agent/context/plan.test.ts`, `server/tests/agent/loop/{run-loop,guards-budgets}.test.ts`
- **Verification:** server 2342 passed (+2 skipped), client unchanged (645), `tsc -p server` clean; full-tier prompt compared byte-for-byte with a pre-change dump

### EX10.4: Executor on the context manager
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `client/src/components/Agent/UIAgentCompletion.tsx`, `server/tests/agent/context/executor-context.test.ts`, `client/tests/components/ui-agent-completion.test.tsx`
- **Files modified:** `server/src/agent/executor.ts` (context manager, `VIEW_CUT_OFF`, overflow retry, `generation_incomplete`, `finishEarly`, `emptySections`), `server/src/agent/ui-agent.ts` (`meta.incomplete`, incomplete completion, fix attempt fallback), `client/src/components/Agent/{UIAgentView,AgentPanel}.tsx`
- **Docs:** `docs/phases/phase-ex10.md` ("EX10.4 — as built")
- **Verification:** server 2351 passed (+2 skipped), client 648, both typechecks clean; Playwright measurements in the phase doc

### EX10.5: View tools
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files created:** `server/src/agent/tools/view-arg.ts`, `server/tests/agent/tools/view-arg.test.ts`
- **Files modified:** `server/src/agent/tools/{update-view,generate-schema,validate-schema}.ts`, `server/src/agent/executor.ts` (tool message without metadata; prompts ask for objects; example call fixed)
- **Docs:** `docs/phases/phase-ex10.md` ("EX10.5 — as built")
- **Tests modified:** `server/tests/agent/tools/{tools,update-view}.test.ts`
- **Verification:** server 2360 passed (+2 skipped), `tsc -p server` clean

### EX10.6: Tool input for every tool
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files modified:** `server/src/agent/tools/tool-converter.ts` (`jsonSchema7` for all), `server/src/agent/loop/tool-input.ts` (`dropNullArgs`, `describeZodIssues`, `zodSignature`, `checkToolArgs`), `server/src/agent/actions/runner.ts` (uses the shared wording), `server/src/agent/loop/run-loop.ts` and `server/src/agent/executor.ts` (nulls dropped, arguments checked after the guardrails)
- **Docs:** `docs/phases/phase-ex10.md` ("EX10.6 — as built")
- **Tests created:** `server/tests/agent/tools/tool-input-all.test.ts`
- **Verification:** server 2365 passed (+2 skipped), `tsc -p server` clean

### EX10.7: Cost
- **Status:** ✅ Complete
- **Date:** 2026-10-22
- **Files modified:** `server/src/observatory/trace-store.ts` (span cost first, no default price), `server/src/llm/usage-tracker.ts` (no default price)
- **Docs:** `docs/phases/phase-ex10.md` ("EX10.7 — as built")
- **Tests modified:** `server/tests/observatory/trace-store.test.ts`, `server/tests/llm/usage-tracker.test.ts`
- **Verification:** server 2366 passed (+2 skipped), client 648, both typechecks clean

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
