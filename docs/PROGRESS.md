# Progress Tracker

> Current status dashboard for HeadlessOS. Compact view — detailed specs live in `docs/phases/`.
>
> **Update this file after every completed task.**
> **Update [TRACEABILITY.md](TRACEABILITY.md) with files + commits after each task.**

## Status Legend

| Emoji | Status |
|-------|--------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Completed |
| ❌ | Blocked |
| ⏭️ | Skipped (decided not to do) |

## Milestone Overview

| Milestone | Target | Status | Progress | Spec |
|-----------|--------|--------|----------|------|
| M0: Project Scaffolding | Week 1, Day 1-2 | ✅ | 6/6 tasks | [phase-0](phases/phase-0.md) |
| M1: SSH + Terminal + LLM | Week 1, Day 3-7 | ✅ | 9/9 tasks | [phase-1](phases/phase-1.md) |
| M2: Dashboard + File Explorer | Week 2 | ✅ | 6/6 tasks | [phase-2](phases/phase-2.md) |
| M3: Docker + Processes + Services | Week 3 | ✅ | 6/6 tasks | [phase-3](phases/phase-3.md) |
| M4: Deterministic Parsers | Week 4 | ✅ | 8/8 tasks | [phase-4](phases/phase-4.md) |
| M5: Polish + Security + Testing | Week 5 | ✅ | 6/6 tasks | [phase-5](phases/phase-5.md) |
| M6: Desktop UI System | Week 6-7 | ✅ | 11/11 tasks | [phase-6](phases/phase-6.md) |
| M7: System Settings | Week 8 | ✅ | 6/6 tasks | [phase-7](phases/phase-7.md) |
| M8: Server Admin CRUD | Week 9-10 | ✅ | 8/8 tasks | [phase-8](phases/phase-8.md) |
| M9: Desktop Polish & Core UX | Week 11 | ✅ | 12/12 tasks | — |
| M10: Advanced Features | Week 12-14 | ✅ | 10/10 tasks | — |
| M11: Fleet, Agent & Platform | Week 15-16 | ✅ | 7/7 tasks | — |
| **EX1: Dynamic UI Engine** | **Experimental** | **🔄** | **7/15 tasks** | [phase-ex1](phases/phase-ex1.md) |
| **EX2: UI Generation Agent** | **Experimental** | **⬜** | **0/13 tasks** | [phase-ex2](phases/phase-ex2.md) |

---

<!-- COMPLETED MILESTONES (collapsed to one-liner after completion)
Example:
| ✅ M0 | Project Scaffolding | 6/6 | [Summary](archive/M0-summary.md) |
-->

## M0: Project Scaffolding

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M0.1 | Initialize monorepo | ✅ | `npm install` succeeds |
| M0.2 | Service Container | ✅ | Two-phase boot, reverse shutdown |
| M0.3 | Shared Types | ✅ | Both workspaces import types |
| M0.4 | Fastify Server Setup | ✅ | `GET /health` returns 200 |
| M0.5 | React + Vite + Tailwind | ✅ | Browser shows app at :3000 |
| M0.6 | Dev Script | ✅ | Single command starts everything |

**Definition of Done (M0):** `npm run dev` starts both server (port 3001) and client (port 3000). Browser shows a React page. Server responds to health check.

---

## M1: SSH + Terminal + LLM Core

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M1.1 | SSH Connection Manager | ✅ | Connect to VPS, exec returns output |
| M1.2 | LLM Provider + OpenAI | ✅ | Parse terminal text → Zod-validated JSON |
| M1.3 | Parsing Pipeline | ✅ | Routes to deterministic/LLM correctly |
| M1.4 | Command Orchestrator | ✅ | 5 cmds parallel, retry on Zod fail |
| M1.5 | Terminal WebSocket | ✅ | xterm.js → interactive SSH session |
| M1.6 | Config Store | ✅ | Add/list/remove servers persists |
| M1.7 | API Routes (Phase 1) | ✅ | CRUD servers via REST API |
| M1.8 | Frontend Shell | ✅ | Layout, tabs, terminal panel |
| M1.9 | Terminal Component | ✅ | Interactive terminal in browser |

