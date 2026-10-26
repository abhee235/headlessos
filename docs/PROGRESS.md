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
| M11: Fleet, Agent & Platform | Week 15-16 | ✅ | 8/8 tasks | — |
| M12: Backend Architecture Refactor | Beta | ✅ | 7/7 tasks | [phase-12](phases/phase-12.md) |
| M13: Release Readiness | Beta | ✅ | 5/5 tasks | [phase-13](phases/phase-13.md) |
| M14: Public Release | Beta | 🔄 | 8/10 tasks | [phase-14](phases/phase-14.md) |
| **EX1: Dynamic UI Engine** | **Experimental** | **✅** | **15/15 tasks** | [phase-ex1](phases/phase-ex1.md) |
| **EX2: UI Generation Agent** | **Experimental** | **✅** | **13/13 tasks** | [phase-ex2](phases/phase-ex2.md) |
| **EX3: Smart Layout Engine & Progressive UI** | **Experimental** | **✅** | **26/26 tasks** | [phase-ex3](phases/phase-ex3.md) |
| **EX4: LLM Observatory** | **Experimental** | **✅** | **16/16 tasks** | [phase-ex4](phases/phase-ex4.md) |
| **EX5: CLI App Generation + Sandbox** | **Experimental** | **✅** | **15/15 tasks** | [phase-ex5](phases/phase-ex5.md) |
| **EX6: Multi-Session Desktop & Hibernation** | **Experimental** | **✅** | **34/34 tasks** | [phase-ex6](phases/phase-ex6.md) |
| **EX7: Container Target Mode** | **Experimental** | **✅** | **10/10 tasks** | [phase-ex7](phases/phase-ex7.md) |
| **EX8: LumenOS v3 Design System** | **Experimental** | **✅** | **9/9 tasks** | [phase-ex8](phases/phase-ex8.md) |
| **EX9: Safe Agents (Actions, Approvals, Local Models)** | **Experimental** | **✅** | **6/6 tasks** | [phase-ex9](phases/phase-ex9.md) |
| **EX10: Context Engineering for Agents** | **Experimental** | **✅** | **13/13 tasks** | [phase-ex10](phases/phase-ex10.md) |
| **EX11: Claude Models** | **Experimental** | **✅** | **2/2 tasks** | [phase-ex11](phases/phase-ex11.md) |

---

## M14: Public Release