---

## M2: Dashboard + File Explorer

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M2.1 | Dashboard Backend | ✅ | 4 deterministic parsers, 3 API endpoints, ~8ms |
| M2.2 | Dashboard Frontend | ✅ | Hostname, OS, memory, disk, network cards |
| M2.3 | File Explorer Backend | ✅ | 7 SFTP endpoints, path traversal blocked |
| M2.4 | File Explorer Frontend | ✅ | Breadcrumb nav, table view, file viewer |
| M2.5 | File Operations | ✅ | Create/rename/delete files+folders, edit+save |
| M2.6 | Auto-Refresh | ✅ | 30s interval with "last updated" timestamp |

---

## M3: Docker + Processes + Services

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M3.1 | Docker Backend | ✅ | Lists containers/images (JSON format), start/stop/restart/remove, logs, inspect |
| M3.2 | Docker Frontend | ✅ | Container/image tabs, context menu actions, search/filter |
| M3.3 | Docker Log Streaming | ✅ | Real-time log tailing with auto-refresh panel |
| M3.4 | Process Manager Backend | ✅ | Done — Task Manager covers this (M7.1) |
| M3.5 | Process Manager Frontend | ✅ | Done — Task Manager covers this (M7.1) |
| M3.6 | Services Manager | ✅ | List/start/stop/restart/enable/disable systemd, status/logs panel |

---

## M4: Deterministic Parsers + Caching

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M4.1 | Parser: `df -h` | ✅ | Done in M2.1 — deterministic/df.ts |
| M4.2 | Parser: `free -m` | ✅ | Done in M2.1 — deterministic/free.ts |
| M4.3 | Parser: `ps aux` | ✅ | Done in M7.1 — deterministic/ps-aux.ts, registered in allParsers[], used by taskManagerRoutes |
| M4.4 | Parser: `ls -la` | ⏭️ | Skipped — SFTP readdir() used for all file listing (no consumer) |
| M4.5 | Parser: `ip -brief addr` | ✅ | Done in M2.1 — deterministic/ip.ts |
| M4.6 | Parser: `systemctl` | ✅ | Extracted inline parser from services.ts → deterministic/systemctl.ts + Zod schema |
| M4.7 | Caching Layer | ✅ | OutputCache: hash-based cache with TTL, pipeline integration, server invalidation, stats |
| M4.8 | LLM Usage Stats | ✅ | LLMUsageTracker + `GET /api/stats/llm` + `POST /api/stats/llm/reset`. Per-model pricing, cost estimates |

---

## M5: Polish + Security + Testing

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M5.1 | Command Validation | ✅ | Command allowlist (60+ patterns), blocklist (17 patterns), blocked command detection |
| M5.2 | Path Validation | ✅ | Enhanced validators: container ID (12-64 hex), PID (1-4194304), signal (1-31), ISO date, log source, service name (256 max), shell escape hardened |
| M5.3 | Credential Encryption | ✅ | AES-256-GCM, machine-derived key, auto-migration from plaintext, file permissions 0600 |
| M5.4 | Error Handling | ✅ | sanitizeErrorMessage() redacts paths/IPs, shellEscape defense-in-depth on all routes |
| M5.5 | Test Suite | ✅ | 224 tests (182 server + 42 client): 81 security validators, 22 encryption, 51 parser tests |
| M5.6 | UI Polish | ✅ | Terminal: loading/ctx menu/reconnect/theme-aware. Desktop ctx menu wired (View/Sort/Refresh/About). alert()→toast() everywhere. Global shortcuts (F5, Cmd+Shift+Esc). DashboardView/LoginScreen empty states. |

---