> Clear what stands between the repository and its first public release (v0.2.0): dependency advisories, stale build output, CI, a security policy, the README, a packaged build, the version and notes. Going public and tagging are the owner's decisions. See [phase-14.md](phases/phase-14.md).

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M14.1 | `npm audit fix` (same majors) and a `dompurify` override | ✅ | 11 high/critical advisories down to 2 (zod, and openai through it). fastify 5.12.7 and 47 other in-range updates; the unused `@fastify/static` removed; dompurify 3.4.17 in the lock (monaco's own bundled copy uses neither affected mode). Server 2537 passed (+2 skipped), client 657 |
| M14.2 | zod 4, openai upgrade, `z.toJSONSchema` instead of `zod-to-json-schema` | ✅ | Production dependencies: 0 advisories. Models get the same JSON Schema as before (pinned against the old library); OpenAI parses strictly when it can and with a plain JSON schema plus Zod otherwise; local Ollama accepts the new format, the 21 KB view schema included. Server 2543 passed (+2 skipped), client 657. Dev-only: vitest 3 (fix is vitest 5) |
| M14.3 | Stop tracking `electron/server.cjs` / `server.mjs` | ✅ | Both untracked and ignored; `npm run build:server` still writes `server.mjs` (5.7 MB, new dependencies bundled); the stale `main.js` comment fixed |
| M14.4 | CI on pull requests and `main`; release workflow runs the checks first | ✅ | `ci.yml` (Ubuntu, Node 20: npm ci, shared build, both typechecks, both suites) on PRs, `main` and as a reusable workflow; `release.yml` runs it before building |
| M14.5 | `SECURITY.md` and `CONTRIBUTING.md` | ✅ | SECURITY.md: reporting, storage and encryption, the local server's checks, agent limits, what each provider (and the weather) receives; every statement checked against the code. CONTRIBUTING.md: setup, the doc-first loop, commit format, CI checks. docs/SECURITY.md brought up to date |
| M14.6 | README: Claude, install and download, screenshots | ✅ | Install from Releases (asset names from release.yml; Linux from source), unsigned-build steps, Claude throughout, links to SECURITY.md and CONTRIBUTING.md; three screenshots taken from an isolated copy connected only to the dev container (no real server, name or key can show) |
| M14.7 | Packaged Windows build starts | ✅ | `win-unpacked` built with the new server bundle and client; the packaged server starts on a free port and answers (health, models incl. Claude, the isolated server list). The NSIS step fails only on this machine (symlink privilege); CI's Windows runner builds it. Window and installer checked on the release assets (M14.10) |
| M14.8 | Version 0.2.0 and `CHANGELOG.md` | ✅ | 0.2.0 in every package.json and both lockfiles, and in the three places the app shows its version; CHANGELOG.md with 0.2.0 (Added, Security, Changed, Fixed) and a 0.1.0 summary checked against the tag |
| M14.9 | Publish (owner's decision: new repository or this one) | ⬜ | |
| M14.10 | Tag v0.2.0 and check the release | ⬜ | |

---

## M13: Release Readiness

> Prepare the repository to be made public: no third-party wallpapers, an MIT licence, no private project or server names, an accurate README, and the GitHub identity on commits. Going public is a separate decision. See [phase-13.md](phases/phase-13.md).

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M13.1 | Remove the Apple and Microsoft wallpapers; a missing saved wallpaper falls back to the default | ✅ | Big Sur, Sequoia and Windows 11 images gone; a saved wallpaper that no longer exists shows Dusk instead of a broken image (tested); the six Unsplash photos stay |
| M13.2 | MIT `LICENSE`, `license` field, README link | ✅ | `LICENSE` (MIT, © 2026 abhee235); root `package.json` license field; README links to it |
| M13.3 | Remove private project/server names from docs, comments and screenshots | ✅ | 13 screenshots removed (both public IPs, the test VPS name, a private project's containers); sibling projects described generically; design-folder references point to phase-ex8; `dev/screenshot.png` ignored. History left as is (owner's call) |
| M13.4 | README matches the code | ✅ | Providers as built (OpenAI or Ollama), apps and agents with their safety model, current layout, setup with optional key, dev SSH server, fake mode, Electron build; every name and path checked against the tree |
| M13.5 | Commit identity: GitHub no-reply for new commits; rewrite existing commits (owner's go-ahead) | ✅ | All 143 commits on every branch are `abhee235 <…noreply.github.com>`; trees byte-identical; `main` force-pushed. Still on GitHub with the old email: merged PRs #1–#3, three old merged branches, tag/release v0.1.0 (owner to decide) |

---

## EX11: Claude Models (Experimental)

> Claude (Haiku 5.5, Sonnet 5.5, Opus 5.5) as a third provider in Settings → AI, through Anthropic's own SDK. One chosen model serves parsing, the AI Agent, Dynamic UI and the UI Agent.
> See [ADR-027](DECISIONS.md) and [phase-ex11.md](phases/phase-ex11.md) for the full spec.

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX11.1 | `AnthropicProvider`: history and tools mapped to the Messages API, thinking kept and sent back (`drop_block`), effort, caching, reply mapping, refusals and fallbacks, JSON parsing, errors, limits | ✅ | 25 tests against a scripted SDK client, including a shared-loop run that sends the first reply's thinking back with its result; a "prompt is too long" error still reads as overflow. Not yet run against the API (needs the owner's key) |
| EX11.2 | Settings → AI: saved key and model, route with key check, startup wiring, Claude prices, client provider/key/model UI, benchmark flag | ✅ | Claude is chosen like OpenAI or Ollama, and each switch keeps the other providers; a key is checked against the model before anything changes (the owner's key passed it against the API). Playwright-measured rows match the existing ones. Server 2537 passed (+2 skipped), client 657 |

---

## EX10: Context Engineering for Agents (Experimental)

> Both agents plan every budget from the model's real window (the lowest of the owner's setting, the Modelfile, the trained length and a 64K auto cap for local models), compact old steps in layers, and handle cut-off replies. The UI Agent executor moves onto the same machinery and its view tools stop wasting the window.
> See [ADR-025](DECISIONS.md) and [phase-ex10.md](phases/phase-ex10.md) for the full spec.

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX10.1 | Model limits (min of owner setting, Modelfile, trained length, 64K auto cap; hosted table); `num_ctx`/`num_predict`/`think: false`; KV estimate + CPU-spill check; Settings → AI context window | ✅ | `ornith:latest` resolves to 65,536 (was 16,384), reply cap 8,192, ≈2.1 GB KV cache; Playwright-measured Settings rows; server 2346 passed (+2 skipped), client 645 |
| EX10.2 | Context plan + context manager in the shared loop (layered compaction, calibration, cut-off/overflow handling, events) | ✅ | Plan matches the reference golden trigger on large windows; invariant `stopAt ≤ trigger ≤ hard ≤ window` and prompt + reply ≤ window tested across windows; layers, breaker, survival, forced compaction, cut-off and overflow paths tested in the loop |
| EX10.3 | Window tiers for system prompts; actions offered, result caps and reviewer input from the plan | ✅ | Executor prompt 3,105 → 2,246 (lean, 64K) → 780 tokens (minimal, 16K); full tier byte-identical to EX9; reviewer sees head + tail of each output |
| EX10.4 | UI Agent executor on the context manager; stop with the last good view and an honest reason | ✅ | Compaction, cut-off reminders and overflow retries in the executor; early stops keep the last valid partial view ("View Partly Generated" + reason + empty sections); fix attempts that stop early keep the reviewed view; Playwright-measured card |
| EX10.5 | View tools: object or string, JSON repair, error position, no echo, short outputs | ✅ | Views as objects; broken strings repaired or located ("at character N (…excerpt…)"); the model never gets the view, schema or action metadata back; prompts no longer ask for strings or "partial JSON" |
| EX10.6 | Tool input for every tool: `jsonSchema7`, nulls dropped, one-line errors | ✅ | The 01:41 `search_templates` call with null optionals now runs; bad arguments get one line with the signature; guardrails still decide first |
| EX10.7 | Trace cost keeps the span's own cost; no default price | ✅ | Local-model runs cost $0 in traces and the usage summary; unknown models are left unpriced, not guessed |
| EX10.8 | Action selection favours request words; `cpu_usage`, `network_traffic`; actions reuse deterministic parsers | ✅ | At 8 slots a network request gets six network actions (was eight core ones); `cpu_usage` / `network_traffic` sample `/proc` twice without a shell (live: 0.4% over 1 s, eth0 6 KB/s); memory, disk, processes, load, ports, connections and interfaces return parsed data; `df -hT` no longer misread |
| EX10.9 | Follow-up requests refine the open view; unclear requests get a question | ✅ | A follow-up sends the earlier request and the open view; the planner gets an outline, the executor starts from the view and changes it in place, in the same window. Live: "also add memory usage" turned "Disk Usage" into "Disk & Memory Usage" in 22 s. Requests that name nothing ("help", "fix it") get one question at once; the planner never asked on its own. Playwright-measured chip and question card |
| EX10.10 | Widget-by-widget building with server-filled data (own ADR) | ✅ | ADR-026. `start_view` / `add_widget` / `finish`; a `source` fills rows, values, pairs, chart data and log lines from action results; copied log lines are bound to the real ones. Live logs runs 32–56 s with `finish` (were 75–387 s); the 9B model copies instead of writing sources, so binding corrects text widgets only |
| EX10.11 | Loop control in the UI Agent: loop guard in the executor (previous-turn repeats), stuck runs finish with the view or a wrap-up turn, steps-left warning, notes on the last tool result, announced-but-not-made calls | ✅ | Live: logs 139 s with 7 widgets (was 135 s, empty), overview 32 s with 10 widgets (was 151 s, 6 at the step limit); a repeated broken view is warned, refused and stopped instead of running to step 30. Benchmark on ornith:latest: picked 100%, answered 10/12. Server 2429 passed (+2 skipped), client 650 |
| EX10.12 | Errors that steer: a missing file says so, says not to retry, and lists its folder | ✅ | Live: after one turn of missing logs the model read the files the listing named; a broken view string now says what is still wrong ("sections.system-logs.layout: missing…"), and the next call fixed it — the logs request completed with 7 widgets in 139 s (was an empty view after 135 s) |
| EX10.13 | Garbled replies cut off and asked again; a slow start is checked before giving up | ✅ | A reply that turns into one repeated character is stopped at 200 of them and the request closed; a silence (no first chunk in 180 s, or none for 60 s mid-reply) is checked against `/api/ps` and waited out up to 600 s / 900 s while Ollama is up, or ends at once (`alive: false`) when it is not. Mocked streams only |

---

## EX9: Safe Agents — Action Catalog, Approvals, Local Models (Experimental)

> Agents pick typed actions from a server-side catalog instead of writing shell commands; the server builds and runs the command. Changes wait for the owner's approval. Then Ollama support.
> See [ADR-024](DECISIONS.md) and [phase-ex9.md](phases/phase-ex9.md) for the full spec.

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX9.0 | Remove the UI Agent's write tools (`exec_write_command`, `sftp_write`) from `ALL_AGENT_TOOLS` | ✅ | Default registry has no write-tier tool; a model calling either name gets "Unknown tool" and SSH/SFTP are never touched (3 new tests) |
| EX9.1 | Action catalog + validators + quoting + runner; agent scope enforced by CommandPolicy; both agents on the runner | ✅ | 60 read actions; inside an agent run CommandPolicy refuses any ungranted command in every mode; `exec_command`/`sftp_read`/`sandbox_exec` and the read allowlist retired; fake dev mode runs end to end on actions. Server 2203 passed (+1 skipped), client 624 |
| EX9.2 | Change actions, ApprovalGate, append-only audit log, ApprovalCard; Stop denies pending; view buttons via preview/run | ✅ | 11 change actions; read-only runs refuse them outright; allow/deny/Stop/timeout paths tested; Playwright-measured footer switch + approval dialog (Deny only); audit got asked + answered deny |
| EX9.3 | Shared agent loop (typed events), OllamaProvider, Settings → AI provider choice, weak-model input handling | ✅ | Investigation agent on native tool calls; Ollama provider + model picker (Playwright-measured against a real local Ollama); JSON repair, prose calls, key aliases, coercion |
| EX9.4 | Loop guard, context trimming, output caps, per-model benchmark | ✅ | Guard warns, refuses identical repeats, stops with a tools-off conclusion; history trimmed to the window; SSH byte cap + per-model output cap; `npm run bench:agents` (tested with a scripted provider, not yet run on a real model) |
| EX9.5 | (Optional) per-server agent login, untrusted-data marking, secret redaction | ✅ | Redaction in the runner and the model view; server output reaches the model inside `<server_output>` and both prompts say it is data. Per-server agent login deferred (needs a second credential, connection and form UI). Server 2329 passed (+2 skipped), client 643 |

---

## EX6: Multi-Session Desktop, Per-Server Preferences & Hibernation (Experimental)

> See [ADR-020](DECISIONS.md), [ADR-021](DECISIONS.md), [ADR-022](DECISIONS.md), and [phase-ex6.md](phases/phase-ex6.md) for full spec.
> Citrix-style multi-server desktop. Each server is a persistent session with its own windows, preferences, and accent color. Sessions hibernate to disk and wake on app reopen. Fleet Overview moves to Control Center.

### Sub-Phase EX6-A: Foundation (Data Model + Storage)

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX6-A.1 | ADRs (020/021/022) drafted | ✅ | DECISIONS.md updated |
| EX6-A.2 | Phase doc + PROGRESS entries | ✅ | phase-ex6.md created, PROGRESS row added |
| EX6-A.3 | `SessionStateSchema` (shared) | ✅ | Schema in `shared/schemas/session.ts`, 16 round-trip tests pass |
| EX6-A.4 | Backend `SessionStore` service | ✅ | `server/src/config/session-store.ts`, atomic writes, 16 tests pass |
| EX6-A.5 | Backend `routes/sessions.ts` (REST CRUD + hibernate) | ✅ | 5 endpoints wired in `server/src/index.ts` |
| EX6-A.6 | Frontend `useSessionsStore` | ✅ | `client/src/store/sessions-store.ts` + 23 tests pass; lifecycle, debounced warm/cold flush, beforeunload beacon |
| EX6-A.7 | Migrate `useDesktopStore` → session-scoped windows | ✅ | `client/src/store/window-session-sync.ts` + 17 tests; bidirectional debounced sync, cross-session isolation verified |
| EX6-A.8 | Migrate preferences → layered (global ⊕ override) | ✅ | `client/src/store/effective-preferences.ts` + 20 tests; allowlist of 7 keys enforced |
| EX6-A.9 | Migrate clipboard + dynamic-ui to per-session | ✅ | Clipboard now in `SessionState.clipboard`; `unpinAllForServer` on hibernate; 8 isolation tests |
| EX6-A.10 | Backend graceful shutdown flush hook | ✅ | SIGTERM/SIGINT marks all live SSH sessions hibernated via `connectionManager.getConnectedServerIds()` + 5 tests |
| EX6-A.11 | Tests + CI green | ✅ | Full sweep: 1815 server + 514 client = 2329 tests green |

### Sub-Phase EX6-B: Session Switcher UI

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX6-B.1 | `SessionSwitcher` component (hover-reveal top bar) | ✅ | 4px trigger zone, 200ms slide-down, sticky-pin via localStorage |
| EX6-B.2 | `SessionTile` with thumbnail + status badges | ✅ | connected/connecting/error/hibernated dot + icon, window count |
| EX6-B.3 | Tile context menu (rename, color, hibernate, disconnect) | ✅ | Activate/Hibernate/Disconnect/Terminate; rename+color deferred to C |
| EX6-B.4 | Keyboard shortcuts (Ctrl+1..9, Ctrl+Tab, Ctrl+Shift+H) | ✅ | `useSessionShortcuts` + 8 tests; input/contentEditable guards |
| EX6-B.5 | Per-session visual identity (3px accent strip + taskbar tint) | ✅ | 3px strip from session-derived accent (deterministic hash) |
| EX6-B.6 | Multi-session connection coordination (background polling throttle) | ✅ | `useEffectiveRefreshInterval` 4× multiplier + 5 tests |
| EX6-B.7 | Wake-on-boot flow (single unlock → parallel reconnect) | ✅ | `loadAll()` rehydrates summaries; bridge forwards activate on first selection |
| EX6-B.8 | Tests + DevTools MCP visual verification | ✅ | 18 new client tests; total 532 client + 1815 server = 2347 green |

### Sub-Phase EX6-C: Control Center (Relocate Fleet)

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX6-C.1 | Rename `LoginScreen` → `ControlCenter` (3 sections) | ✅ | `client/src/components/ControlCenter/ControlCenter.tsx`; segmented Sessions/Fleet/Settings tabs |
| EX6-C.2 | Move `FleetDashboardView` to Control Center | ✅ | Embedded in Fleet tab via `onServerActivated` callback that triggers `goToDesktop()` |
| EX6-C.3 | Remove Fleet from desktop app registry | ✅ | Removed from `apps.ts`, `StartMenu`, `Desktop`, `Taskbar`; `WindowManager` case kept as legacy fallback |
| EX6-C.4 | Sessions section (Resume/Wake/Connect cards) | ✅ | Reuses existing LoginScreen flow via `embedded` prop |
| EX6-C.5 | Global Settings section (always-global preferences) | ✅ | `GlobalSettingsSection.tsx`: accent default, date format, notifications; pointer to per-session Settings app |
| EX6-C.6 | Entry points (shortcut, switcher overflow, no-active-session boot) | ✅ | `Ctrl/Cmd+Shift+Space` opens Control Center via `useSessionShortcuts` |
| EX6-C.7 | Update docs (ARCHITECTURE/CONTEXT/UI_DESIGN/APP_REGISTRY) | ✅ | All four docs updated |
| EX6-C.8 | Branded loading spinner rollout | ✅ | `client/src/components/ui/spinner.tsx` added; active loading indicators migrated from `Loader2`; `npm run test:client` passed (36 files, 539 tests) |

### Sub-Phase EX6-D: Polish (Defer if Scope Tight)

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX6-D.1 | Per-session lock (optional re-auth on wake) | ✅ | `lockOnHibernate` flag on `SessionState`/`SessionSummary`; `WakeConfirmDialog.tsx` registers an activation guard via `registerActivationGuard()`; toggle in `SessionTile` context menu |
| EX6-D.2 | Drag/move-window-between-sessions | ✅ | `moveWindowToSession()` in `window-session-sync.ts`; "Move to session" submenu in window context menu; **Citrix isolation**: `WindowManager` and `Taskbar` filter by `activeServerId` |
| EX6-D.3 | Per-session wallpaper | ✅ | `Wallpaper.tsx` switched to `useEffectivePref('wallpaperId')`; per-session scope toggle (session/global/reset) in `SettingsView WallpaperPage` |
| EX6-D.4 | Session export / import | ✅ | `client/src/lib/session-io.ts` (envelope `{exportVersion: 1, exportedAt, state}`); export from `SessionTile`, import from `GlobalSettingsSection`; imports forced to `hibernated` |
| EX6-D.5 | Auto-hibernation (opt-in, configurable timeout) | ✅ | `autoHibernateMinutes` preference (Off/5/15/30/60/180); `useAutoHibernate` 30s watchdog wired in `DesktopLayout`; UI in `GeneralPage` |
| EX6-D.6 | Agent conversation history UI | ✅ | `agent-store` persists complete/error/aborted runs into `SessionState.agentHistory` (cap 50); `AgentHistoryList` in `UIAgentView` (testid `agent-history-list`) — click to re-run |
| EX6-D.7 | LLM Observatory persistence + retention | ✅ | `TracePersistence` service writes ended traces to `~/.headlessos/observatory/traces/<id>.json`; sweep enforces 30-day OR 10k cap, runs every 6h + on boot; **6 tests passing** |

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
| M11.8 | Electron Dynamic Port Signal (PORT=0 fix) | ✅ | `server/src/index.ts` emits `HEADLESSOS_PORT:<n>` on stdout; `PORT=0` now resolves to actual OS-assigned port instead of falling back to 3001 |

---

## M12: Backend Architecture Refactor

> Domain service layer + CommandPolicy chokepoint. No new features — restructure routes/services for safety, testability, and reusability. See [phase-12.md](phases/phase-12.md) and [ADR-023](DECISIONS.md#adr-023-domain-service-layer--command-policy-chokepoint).

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| M12.1 | CommandPolicy chokepoint | ✅ | `services/policy/command-policy.ts`, wired into `ConnectionManager.exec()`, 3 modes via `HEADLESS_POLICY_MODE`, 29 tests |
| M12.2 | DockerService + slim docker.ts | ✅ | `services/domain/{base,docker-service}.ts`, `routes/docker.ts` reduced to thin wrappers, response shapes preserved |
| M12.3 | FilesService | ✅ | `services/domain/files-service.ts` (SFTP domain layer), `routes/files.ts` 628 → ~170 lines, 30 tests |
| M12.4 | Admin domain services (8) | ✅ | `services/domain/admin/{network,firewall,security,webserver,packages,cron,logs,storage}-admin-service.ts` + barrel index |
| M12.5 | Decompose serveradmin.ts | ✅ | Single-file rewrite 1,655 → ~520 lines, 8 sections matching original, all response shapes preserved |
| M12.6 | Domain service unit tests | ✅ | `tests/services/domain/admin-services.test.ts` (39), `docker-service.test.ts` (6), `policy/command-policy.test.ts` (29). Full suite 1895/1895 |
| M12.7 | Documentation | ✅ | ADR-023, phase-12.md, ARCHITECTURE.md update, PROGRESS/TRACEABILITY entries |
| M12.8 | Domain services for remaining routes | ✅ | SystemService, SystemdService, TaskManagerService, FleetService, FilesService + slim routes + 65 new tests. Full suite 1960/1960 server tests |

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
| EX2.13 | Context Manager | ✅ | Token estimation, 80% threshold compaction, head/tail split, weak model summarization, 28 tests |

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

## EX3: Smart Layout Engine & Progressive UI Generation (Experimental)

> See [phase-ex3.md](phases/phase-ex3.md) for full spec. Focus: widget selection, smart placement, responsive layouts, content classification, design-system compliance. NOT a visualization tool.

### Sub-Phase EX3-P: Widget Primitives (Complete)

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX3-P.1 | Tab Count Badges | ✅ | `count` field on tabs, Badge renders next to label |
| EX3-P.2 | Monospace Column Type | ✅ | `mono` column type, plain monospace no background |
| EX3-P.3 | Rich Compound Table Cells | ✅ | `rich` column type with text/badge/icon/dot segments |
| EX3-P.4 | Table Filters & Search | ✅ | `filters` on table: dropdowns + search bar |
| EX3-P.5 | Dropdown Action Menu | ✅ | `actionStyle: 'dropdown'` renders ⋯ menu |
| EX3-P.6 | Card List Widget | ✅ | New `card-list` widget with icon/title/badge/details/actions |
| EX3-P.7 | NetworkSection Playground Example | ✅ | Full 5-tab replication in playground JSON |
| EX3-P.8 | Nestable Layouts | ✅ | `LayoutOrWidgetSchema` — layouts contain widgets OR nested layouts |

### Sub-Phase EX3-A: Content Classification & Layout Patterns (Complete)

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX3-A.1 | Two-Pass Design Classifier | ✅ | DesignClassificationSchema, fast classifier, safeParse validation, 23 tests |
| EX3-A.2 | Layout Pattern Library | ✅ | 10 named patterns with skeletons, population rules, widget constraints, 61 tests |
| EX3-A.3 | Responsive Auto-Fit Grid | ✅ | `autoFit` + `minChildWidth` on GridLayout, CSS auto-fit rendering, 10 tests |
| EX3-A.4 | Gauge Widget (Supporting) | ✅ | Semicircle gauge via recharts PieChart, threshold coloring, 3 sizes, 9 tests |
| EX3-A.5 | Sparkline Stat Card | ✅ | Stat-card with optional AreaChart sparkline behind value, 7 tests |
| EX3-A.6 | Enhanced Chart Options | ✅ | Stacking, thresholds, unit formatting, grid/legend toggles, 53 tests |

### Sub-Phase EX3-B: Design System Prompt & Templates (Complete)

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX3-B.1 | Design System Rules in Prompt | ✅ | Auto-generated from layout pattern registry, injected into system prompt, 10 tests |
| EX3-B.2 | Improve Existing 15 Templates | ✅ | All 15 templates use layoutPattern, autoFit grids, stat-cards, tabs, search filters |
| EX3-B.3 | Expand to 25+ Templates | ✅ | 12 new templates (27 total): docker-images, docker-compose, memory-analysis, network-interfaces, system-logs-journal, ssl-certificates, environment-variables, git-repositories, database-status, backup-status, kernel-modules, port-scan. All schema-validated. |
| EX3-B.4 | FakeLLM Generator | ✅ | FakeLLMGenerator class: generate/generateFromCommand/generateAll/hasTemplate, deterministic view generation from templates, 27 templates |

### Sub-Phase EX3-C: Progressive Multi-Step Generation (Complete)

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX3-C.1 | WorkingView & Mutation Tools | ✅ | WorkingView class + createSkeleton(): addWidget, replaceWidget, addTab, updateMetadata, addSection, getSnapshot, getDiff, validate |
| EX3-C.2 | `layout_update` Event Pipeline | ✅ | LayoutUpdatePhase type (skeleton/widget/complete/error), layout_update AgentEvent in executor, frontend handler in useUIAgent + AgentPanel |
| EX3-C.3 | Early Window Opening | ✅ | UIAgentView opens preview immediately on isRunning, skeleton loading state with animated pulse placeholders |
| EX3-C.4 | Multi-Step Executor Prompt | ✅ | buildMultiStepPrompt() + formatClassification() in prompts/multi-step.ts, skeleton→primary→secondary→polish build order |

### Sub-Phase EX3-D: Unified Window & Visual Polish (Complete)

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX3-D.1 | DynamicUIWindow Component | ✅ | GenerationPhase type (loading/skeleton/progressive/complete), phase-based rendering, SkeletonBody component, phase-aware footer with generation stats |
| EX3-D.2 | View Toolbar | ✅ | Regenerate, Copy JSON (clipboard + toast), JSON toggle, Pin, Save as App — toolbar reorganized |
| EX3-D.3 | Entrance Animations | ✅ | CSS @keyframes widgetEnter + tabSlideIn, staggered via --stagger-index custom property, @media (prefers-reduced-motion: reduce) |
| EX3-D.4 | Template QA & Visual Regression | ✅ | 117 new tests in ex3-template-qa.test.ts: 27 template schema validation, FakeLLMGenerator, WorkingView, multi-step prompts, layout patterns |

---

## EX4: LLM Observatory — Embedded Trace & Span Debugger (Experimental)

> Phoenix-inspired embedded LLM tracing system. Zero external dependencies, in-process ring buffer, AsyncLocalStorage context.
> See [ADR-018](DECISIONS.md) and [phase-ex4.md](phases/phase-ex4.md) for full spec.

### Sub-Phase EX4-A: Data Models & TraceStore

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX4-A.1 | Trace & Span Zod Schemas | ✅ | 42 schema tests passing |
| EX4-A.2 | TraceStore (In-Memory Ring Buffer) | ✅ | 35 trace-store tests passing |
| EX4-A.3 | Instrumentation Context (AsyncLocalStorage) | ✅ | 14 context tests passing |

### Sub-Phase EX4-B: Instrumentation

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX4-B.1 | Instrument ModelRouter | ✅ | 7 model-router-spans tests passing |
| EX4-B.2 | Instrument Agent Pipeline | ✅ | 11 agent-spans tests passing |
| EX4-B.3 | Instrument DynamicUIGenerator | ✅ | 5 generator-spans tests passing |

### Sub-Phase EX4-C: Backend API

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX4-C.1 | Observatory REST Routes | ✅ | 19 route tests passing (REST + WS combined) |
| EX4-C.2 | WebSocket Live Trace Events | ✅ | Included in C.1 route tests |

### Sub-Phase EX4-D: Frontend — Trace List & Stats

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX4-D.1 | Observatory App Registration | ✅ | 3 registration tests passing |
| EX4-D.2 | Trace List View | ✅ | 10 TraceListView tests passing |
| EX4-D.3 | Observatory Stats Dashboard | ✅ | 5 StatsPanel tests passing |

### Sub-Phase EX4-E: Frontend — Trace Tree & Span Detail

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX4-E.1 | Trace Detail Layout | ✅ | 8 TraceDetailView tests passing |
| EX4-E.2 | Trace Tree Component | ✅ | 7 TraceTree tests passing |
| EX4-E.3 | Timeline Bars | ✅ | 7 TimelineBar tests passing |
| EX4-E.4 | Span Detail Panel | ✅ | 8 SpanDetailPanel tests passing |
| EX4-E.5 | Live Trace Updates | ✅ | 10 useObservatorySocket tests + 17 observatory-store tests passing |

---

## EX5: CLI App Generation with Sandbox Discovery (Experimental)

> Agent-driven CLI tool introspection → DynamicView generation → Save as reusable app.
> Optional sandbox mode runs discovery in an ephemeral Docker container for safety.
> See [ADR-019](DECISIONS.md) and [phase-ex5.md](phases/phase-ex5.md) for full spec.

### Sub-Phase EX5-A: Foundation — Allowlist & Form Wiring

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX5-A.1 | CLI Discovery Command Allowlist | ✅ | 22 regex patterns added, 32 tests passing — `--help`, `which`, `man`, etc. |
| EX5-A.2 | Form CommandTemplate & Submit Wiring | ✅ | commandTemplate/confirmSubmit/confirmMessage added to schema + WidgetRenderer FormCommandWrapper + 14 tests |
| EX5-A.3 | CLI Introspection Prompt Engineering | ✅ | Planner: CLI Tool UI Pattern section + 2 CLI examples + cli-introspection hint; Executor: buildCLIIntrospectionGuidance with 3-phase workflow (Discovery/UI Mapping/Form Wiring) + meta.tool; 7 new tests passing |

### Sub-Phase EX5-B: Sandbox Execution Environment

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX5-B.1 | SandboxManager Service | ✅ | SandboxManager extends BaseService, 33 tests passing. create/exec/install/destroy + TTL auto-cleanup |
| EX5-B.2 | sandbox_exec Agent Tool | ✅ | sandbox_exec tool with allowlist + sandbox-specific guards, 17 tests passing |
| EX5-B.3 | Two-Phase Agent Flow | ✅ | UIAgent sandbox lifecycle: create → install → wire context → generate → destroy. Fallback on Docker unavailability. 16 tests passing |
| EX5-B.4 | Frontend Sandbox Toggle | ✅ | Shield toggle with Docker check, GenerateOptions in useUIAgent, 12 tests passing |

### Sub-Phase EX5-C: Save & Reuse Apps

| Task ID | Task | Status | Verification |
|---------|------|--------|--------------|
| EX5-C.1 | User App Persistence (Backend) | ✅ | AppStore CRUD + disk persistence + TemplateRegistry integration, 5 REST endpoints, 37 tests passing |
| EX5-C.2 | Save As App UI (Frontend) | ✅ | SaveAsAppDialog component, icon picker, client API functions, wired into DynamicAppWindow toolbar, 15 tests passing |
| EX5-C.3 | App Launcher Integration | ✅ | Zustand saved-app-store + StartMenu "My Apps" section + CommandPalette "My Apps" group + 13 tests passing |

---

## Backlog (Future)

| # | Task | Priority | Notes |
|---|------|----------|-------|
| B.1 | ~~Ollama (local LLM) provider~~ | — | **Covered by EX9.3** (Settings → AI → Ollama) |
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
| 2026-10-27 | **M14 specced** after an audit for going public: 11 high or critical dependency advisories (one critical, in `dompurify` under the code editor), six-month-old server bundles committed, no CI on pull requests, no security policy, and a README without Claude or install steps. The owner decides how to publish (a new repository is recommended, to leave out old PRs that carry the personal email) and when to tag v0.2.0. |
| 2026-10-27 | **EX11 ✅** Claude (Haiku 5.5, Sonnet 5.5, Opus 5.5) is now a choice in Settings → AI, next to OpenAI and Ollama. The key is checked with Anthropic before it is saved, stored encrypted, and kept when switching to another provider and back. Parsing, the AI Agent, Dynamic UI and the UI Agent all run on the chosen Claude model, which sends its earlier reasoning back between steps; traces show what each call costs. |
| 2026-10-27 | **EX11 specced** (ADR-027): Claude models (Haiku 5.5, Sonnet 5.5, Opus 5.5) become a third choice in Settings → AI, with the owner's own Anthropic key, through Anthropic's own SDK. The agents keep their history format; the new provider translates it, and sends Claude's thinking back so multi-step runs keep their reasoning. |
| 2026-10-25 | **EX10.9 ✅ (EX10 complete)** The next prompt in the UI Agent panel now refines the view that is open, in the same window: "also add memory usage" adds to the disk view instead of starting over, and "New view" starts fresh. A request that names nothing, like "help" or "fix it", gets one question back instead of a guessed view. |
| 2026-10-25 | **EX10.8 ✅, EX10.10 ✅** The UI Agent builds views one widget at a time, and the server can fill each widget from what an action returned (ADR-026): exact numbers, and no model copying log files. New `cpu_usage` and `network_traffic` actions measure over a second; memory, disk, processes, ports and interfaces return parsed data; a request about the network now gets network actions even on a small model. On the local 9B model the logs view now takes 32–56 s (was up to 387 s). |
| 2026-10-25 | **EX10 follow-ups** from live checks. What filled the model's window in the slow logs runs was binary log files: `faillog` and `wtmp` cost about 12,000 tokens a read. They are now refused with a pointer to `recent_logins`, and replayed, that run never needs compaction. The other fixes: compaction keeps the last five results instead of four whole turns; Ollama hiccups (dropped connections, 5xx, runner crashes, unfinished streams) are tried again; garbled or unfinished replies are asked for again; and a cut-off reply's retry is capped at half the size, about a minute instead of 2.5. The garbled-reply cut-off and the slow-start check were confirmed against the real model. |
| 2026-10-25 | **EX10.11–EX10.13 ✅** The UI Agent no longer runs in circles. A call that keeps returning the same result is warned about, then refused, then the run stops and finishes with the view it built (or one last turn to build it). Errors say what to do instead: a missing log file lists what the folder holds, and a broken view says what is still wrong. Ollama replies that break down into repeated characters are cut off, and a silence is checked before it is given up. On a local 9B model, "show my system logs" went from an empty view after 135 s to a full one in 139 s. |
| 2026-10-25 | **EX10.11–EX10.13 specced** after three live runs on a local 9B model: one asked for the same missing log files every turn until the step limit, another resent the same broken view 8 times. The UI Agent gets the loop guard the AI Agent already has (warn, refuse, stop, then finish with what it built), errors that say what to do instead, and Ollama replies that are cut off when they turn to garbage or checked before a slow start is given up. |
| 2026-10-25 | **M13 ✅** Apple/Microsoft wallpapers removed, MIT licence added, private project and server names gone from docs and screenshots, README brought up to date, and every commit now carries the GitHub identity (history rewritten, `main` force-pushed). Before going public the owner still decides on the merged PRs, old branches and the v0.1.0 release, which keep the old email on GitHub. |
| 2026-10-25 | **M13 specced** after a pre-publication audit: no secrets anywhere in the history; to fix before going public — Apple/Microsoft wallpapers, no LICENSE file, private project and server names in docs and screenshots, an outdated README, and the personal email on commits. |
| 2026-10-22 | **EX10 follow-ups** from the first three 64K runs. View tools show the model an object only, and a view sent with misplaced brackets is repaired when the fix gives a valid view (9 of the 10 failed views from those runs). Ollama replies stream and time out only on silence, so a long reply is no longer cut at 120 s with a false "not reachable". A reply that takes too long is treated like one cut off: the agent asks for a smaller step and, if it keeps happening, keeps the last valid view. |
| 2026-10-22 | **EX10.7 ✅** Local-model runs no longer show a made-up cost in the Observatory or the usage summary: a model without a known price costs nothing, and the router's $0 for local models is kept. |
| 2026-10-22 | **EX10.6 ✅** Every agent tool now treats a null argument as "not given" and answers a bad argument with one line naming the parameter and what was sent, instead of a raw validation dump. The template search that failed on a local model's null arguments now runs. |
| 2026-10-22 | **EX10.5 ✅** The UI Agent's view tools stop wasting the window: views go in as JSON objects instead of escaped strings, a broken string is repaired or the error says exactly where it broke, and nothing echoes the view (or action details) back to the model — each update answers in one short line. |
| 2026-10-22 | **EX10.4 ✅** The UI Agent now manages its context: it compacts old steps before each call, answers a cut-off reply with a short reminder instead of a "use tools" nudge, and retries after an overflow. When it still cannot finish, it keeps the last valid view and says so — "View Partly Generated: stopped early because …, still empty: Docker, Network" — instead of "Agent stopped making progress". |
| 2026-10-22 | **EX10.3 ✅** Small models get smaller instructions: the UI Agent's system prompt drops from about 3,100 tokens to about 2,200 on a 64K window and about 800 on a 16K one, keeping every rule. The tool list, per-result caps and the reviewer's input now all come from the same context plan. |
| 2026-10-22 | **EX10.2 ✅** The AI Agent no longer fails when its context fills: before every model call it compacts old steps in layers (superseded views, long old results, all old results, a summary by the same model, then dropping), corrects its token estimate from what the model actually counted, answers a cut-off reply with a reminder instead of a nudge, and retries after a context-overflow error. |
| 2026-10-22 | **EX10.1 ✅** A local model's window is now the lowest of your setting (Auto = 64K), the Modelfile and what the model was trained for — 65,536 tokens for the 9B model that kept hitting 16K. Every Ollama request sends that window, a reply cap and `think: false`. Settings → AI shows the window, why it is that size, its cache cost, and warns if the model no longer fits in GPU memory. |
| 2026-10-22 | **EX10 specced** (ADR-025): agents plan every budget from the model's real window — the lowest of the owner's setting, the Modelfile, the trained length and a 64K auto cap for local models — and compact old steps in layers instead of failing when the window fills. Prompted by three UI Agent runs on a local 9B model that hit the old 16K cap. |
| 2026-10-22 | **EX9.5 ✅ (EX9 complete)** Secrets are removed from every action's output before the owner or the model sees it (private keys, tokens, API keys, password hashes, `password=`-style values, connection-string passwords); the model is told how many. Server output reaches the model inside `<server_output>` and both agents' prompts say text there is data, never instructions. Per-server agent login is deferred. |
| 2026-10-22 | **EX9.4 ✅** Agent runs stay bounded. A loop guard warns when the same call keeps returning the same result, refuses identical repeats, and ends a stuck run with a tools-off summary; history is trimmed to the model's window (older results stubbed first); SSH output stops at a byte cap and each result is cut to what the model can afford (60% head, 40% tail). `npm run bench:agents` scores a model on 12 benign questions against canned output. |
| 2026-10-22 | **EX9.3 ✅** Agents work with local models. Settings → AI gains Ollama (URL, consent for a non-loopback host, the installed models); one provider serves parsing, both agents and Dynamic UI, and the OpenAI key stays saved for switching back. The investigation agent runs on a shared loop with native tool calls and typed events; small models get a tool list sized to their context. Broken tool-call JSON is repaired, tool calls written as text are run, misnamed parameters are mapped, and errors read "field: expected …, you sent …". |
| 2026-10-22 | **EX9.2 ✅** Nothing changes a server until the owner allows it. 11 change actions (services, containers, nginx reload, process signal, apt) pause the run and show an approval card with the exact command, server, login user and the model's reason; Allow once or Deny, Stop denies everything pending, 10-minute expiry, no "always allow". Every asked/answered/ran event is appended to `~/.headlessos/audit/actions.jsonl`. AI Agent gets an "Allow changes (asks first)" switch (off by default). Generated view buttons name catalog actions; changes go through a server-recorded preview; legacy command buttons may only read. |
| 2026-10-22 | **EX9.0–EX9.1 ✅** Agents no longer write shell commands. The UI Agent's write tools are unregistered; both agents call 60 typed read actions (`agent/actions/`) whose parameters are validated by strict Zod schemas and whose argv is built and quoted by the server. Inside an agent run, `CommandPolicy` refuses any command the action runner did not grant, in every policy mode, and SFTP needs a grant. SFTP reads re-check the resolved real path (symlinks). The free-form `exec_command`/`sftp_read`/`sandbox_exec` tools and the regex read allowlist are gone. |
| 2026-10-22 | **EX9 🔄** Safe agents planned. ADR-024 (agents run typed actions, not shell commands; supersedes the free-form command parts of ADR-014). Phase spec: phase-ex9.md (6 tasks): action catalog + runner enforced at CommandPolicy via an agent scope, owner approvals with an append-only audit log, shared loop + Ollama, loop guard and budgets. SECURITY.md §4b added. |
| 2026-10-20 | **EX8 ✅** LumenOS v3 glass design (7/7). Token layer (`--lumen-*` → shadcn tokens, `data-accent`/`data-glass`/`data-transparency` presets, accent follows wallpaper), bundled Manrope + Geist Mono, every `ui/` primitive, window chrome, floating dock + tray, launcher, new Quick Settings, notifications + calendar, lock/sign-in, and all apps restyled. New: Task Manager process detail card + `GET /taskmanager/process/:pid` + SIGSTOP/SIGCONT. Fixes: command palette launch, terminal resize frames typed into the shell, theme on lock screen. Validated side-by-side against the Claude Design prototype with Playwright. See [phase-ex8](phases/phase-ex8.md). |
| 2026-10-20 | **EX8.8 ✅** Monaco code editor in Files and container Files: bundled + lazy-loaded (offline-safe), language from file name, Lumen light/dark syntax themes, Ctrl/⌘+S. Also: branded H spinner for every window's lazy load and container shells (docker exec as the pty command), 2px type step in Settings rows, light-theme label contrast raised to WCAG AA. |
| 2026-10-20 | **EX8.9 ✅** Task Manager gains App history (per-command CPU time, memory, disk I/O since boot), Startup apps (systemd unit files + systemd-analyze, SysV start links, @reboot cron; toggle with confirm), Users (per-account cards from `ps` + `/etc/passwd` + sessions) and Services (systemd or SysV fallback, Start/Stop with confirm and an ssh warning). `GET /services` now works on hosts without systemd. |
| 2026-10-21 | **EX8.10 ✅** HomeHub: the prototype's smart-home overlay (camera, weather, AC gauge, TV, LED, Alexa, WiFi, player, rooms) as React, client-only sample data, opened from the dock's new Home button. Launcher glyph is the 9-dot grid. Pixel-matched to the prototype. |
| 2026-10-21 | **EX8.11–EX8.15 ✅** Top menu bar (tray moved up), dock position setting, process detail card re-port, one segmented/tab look, and HomeHub as a glance: local-user greeting, server users, ~/Pictures photo frame, Open-Meteo weather (city in Settings), server health dial, recent apps, display brightness / night light, assistant, connection, saved servers. |
| 2026-10-20 | **EX7 ✅** Container Target Mode (9/9). Browse/view/edit/create/upload/rename/delete files **inside** a Docker container, plus shell-into-container, via `docker exec`/base64 (container stays SSH-free). New: `parsers/container-ls.ts`, `routes/container-files.ts`, `components/Docker/ContainerFilesView.tsx`; terminal `?container=` exec; Docker app "Open Files"/"Open Shell" context items. Security: hex container-id + path validation + shellEscape + double-escaped nested `sh -c`; 2 MB cap. Verified live against real containers + Playwright UI run. See [phase-ex7](phases/phase-ex7.md). |
| 2026-10-20 | **Security audit** before open-sourcing: fixed 2 RCEs (C1 `/dynamic-ui/refresh`, C2 chpasswd — re-homed into `security-admin-service.ts` after the M12 refactor), added per-session API token + Host/WS-origin checks (C3), allowlist hardening (H1/H2), encryption secret (M1), write-back denylist (M3). See [SECURITY_AUDIT.md](SECURITY_AUDIT.md). Also: `CLAUDE.md`, `.gitattributes` (LF for scripts), Windows Electron build validated, init-analysis fixes. |
| 2026-05-04 | **M12 ✅** Backend Architecture Refactor complete (7/7 tasks, M12.3 deferred with rationale). M12.1 CommandPolicy chokepoint at `ConnectionManager.exec()` (3 modes: enforce/audit/off via `HEADLESS_POLICY_MODE`, 29 tests). M12.2 DockerService + slim `routes/docker.ts`. M12.4 8 admin domain services (network/firewall/security/webserver/packages/cron/logs/storage). M12.5 `routes/serveradmin.ts` 1,655 → ~520 lines. M12.6 74 new tests (39 admin + 6 docker + 29 policy). M12.7 ADR-023, phase-12.md, ARCHITECTURE.md domain layer note. **1,895 server tests passing.** Zero new tsc errors. All response shapes preserved — frontend unchanged. |
| 2026-04-18 | **EX6 ✅** Multi-Session Desktop & Hibernation complete (32/32 tasks). EX6-D Polish: D.1 per-session lock + activation guard + WakeConfirmDialog; D.2 move-window-between-sessions + **Citrix isolation** (WindowManager/Taskbar filter by activeServerId — fixes cross-session window bleed); D.3 per-session wallpaper via useEffectivePref; D.4 session export/import (envelope JSON); D.5 auto-hibernation watchdog (30s tick); D.6 agent conversation history persisted into SessionState.agentHistory; D.7 Observatory trace persistence to `~/.headlessos/observatory/traces/` with 30d/10k retention sweep. **2,360 tests passing** (1,821 server + 539 client). |
| 2026-04-18 | **EX6 🔄** Multi-Session Desktop & Hibernation phase started. ADR-020 (Multi-Session Architecture), ADR-021 (Persistence & Hibernation), ADR-022 (Per-Session Preference Layering) drafted. Phase spec: phase-ex6.md (27 tasks across 4 sub-phases A/B/C/D). EX6-A.1 ✅ (ADRs), EX6-A.2 ✅ (phase doc + PROGRESS). Citrix-style multi-server desktop with hover-reveal Session Switcher, three-tier persistence (hot/warm/cold), per-session accent colors as safety mechanism, Fleet relocated to new Control Center. |
| 2026-04-14 | **EX3 ✅** Smart Layout Engine & Progressive UI complete (26/26 tasks). EX3-B.3: 12 new templates (27 total, all schema-validated). EX3-B.4: FakeLLMGenerator class. EX3-C.1: WorkingView + createSkeleton. EX3-C.2: layout_update event pipeline. EX3-C.3: Early window opening with skeleton. EX3-C.4: Multi-step executor prompt. EX3-D.1: Phase-based DynamicAppWindow rendering. EX3-D.2: Copy JSON toolbar button. EX3-D.3: Staggered entrance animations + prefers-reduced-motion. EX3-D.4: 117 QA tests. **2,224 tests passing** (1,778 server + 446 client). |
| 2026-04-13 | **EX4 ⬜** LLM Observatory planned (16 tasks, 5 sub-phases). ADR-018 created. Phase spec: phase-ex4.md. Embedded Phoenix-inspired trace & span debugger — in-memory ring buffer, AsyncLocalStorage context, hierarchical trace tree, timeline bars, span detail with input/output content. Zero external dependencies. ~128 estimated tests. |
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