## M6: Desktop UI System

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M6.1 | High-Quality Desktop & File Icons | ✅ | Custom SVGs (FileExplorer, Terminal, ThisPC, Docker Moby), Apple HIG AppIconBase |
| M6.2 | Glassmorphic Context Menus | ✅ | Desktop, files, taskbar right-click with glass styling |
| M6.3 | Branded Wallpaper System | ✅ | 5 builtin gradients, 13 system wallpapers, user upload, HeadlessOS watermark (opacity 0.035) |
| M6.4 | Light / White Theme | ✅ | oklch theme system, dark/light toggle, localStorage persist |
| M6.5 | Window Chrome Polish | ✅ | Snap-to-edges (left/right/corners/maximize), snap preview overlay, un-maximize on drag |
| M6.6 | Taskbar & Start Menu Polish | ✅ | Glass start menu, 4-color logo, AM/PM clock, system tray, user avatar |
| M6.7 | File Operation UI (Copy/Paste) | ✅ | Clipboard store, cut/copy/paste, backend copy (cp -r) + move (SFTP rename), context menu + keyboard |
| M6.8 | Notification / Toast System | ✅ | Sonner toasts (30+ sites), bottom-right, all types (success/error/info/warning) |
| M6.9 | Keyboard Shortcuts | ✅ | useKeyboardShortcuts hook: Alt+F4, Ctrl+Space, Ctrl+Tab, Ctrl+`, Ctrl+Shift+Esc; file explorer: Ctrl+C/X/V/A, Delete, F2, F5, Enter, Esc |
| M6.10 | Selection & Multi-Select | ✅ | useSelection hook: click, Ctrl+Click toggle, Shift+Click range, selectAll, visual highlight in all views, status bar count |
| M6.11 | Login Flow | ✅ | LockScreen, LoginScreen, AddServerForm, ServerAvatar; Lock + Switch User buttons in StartMenu |
---

## M7: System Settings

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M7.1 | Terminal Settings | ✅ | Font size, font family, cursor style, scrollback, copy-on-select — persisted + applied |
| M7.2 | Server Admin App | ✅ | 8 sections, 23 parsers, 11 API endpoints, 51 parser tests — all passing |
| M7.3 | LLM / AI Configuration | ⏭️ | Moved to backlog — core functionality covered by M10.7 (LLM Provider Config) |
| M7.4 | Appearance (Expand) | ✅ | Accent color (8 oklch presets) wired to CSS vars, theme auto mode, desktop icon size — 307 tests passing |
| M7.5 | General Settings | ✅ | Clock format (12h/24h) wired to Taskbar, auto-refresh interval selector, connection info (server-side deferred to M7.3) |
| M7.6 | Notifications & Data | ✅ | Toast show/hide toggle, position selector (bottom-right/top-right), clear cache, reset all settings with confirmation |

---

## M8: Server Admin CRUD

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M8.1 | Fail2ban Management | ✅ | Ban/unban IPs, list banned, jail status, reload config |
| M8.2 | Firewall Advanced Rules | ✅ | IP-based rules, port ranges, named app profiles, rule reordering |
| M8.3 | Nginx Site Management | ✅ | Enable/disable sites, nginx reload/restart, config editing, certbot renewal |
| M8.4 | Package Management | ✅ | apt update, upgrade individual/all packages, install/remove packages, search |
| M8.5 | Cron Job Management | ✅ | Add/edit/delete cron jobs, schedule presets, human-readable display, system vs user sources |
| M8.6 | User & Session Management | ✅ | Create/delete users, set password, add to group, kill sessions — 379 tests passing |
| M8.7 | Network Management | ✅ | DNS configuration, hostname change, interface up/down, `parseIpLinkShow` parser |
| M8.8 | Log Enhancements | ✅ | Priority filtering, grep search, date range (since/until), auto-refresh, auto-scroll, export as text |

---

## M9: Desktop Polish & Core UX

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M9.1 | Bug Fixes | ✅ | App registry IDs fixed, Task Manager shortcut, "This PC" icon, desktop refresh, server bind 127.0.0.1 |
| M9.2 | Dynamic Recently Used | ✅ | recentApps in preferences-store, recordAppUsage, Start Menu dynamic rendering |
| M9.3 | Dynamic Pin/Unpin Taskbar | ✅ | pinnedAppIds in preferences, pin/unpin context menu, Taskbar dynamic rendering |
| M9.4 | Keyboard Shortcuts Reference | ✅ | 'keyboard' page in Settings, KeyboardShortcutsPage with 11 global + 9 file explorer shortcuts |
| M9.5 | Command Palette | ✅ | Ctrl+K searchable palette: Apps, Actions (theme/start menu), Settings pages |
| M9.6 | Window Animations | ✅ | CSS keyframes windowOpen/windowClose, animate-windowOpen class, smooth snap transitions |
| M9.7 | Complete Snap Zones | ✅ | bottom-left/bottom-right quarter snap, Ctrl+Arrow keyboard shortcuts |
| M9.8 | Show Desktop | ✅ | toggleShowDesktop in window-store, thin peek strip in Taskbar, Ctrl+D shortcut |
| M9.9 | See All Apps View | ✅ | ALL_APPS alphabetical list, "See all"/"Back" toggle in Start Menu |
| M9.10 | Start Menu Keyboard Nav | ✅ | Arrow key/Enter/Escape navigation, visual focus ring highlight |
| M9.11 | Wire autoRefreshInterval | ✅ | Dashboard/Docker/Services use preferences autoRefreshInterval (with per-view minimums) |
| M9.12 | First-Run Onboarding | ✅ | WelcomeDialog 5-step wizard, hasSeenOnboarding preference flag |

---

## M10: Advanced Features

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M10.1 | Notification Center Panel | ✅ | Zustand store, NotificationBell in system tray, slide-out panel with dismiss/read/clear |
| M10.2 | Multi-Server Sidebar | ✅ | Fixed left sidebar (w-14), server initials, status indicators, context menu connect/disconnect/remove |
| M10.3 | Drag-and-Drop File Upload | ✅ | Backend multipart upload endpoint, XHR progress tracking, UploadDropZone overlay with progress bar |
| M10.4 | Split-Pane File Explorer | ✅ | SplitPaneExplorer with ResizablePanelGroup, MiniFileList per pane, toolbar toggle button |
| M10.5 | App Permission System | ✅ | 15 capability types, per-app defaults, override grant/revoke, localStorage persistence, risk levels |
| M10.6 | IPC Pub-Sub Event Bus | ✅ | Typed EventMap (35+ event types), on/once/emit/off, history tracking, useEventBus React hook |
| M10.7 | LLM Provider Config | ✅ | Backend GET/PUT /api/llm/config + /models routes, AI/LLM settings page in Settings, live provider switching |
| M10.8 | Plugin / Extension API | ✅ | Zod PluginManifestSchema, PluginRegistry with activate/deactivate lifecycle, disposable cleanup |
| M10.9 | E2E Test Suite | ✅ | Unit tests for EventBus, PermissionSystem, PluginRegistry, NotificationStore (4 test files, 35+ tests) |
| M10.10 | Performance Optimization | ✅ | React.lazy code splitting for all views + screens, Suspense boundaries, Vite manual chunks vendor splitting |

---

## M11: Fleet, Agent & Platform

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M11.1 | Multi-Server Fleet Dashboard | ✅ | Fleet route (GET /api/fleet/overview), FleetDashboardView with server cards, totals bar, auto-refresh |
| M11.2 | Electron Desktop Wrapper | ✅ | electron/ directory: main.js, preload.js, package.json, macOS menu, hiddenInset title bar |
| M11.3 | Community Plugin Manager UI | ✅ | Plugins page in Settings: install from URL, activate/deactivate/remove, permission reference |
| M11.4 | Server Groups & Tags | ✅ | tags?: string[] in ServerConfig, PUT /api/servers/:id/tags, fleet overview includes tags |
| M11.5 | ReAct Investigation Agent | ✅ | InvestigationAgent class (50+ allowlist, 15 blocked, ReAct loop), agent routes, AgentView frontend, 73 tests |
| M11.6 | Agent Progress Streaming | ✅ | WebSocket /ws/agent/:id/:sessionId, real-time step display, abort support |
| M11.7 | Bug Fixes & Type Safety | ✅ | Fixed pinnedAppIds type, fleet.ts mountPoint/getServers, SettingsView LLM config type |

---

## EX1: Dynamic UI Engine (Experimental)

> LLM-generated dynamic interfaces from terminal output. Any CLI tool gets a visual UI.
> See [ADR-015](DECISIONS.md) and [phase-ex1.md](phases/phase-ex1.md) for full spec.

### Phase 1: JSON → UI Renderer

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX1.1 | DynamicViewSchema (Zod) | ✅ | Schema compiles, works with zodResponseFormat(), 71 unit tests |
| EX1.2 | DynamicViewRenderer + Widget Components | ✅ | 7 base widgets render from JSON, partial schema support, 21 tests |
| EX1.3 | DynamicAppWindow Wrapper | ✅ | Opens as AppWindow overlay, sidebar layout maps correctly, 6 tests |
| EX1.4 | JSON Playground (Dev Tool) | ✅ | Split-pane editor, live preview, Zod validation feedback, 6 tests |
| EX1.5 | Extended Widgets (Chart, Tree, LogViewer) | ✅ | Chart/tree/log widgets render, added to WidgetSchema union, 15 tests |
| EX1.6 | Tabbed + Sidebar Layouts | ✅ | Tabs and sidebar layouts work, theme-aligned styling, 8 tests |

### Phase 2: LLM → JSON Generation

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX1.7 | Template Library (15+ templates) | ✅ | 15 templates validate against schema, match logic works, 71 tests |
| EX1.8 | DynamicUIGenerator Service (Streaming) | ✅ | Generator service, REST/WS endpoints, 34 tests |
| EX1.9 | Command Palette Trigger | ✅ | Dynamic UI group in palette, template search, freeform generation, 12 tests |
| EX1.10 | Schema Caching & Persistence | ✅ | Disk cache (DynamicUIDiskCache), favorites CRUD, 2-level memory→disk cache, bypassCache, 18 tests |

### Phase 3: Full Integration

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX1.11 | Terminal Buffer Capture | ✅ | TerminalBuffer (500 lines), pattern detection (table/json/log/config/list), "Visualize" button, 26 tests |
| EX1.12 | Live Data Refresh | ✅ | Widget-level dataSource auto-refresh, pause/resume |
| EX1.13 | Desktop Tab Integration | ✅ | Dynamic views as desktop tabs, persistence |
| EX1.14 | Action Execution from Dynamic UI | ✅ | Buttons trigger SSH commands, allowlist validated, confirmation |
| EX1.15 | FormWidget (Editable Config UI) | ✅ | Form fields (text/number/boolean/select/textarea), client validation, field groups, read-only mode, 35 tests |

---

## EX2: UI Generation Agent (Experimental)

> See [ADR-016](DECISIONS.md) and [phase-ex2.md](phases/phase-ex2.md) for full spec.
> Depends on EX1.1 (DynamicViewSchema), EX1.2 (Renderer), EX1.7 (Template Library)

### Phase 1: Agent Core

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX2.1 | Multi-Model Router | ✅ | 4 roles (reasoning/structured-output/fast/weak), fallback chain, usage tracking, runtime config update, 39 tests |
| EX2.2 | Agent Tool System (9 tools) | ✅ | Tools + tool-converter (OpenAI fn format), tool-result-per-tool-use guarantee |
| EX2.3 | Three-Tier Security Guardrails | ✅ | Read/write/deny tiers enforced, injection tests pass |
| EX2.4 | Planner Phase | ✅ | Reasoning model produces PlannerHints (intent + expected widgets, NOT step list) |
| EX2.5 | Reactive Executor | ✅ | Native function calling loop, inline Zod validation, safety rails |
| EX2.6 | Post-Generation Reflector | ✅ | Optional quality check, typed errors, max 2 fix loops |
| EX2.7 | UI Agent Orchestrator | ✅ | Stack-based Plan→ReactiveLoop→OptionalReflect, abort, session tracking |
| EX2.13 | Context Manager | ⬜ | Token tracking, 80% compaction threshold, weak model summarization |

### Phase 2: Interactive UIs + Write-Back

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX2.8 | FormWidget Schema + Component | ✅ | Form fields render, client validation, submit handler (done in EX1.15) |
| EX2.9 | Write-Back API | ✅ | Backup→write→validate→rollback flow, SFTP path allowlist, 26 tests |
| EX2.10 | Error Recovery Strategies | ✅ | Exponential backoff, typed errors, context compaction, graceful degradation, 56 tests |

### Phase 3: Frontend Integration

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX2.11 | Agent UI Panel | ✅ | All event types rendered, tool timing, abort, collapse, progressive preview, 23 tests |
| EX2.12 | WebSocket Protocol + Hooks | ✅ | WS /ws/ui-agent/:serverId, useUIAgent hook, agent-store, 55 tests (36 server + 19 client) |

---

## Backlog (Future)

| # | Task | Priority | Notes |
|---|------|----------|-------|
| B.1 | Ollama (local LLM) provider | Medium | Zero cost alternative |
| B.2 | Anthropic (Claude) provider | Low | Alternative cloud provider |
| B.3 | Vision pipeline (ncurses tools) | Low | Screenshot → LLM image parse |
| B.4 | Git app | Medium | View repos, branches, recent commits |
| B.5 | ~~Nginx/Apache config viewer~~ | — | **Covered by M7.2** (Web Server section) |
| B.6 | PM2 app | Medium | Node.js process manager |
| B.7 | ~~Log viewer app~~ | — | **Covered by M7.2** (Logs section) |
| B.8 | ~~Multi-server overview dashboard~~ | — | **Covered by M11.1** (Fleet Dashboard) |
| B.9 | ~~Electron wrapper~~ | — | **Covered by M11.2** (Electron Wrapper) |
| B.10 | ~~Community plugin system~~ | — | **Covered by M11.3** (Plugin Manager UI) |
| B.11 | ~~Keyboard shortcuts~~ | — | **Covered by M9.4/M9.5** (keyboard reference + command palette) |
| B.12 | ~~Server groups / tags~~ | — | **Covered by M11.4** (Server Tags in Fleet) |
| B.13 | ~~ReAct investigation agent~~ | — | **Covered by M11.5** (AI Investigation Agent) |
| B.14 | ~~Agent progress streaming~~ | — | **Covered by M11.6** (Agent WebSocket + UI) |
| B.15 | LLM / AI Configuration Enhancements | Medium | Advanced provider select, per-model API keys, usage stats dashboard, fallback toggle, cost budgets — basic config covered by M10.7 |

---

## Change Log

> Last 10 entries shown. Full history in git log.

| Date | Change |
|------|--------|
| 2026-04-11 | **EX1 ⬜** Dynamic UI Engine planned (14 tasks, 3 phases). ADR-015 created. Phase spec: phase-ex1.md. Core feature: LLM generates JSON schemas from terminal output → generic renderer builds live UI with streaming/incremental rendering. |
| 2026-04-06 | **M7.3 ⏭️** LLM / AI Configuration moved to backlog (B.15) — core functionality already covered by M10.7. M7 now fully complete (6/6). All 11 milestones (M0–M11) complete. |
| 2026-04-06 | **M11 ✅** Fleet, Agent & Platform complete (7/7 tasks): M11.1 Fleet Dashboard (fleet route + aggregate stats + server cards UI), M11.2 Electron Wrapper (main.js + preload.js + package.json + macOS menu), M11.3 Plugin Manager UI (Settings page: install from URL, activate/deactivate/remove, permission reference), M11.4 Server Tags (tags field in ServerConfig, fleet route tag support), M11.5 ReAct Agent (InvestigationAgent class with 50+ allowlist patterns, 15 blocked patterns, ReAct loop, AgentView frontend), M11.6 Agent Streaming (WebSocket endpoint + real-time step UI). Also fixed: pinnedAppIds type error, fleet.ts mountPoint/getServers, SettingsView LLM config type. 535 tests (406 server + 129 client) all passing. |
| 2026-04-10 | **M10 ✅** Advanced Features complete (10/10 tasks): M10.1 Notification Center (store + bell icon + slide-out panel), M10.2 Multi-Server Sidebar (initials, status dots, context menu), M10.3 Drag-and-Drop Upload (multipart backend + XHR progress + drop zone), M10.4 Split-Pane Explorer (ResizablePanelGroup + MiniFileList), M10.5 App Permissions (15 capabilities, overrides, persistence), M10.6 IPC Event Bus (35+ typed events, useEventBus hook), M10.7 LLM Config UI (backend routes + AI settings page), M10.8 Plugin API (Zod manifest schema, registry lifecycle), M10.9 Test Suite (4 test files: event-bus, permissions, plugins, notification-store), M10.10 Performance (React.lazy code splitting, Suspense, Vite manual chunks). |
| 2026-04-09 | **M9 ✅** Desktop Polish & Core UX complete (12/12 tasks): M9.1 bug fixes (registry IDs, bind address), M9.2 dynamic recently used, M9.3 pin/unpin taskbar, M9.4 keyboard shortcuts reference, M9.5 command palette (Ctrl+K), M9.6 window animations, M9.7 complete snap zones (6 zones + Ctrl+Arrow), M9.8 show desktop (Ctrl+D + peek strip), M9.9 see all apps view, M9.10 start menu keyboard nav, M9.11 wire autoRefreshInterval, M9.12 first-run onboarding wizard. 412 tests (333 server + 79 client) passing. |
| 2026-04-09 | **M8 ✅** Server Admin CRUD complete (8/8 tasks): M8.5 cron management, M8.6 user/session management, M8.7 network management, M8.8 log enhancements. Fixed M8 progress count (was showing 4/8, all 8 tasks were completed). |
| 2026-04-08 | **M8.4 ✅** Package Management: validatePackageName/validateSearchQuery validators, apt allowlist expansion (update/install/remove/upgrade/search), parseAptSearchResults parser, 6 new routes (apt update, upgrade-all, install, remove, upgrade, search), 7 new API client functions, PackagesSection rewrite with tabbed UI (Upgradable + Search & Install), per-package upgrade buttons, install/remove with confirmation dialogs, debounced search. 359 tests (280 server + 79 client) passing. |
| 2026-04-08 | **M7.4-M7.6 ✅** Settings expansion: Appearance (8 oklch accent color presets wired to --primary/--ring CSS vars, theme auto mode with prefers-color-scheme listener, desktop icon size), General (clock format 12h/24h wired to Taskbar, auto-refresh interval select), Notifications & Data (toast show/hide/position, clear cache, reset all settings with ConfirmDialog). Updated preferences-store (6 new fields + ACCENT_PRESETS), rewrote theme-store (auto mode + resolvedTheme), SettingsView (6 pages: General/Appearance/Wallpaper/Terminal/Notifications/About). 307 tests (228 server + 79 client) passing. |
| 2026-04-08 | **M6 ✅** Desktop UI System complete: M6.3 wallpaper (confirmed done), M6.5 window snap-to-edges + preview overlay, M6.7 clipboard store + copy/move endpoints + context menu wiring, M6.8 toasts (confirmed done), M6.9 useKeyboardShortcuts hook (Alt+F4, Ctrl+Space/Tab/`/Shift+Esc), M6.10 useSelection hook (click/Ctrl/Shift+click, visual highlight, status bar count), M6.11 Lock + Switch User in StartMenu. 292 tests (228 server + 64 client) all passing. |
| 2026-04-07 | **M4 ✅** Deterministic Parsers + Optimization complete: M4.3 ps-aux (done in M7.1), M4.4 ls-la skipped (SFTP), M4.6 systemctl parser extracted from services.ts to registry + Zod schema, M4.7 OutputCache (hash-based, TTL, pipeline integration, server invalidation), M4.8 LLMUsageTracker + /api/stats/llm endpoint. 260 tests (218 server + 42 client) all passing. |
| 2026-04-07 | **M5.6 ✅** UI Polish: Terminal loading/context menu/reconnect/theme-aware, Desktop context menu wired (View/Sort/Refresh/About HeadlessOS dialog), alert()→toast() in all components, global keyboard shortcuts (F5, Cmd+Shift+Esc), DashboardView empty state, LoginScreen loading state, desktopIconSize/desktopSortBy preferences |
| 2026-04-07 | **M5.1-M5.5 ✅** Security hardening: command allowlist (60+ patterns), 17 blocked commands, enhanced validators (container ID 12-64, PID range, signal, ISO date, log source), AES-256-GCM credential encryption, CRITICAL injection fixes in serveradmin.ts + docker.ts, unified central validators, 103 new security tests (81 validator + 22 encryption), 224 total tests passing |
| 2026-04-06 | **M7.2 ✅** Server Admin App: 8 sections (Network, Firewall, Security, WebServer, Packages, Cron, Logs, Storage), 23 deterministic parsers, 11 REST endpoints, 8 frontend components, 51 parser tests |
| 2026-04-05 | **M7.1 ✅** Terminal Settings: preferences store (5 fields), TerminalView wiring, TerminalPage UI |
| 2026-04-05 | **M7.2 redefined** Server Admin as standalone desktop app (8 sections) — replaces old Server CRUD spec |
| 2026-04-05 | **M6.1 ✅** Icons: Custom SVGs (FileExplorer, Terminal, ThisPC, Docker Moby), Apple HIG AppIconBase |
| 2026-04-05 | **M6.2 ✅** Glassmorphic context menus with backdrop-blur |
| 2026-04-05 | **M6.4 ✅** oklch theme migration, dark/light toggle |
| 2026-04-05 | **M6.6 ✅** Taskbar & Start Menu: glass menu, 4-color logo, clock, tray, avatar |
| 2026-04-04 | **M3 complete** — Docker backend (containers/images JSON, actions, logs, inspect), Docker frontend (container/image tabs, context menus, search, log viewer), Services backend (systemd list/start/stop/restart/enable/disable, status/logs), Services frontend (filter pills, context menus, status/log panels), M3.4/M3.5 covered by Task Manager |
| 2026-04-04 | Initial documentation created |
| 2026-04-04 | Puter analysis — ADR-011, ADR-012, 5 design patterns |
| 2026-04-04 | Command Orchestrator — ADR-013, ADR-014, Task M1.4 |
| 2026-04-04 | IDE config — Cursor rules + Copilot instructions |
| 2026-04-04 | Doc scalability — split IMPLEMENTATION into phases, added TRACEABILITY, task ID system |
| 2026-04-04 | **M0 complete** — monorepo, ServiceContainer, shared types, Fastify, React+Vite+Tailwind, dev script |
| 2026-04-04 | **M1 complete** — SSH ConnectionManager, LLM Provider, ParsingPipeline, CommandOrchestrator, Terminal WebSocket, ConfigStore, API routes, Frontend Shell, Terminal Component |
| 2026-04-04 | **M2 complete** — Dashboard backend (4 parsers, 3 endpoints), Dashboard frontend (5 components), File Explorer backend (7 SFTP endpoints, security validators), File Explorer frontend (breadcrumb nav, file list, viewer, CRUD actions), Auto-refresh (30s interval) |

---

## How to Update This File

After completing a task:
1. Change ⬜ to ✅ in the task's status column
2. Update the milestone progress count (e.g., `1/6 tasks`)
3. Add a Change Log entry
4. **Also update [TRACEABILITY.md](TRACEABILITY.md)** with files created, commits, verification results

After completing a milestone:
1. Collapse the milestone section to a one-liner (see comment template above)
2. Create `docs/archive/M{n}-summary.md` with lessons learned
3. Update the Milestone Overview status
