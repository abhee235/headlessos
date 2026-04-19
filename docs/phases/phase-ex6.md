# Phase EX6: Multi-Session Desktop, Per-Server Preferences & Hibernation

> **Milestone:** EX6
> **Goal:** Citrix-style multi-server desktop. Each connected server is its own persistent session with its own windows, preferences, and appearance. Users switch via a hover-reveal Session Switcher. Sessions hibernate to disk and wake on app reopen — like Windows hibernation. Fleet Overview moves out of the in-OS desktop and into a Control Center.
> **ADRs:** ADR-020 (Multi-Session Architecture), ADR-021 (Persistence & Hibernation), ADR-022 (Per-Session Preference Layering)

---

## Motivation

Real users manage 5–10 servers (app, db, logging, monitoring, etc.) and switch between them all day. Today HeadlessOS shows **one desktop at a time** — switching `activeServerId` wipes the visible UI even though windows are tagged with `serverId`. Closing the app loses everything.

**User-stated pain points:**
1. "I switch between servers all day — current single-active-server is jarring."
2. "When I close my laptop and reopen, I want everything restored, like Windows hibernation."
3. "I want to see in the switcher which sessions are connected — like Citrix's connection bar."
4. "My agent conversations and LLM observability should persist across restarts."
5. "Fleet Overview is in the wrong place — it's a meta view, not a per-server app."

EX6 addresses all five.

---

## Architecture Overview

```
                ┌──────── Control Center (pre-desktop) ────────┐
                │  [Sessions]  [Fleet*]  [Global Settings]     │
                │  *default landing view if no active session  │
                └──────────────┬───────────────────────────────┘
                               │ unlock + wake hibernated sessions
                               ↓
   ┌────────────────────── Desktop ────────────────────────────┐
   │ ┌─Session Switcher (hover-reveal at top edge)──────────┐ │
   │ │ [● db-prod] [● app-1] [💤 logs] [🔄 monitor] [+]      │ │  ← per-session tiles
   │ └────────────────────────────────────────────────────────┘ │
   │  ┌─ accent strip (per-session color, 3px) ─────────────┐  │
   │  │                                                       │  │
   │  │           Active Session Desktop (windows)            │  │
   │  │                                                       │  │
   │  └──────────────────────────────────────────────────────┘  │
   │  Taskbar (active session's apps + pinned + clock)         │
   └────────────────────────────────────────────────────────────┘

Lifecycle:    [terminated] → [hibernated] ⇄ [background] ⇄ [active]
                                                  (graceful close / explicit user action)

Storage:    Hot (Zustand)  →  Warm (localStorage, debounced)  →  Cold (~/.headlessos/sessions/{serverId}.json)
```

### Key Design Decisions (locked)

- **One session per server.** Not N-per-server. Matches user model.
- **Hibernation triggers:** explicit user action, app/browser close, backend graceful shutdown. **NO idle timer** — would force constant SSH reconnects for users who switch all day.
- **Auto-wake all hibernated sessions on app load**, behind a single unified lock-screen unlock. Each tile shows reconnect status.
- **Backend file is authoritative cold tier** — survives browser data clear, enables future multi-device sync.
- **Per-session accent color is mandatory and prominent** — primary safety mechanism against running destructive commands on the wrong server.
- **Fleet Overview moves to Control Center** as default landing view. Removed from desktop app registry.
- **Agent conversations persist per session** (cap: last 50 per server).
- **LLM Observatory persists globally** (cross-session, separate retention policy).

---

## Sub-Phase EX6-A: Foundation (Data Model + Storage)

> Ships invisibly — no user-facing UI changes, but full data model is in place. All existing UI continues to work because the migration preserves single-active-session behavior.

### EX6-A.1: ADRs Drafted

**Goal:** Capture architectural decisions before code.
**Files:** `docs/DECISIONS.md`
**Deliverables:** ADR-020, ADR-021, ADR-022.
**Verification:** ADRs reviewed; no open architectural questions remain.

### EX6-A.2: Phase Doc + PROGRESS Entries

**Goal:** Make the work plan public.
**Files:** `docs/phases/phase-ex6.md` (this doc), `docs/PROGRESS.md` (EX6 milestone row + task table), `docs/TRACEABILITY.md` (EX6 section seeded).

### EX6-A.3: `SessionStateSchema` (shared)

**Goal:** Single source of truth for what a session contains.
**File:** `shared/schemas/session.ts`

```ts
export const SessionLifecycleSchema = z.enum(['active', 'background', 'hibernated']);

export const PersistedWindowSchema = z.object({
  id: z.string(),
  appId: z.string(),
  title: z.string(),
  icon: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  minimized: z.boolean(),
  maximized: z.boolean(),
  zIndex: z.number(),
  meta: z.record(z.string(), z.string()).optional(),
});

export const SessionPreferenceOverridesSchema = z.object({
  accentColor: z.string().optional(),         // hex or oklch
  wallpaperId: z.string().optional(),
  terminalFontFamily: z.string().optional(),
  terminalFontSize: z.number().int().min(8).max(32).optional(),
  autoRefreshIntervalSec: z.number().int().min(5).max(600).optional(),
  defaultLaunchAppId: z.string().optional(),
  pinnedAppIds: z.array(z.string()).optional(),
}).strict();

export const PersistedAgentMessageSchema = z.object({
  requestId: z.string(),
  prompt: z.string(),
  status: z.enum(['complete', 'error', 'aborted']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  viewTitle: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const SessionStateSchema = z.object({
  schemaVersion: z.literal(1),
  serverId: z.string(),
  lifecycle: SessionLifecycleSchema,
  lastActiveAt: z.string().datetime(),
  hibernatedAt: z.string().datetime().optional(),

  // Window layout
  windows: z.array(PersistedWindowSchema),
  nextZIndex: z.number(),
  focusedWindowId: z.string().optional(),

  // Preferences
  preferenceOverrides: SessionPreferenceOverridesSchema,

  // Agent history (cap 50 per server, enforced on write)
  agentHistory: z.array(PersistedAgentMessageSchema).max(50),

  // Pinned dynamic-ui views (refs only, content re-fetched)
  pinnedDynamicViewIds: z.array(z.string()),

  // Notification badge state
  unreadNotificationCount: z.number().int().nonnegative(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;
```

**Tests:** `shared/schemas/session.test.ts` — round-trip, version field guard, agent-history cap, strict mode rejects unknown preference keys.

### EX6-A.4: Backend `SessionStore` Service

**Goal:** Authoritative per-server session persistence on disk.
**File:** `server/src/config/session-store.ts`

```ts
class SessionStore extends BaseService {
  async getSession(serverId: string): Promise<SessionState | null>;
  async saveSession(state: SessionState): Promise<void>;
  async listSessions(): Promise<Array<{ serverId: string; lifecycle: SessionLifecycle; lastActiveAt: string }>>;
  async deleteSession(serverId: string): Promise<void>;
  async hibernateAll(): Promise<void>; // called on graceful shutdown
}
```

- Storage: `~/.headlessos/sessions/{serverId}.json` (one file per server)
- Validate with `SessionStateSchema` on read; corrupted files → log + delete + return null (never block startup)
- Atomic writes: write to `.tmp` then rename
- Register in `ServiceContainer` as `'session-store'`

**Tests:** `server/tests/config/session-store.test.ts` — round-trip, list, delete, corrupted-file handling, atomic write, missing dir auto-create.

### EX6-A.5: Backend Session Routes

**Goal:** REST API for session CRUD.
**File:** `server/src/routes/sessions.ts`

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/api/sessions` | — | `Array<SessionSummary>` (lifecycle, lastActiveAt per server) |
| GET | `/api/sessions/:serverId` | — | `SessionState \| 404` |
| PUT | `/api/sessions/:serverId` | `SessionState` | `204` |
| DELETE | `/api/sessions/:serverId` | — | `204` |
| POST | `/api/sessions/:serverId/hibernate` | — | `204` (also disconnects SSH) |

- Fastify schemas validate request bodies via Zod
- `PUT` is upsert; full-state replacement (the client always sends a complete `SessionState`)
- `POST .../hibernate` writes the state then calls `connectionManager.disconnect(serverId)`

**Tests:** `server/tests/routes/sessions.test.ts` — happy path, validation error, 404, hibernate-disconnects-ssh.

### EX6-A.6: Frontend `useSessionsStore`

**Goal:** Hot-tier in-memory store; the heart of the multi-session model.
**File:** `client/src/store/sessions-store.ts`

```ts
interface SessionsState {
  sessions: Map<string, SessionState>;          // keyed by serverId
  activeSessionId: string | null;               // null = Control Center
  loading: boolean;

  // Lifecycle
  loadFromBackend(): Promise<void>;             // app boot
  activate(serverId: string): void;             // make foreground
  background(serverId: string): void;           // demote (when switching away)
  hibernate(serverId: string): Promise<void>;   // flush + disconnect SSH
  wake(serverId: string): Promise<void>;        // reconnect SSH + load state
  terminate(serverId: string): Promise<void>;   // delete session entirely
  hibernateAll(): Promise<void>;                // graceful close hook

  // Mutators (mark dirty, schedule warm-tier flush)
  updateWindows(serverId: string, windows: PersistedWindow[]): void;
  updatePreferences(serverId: string, overrides: Partial<SessionPreferenceOverrides>): void;
  appendAgentMessage(serverId: string, msg: PersistedAgentMessage): void;
}
```

- **Warm-tier flush:** debounced 500ms, writes hot-tier sessions to `localStorage` key `headlessos-sessions-warm` (compressed JSON; size cap 5MB → drop oldest).
- **Cold-tier flush:** on `hibernate()` and `hibernateAll()`, sends `PUT /api/sessions/:serverId`.
- **`beforeunload` hook:** calls `hibernateAll()` synchronously (best-effort with `navigator.sendBeacon`).
- **Boot sequence:**
  1. `loadFromBackend()` calls `GET /api/sessions` → list
  2. For each hibernated session, leave it cold (don't pull full state until wake)
  3. For each `active`/`background` from previous run → mark `hibernated` (server can't have kept SSH alive across restart)
  4. Hot tier starts empty until user wakes a session

**Tests:** `client/tests/store/sessions-store.test.ts` — activate/background/hibernate/wake transitions, warm-tier debounce, agent-history cap enforcement, `beforeunload` flush.

### EX6-A.7: Migrate `useDesktopStore` to Session-Scoped Windows

**Goal:** Windows live inside a session, not in a global list.
**Files:** `client/src/store/window-store.ts`, all consumers.

**Approach (low-risk):**
- Add a `selectActiveSessionWindows()` selector that reads `windows.filter(w => w.serverId === activeSessionId)`.
- New mutators (`openWindow`, `closeWindow`, …) update the corresponding `SessionState.windows` via `useSessionsStore.updateWindows`.
- The `windows: WindowState[]` field stays as a derived view computed from sessions; consumers don't change.
- Single-instance check: per session, not global.

**Tests:** existing window-store tests must still pass; add tests for cross-session isolation (opening window in session A doesn't affect session B).

### EX6-A.8: Migrate Preferences to Layered Model

**Goal:** `usePreferencesStore` returns effective preferences; per-session overrides live in `SessionState`.
**Files:** `client/src/store/preferences-store.ts`

- Add `useEffectivePref<K extends PrefKey>(key: K): PrefValue<K>` hook:
  ```ts
  return overrides[key] ?? globalDefaults[key];
  ```
- For preferences in the **always-global** allowlist (theme, LLM keys, account), ignore overrides.
- Existing consumers of `usePreferencesStore` keep working (they get effective values).
- New action `setOverride(key, value | undefined)` writes to current session's `preferenceOverrides`.

**Tests:** layering precedence, allowlist enforcement, reset-to-default clears override.

### EX6-A.9: Migrate `useClipboardStore` and `useDynamicUIStore` Window-Mappings

**Goal:** Per-server clipboard already exists conceptually — formalize it. Dynamic-UI window→view mapping moves into the session.
**Files:** `client/src/store/clipboard-store.ts`, `client/src/store/dynamic-ui-store.ts`

- Clipboard: keyed by `serverId` (already mostly is) — confirm.
- Dynamic-UI: `pinnedDynamicViewIds: string[]` lives on `SessionState`; the actual view content remains in `useDynamicUIStore` (re-fetchable via existing API).

**Tests:** isolation between sessions.

### EX6-A.10: Backend Graceful Shutdown Hibernates Active Sessions

**Goal:** When the backend exits cleanly, persist any "active" sessions reported by clients.
**File:** `server/src/index.ts` (shutdown hook), `server/src/config/session-store.ts`

- Add `SIGTERM`/`SIGINT` handler that flushes `SessionStore` if it has dirty in-memory state (the backend doesn't itself hold session state — this is a no-op for now, but reserves the hook for future server-driven hibernation).

### EX6-A.11: Tests + CI Green

- All new test files pass
- All existing 2,200+ tests still pass
- No regression in single-server use (because `activeSessionId === only-server`)

---

## Sub-Phase EX6-B: Session Switcher UI

### EX6-B.1: `SessionSwitcher` Component (Hover-Reveal Top Bar)

**Goal:** The Citrix bar.
**File:** `client/src/components/Desktop/SessionSwitcher.tsx`

- 4px invisible trigger zone at very top of viewport
- On hover: slide-down (200ms) bar with one tile per session + a `+` tile
- Tiles are sorted by `lastActiveAt` desc
- Active session tile is highlighted with its accent color
- Sticky-pin button on the right (preference: keep bar always visible)

### EX6-B.2: `SessionTile` with Live Thumbnail + Status

**Goal:** Each tile shows server identity + live status.
**File:** `client/src/components/Desktop/SessionTile.tsx`

- Server name + accent color chip
- Status badge:
  - `connected` (green dot)
  - `background` (white dot)
  - `reconnecting` (amber spinner)
  - `failed` (red dot, click to retry)
  - `hibernated` (zzz icon)
- Live thumbnail: `<canvas>` snapshot of the session's desktop, refreshed every 5s for active sessions, frozen for background, last-known image for hibernated
- "Agent running" pulse indicator if session has an in-flight agent generation

### EX6-B.3: Tile Context Menu (Right-Click)

**File:** `client/src/components/Desktop/SessionTile.tsx`

- Rename
- Change Accent Color (color picker)
- Hibernate (`Ctrl/Cmd+Shift+H`)
- Disconnect (terminate session — with confirm)
- Settings (opens session settings)

### EX6-B.4: Keyboard Shortcuts

**File:** `client/src/hooks/useSessionShortcuts.ts`

- `Ctrl/Cmd + 1..9` → switch to session N (by lastActiveAt order)
- `Ctrl/Cmd + Tab` / `Ctrl/Cmd + Shift + Tab` → cycle sessions
- `Ctrl/Cmd + Shift + H` → hibernate current session
- `Ctrl/Cmd + Shift + Space` → open Control Center

### EX6-B.5: Per-Session Visual Identity

**Goal:** The safety feature.
**Files:** `client/src/components/Desktop/DesktopLayout.tsx`, `Taskbar.tsx`

- 3px accent-colored strip at top of desktop (under switcher)
- Taskbar uses session accent for the active-window indicator
- Window title bars get a subtle accent border (1px)

### EX6-B.6: Multi-Session Connection Coordination

**Goal:** Background sessions stay connected but don't poll aggressively.
**Files:** `server/src/ssh/connection-manager.ts` (no major change), client polling hooks

- Polling hooks (Dashboard auto-refresh, Fleet) check `useSessionsStore.activeSessionId === sessionId`; if not, multiply interval by 4× (e.g., 30s → 120s).
- SSH connections themselves stay open — backend already does this correctly.

### EX6-B.7: Wake-on-Boot Flow

**Goal:** Match the user's "Windows hibernation" mental model.
**Files:** `client/src/components/Login/LockScreen.tsx`, `client/src/store/sessions-store.ts`

- App boot: `loadFromBackend` finds N hibernated sessions
- Show single lock screen (existing)
- On unlock: parallel `wake()` for each previously-active session (status: `background` for all but last-active, which becomes `active`)
- Switcher tiles show reconnect progress; user can interact immediately

### EX6-B.8: Tests + DevTools MCP Verification

- Unit tests for switcher, tile, shortcuts
- Manual verification: connect 3 servers, switch via hover bar, hibernate one, refresh browser, wake, confirm restored
- Chrome DevTools MCP screenshots captured

---

## Sub-Phase EX6-C: Control Center (Relocate Fleet, Restructure Login)

### EX6-C.1: Rename `LoginScreen` → `ControlCenter`, Three-Section Layout

**Files:** `client/src/components/Login/` → `client/src/components/ControlCenter/`

- Three sections: **Sessions** | **Fleet** | **Global Settings**
- Default landing: **Fleet** (unless first-time user with no servers → Sessions)
- Top nav with section tabs

### EX6-C.2: Move Fleet from Desktop App → Control Center Section

**Files:** `client/src/components/Fleet/FleetDashboardView.tsx` (relocate / refactor)

- Embed `FleetDashboardView` inside Control Center "Fleet" section
- Click a server card → `useSessionsStore.activate(serverId)` → close Control Center → land on that session's desktop
- Aggregate LLM cost displayed (already tracked)

### EX6-C.3: Remove Fleet from In-Desktop Registry

**Files:** `client/src/lib/app-registry.ts` (or equivalent), desktop icon constants, start menu, command palette

- Remove `'fleet'` app id from desktop apps
- Add discoverability hint: "Looking for Fleet? It moved to Control Center (`Ctrl/Cmd+Shift+Space`)" — one-time toast on first app load post-upgrade

### EX6-C.4: Sessions Section in Control Center

**File:** `client/src/components/ControlCenter/SessionsView.tsx`

- Cards per server: name, accent color, status, last-used time
- Actions per card: **Resume** (active/background) · **Wake** (hibernated) · **Connect** (terminated/new)
- "+" tile to add a new server (existing AddServerForm reused)

### EX6-C.5: Global Settings Section

**File:** `client/src/components/ControlCenter/GlobalSettingsView.tsx`

- Houses always-global preferences: theme mode, LLM provider/keys, account
- Link out to per-session Settings (opens settings inside that session's desktop with scope toggle)

### EX6-C.6: Entry Points

- App load with no active sessions → Control Center
- Session switcher overflow item: "Show Control Center…"
- Keyboard shortcut: `Ctrl/Cmd + Shift + Space`
- Lock screen → unlock → Control Center (if no previously-active session) OR last-active session

### EX6-C.7: Update Docs

- `docs/ARCHITECTURE.md` — multi-session diagram, Control Center concept
- `docs/CONTEXT.md` — 2-min briefing reflects multi-session model
- `docs/UI_DESIGN.md` — Session Switcher patterns, accent color rules
- `docs/APP_REGISTRY.md` — note that `fleet` app is removed

### EX6-C.8: Branded Loading Spinner Rollout

**Files:** `client/src/components/ui/Spinner.tsx`, existing loading-state views under `client/src/components/`

- Add a reusable HeadlessOS spinner component (Ring-Tick mark) with size and className props.
- Use solid-color spinning treatment (`currentColor`) for readability at small sizes.
- Replace `Loader2` usage in active loading indicators across key UI surfaces (login, dashboard states, server admin states, agent states).

**Verification:**
- Active loading indicators no longer use `Loader2`.
- Client test suite stays green.

---

## Sub-Phase EX6-D: Polish (Defer if Scope Tight)

| Task ID | Task | Notes |
|---------|------|-------|
| EX6-D.1 | Per-session lock | Optional re-auth to wake hibernated session (for prod-DB type servers) |
| EX6-D.2 | Drag-window-between-sessions | Drag a window onto a switcher tile to move it |
| EX6-D.3 | Per-session wallpaper | Override global wallpaper |
| EX6-D.4 | Session export/import | JSON file for backup/sharing |
| EX6-D.5 | Auto-hibernation (opt-in) | Configurable inactivity timeout, default off |
| EX6-D.6 | Agent conversation history UI | Browse/restore past agent sessions per server |
| EX6-D.7 | LLM Observatory persistence + retention | If not already persistent: add `~/.headlessos/observatory/`, 30-day or 10k-trace retention |

---

## Verification Strategy

### Unit Tests
- Lifecycle state transitions (active ↔ background ↔ hibernated)
- `SessionStateSchema` round-trip + version handling
- Preference layering precedence + allowlist
- Warm-tier debounce + size cap
- Agent-history cap enforcement
- Cross-session window isolation

### Integration Tests
- Hibernate session → restart server → wake → state restored
- ≥ 5 concurrent active sessions, isolated state
- Backend graceful shutdown flushes all sessions
- Boot with N hibernated sessions parallel-wakes after unlock

### Manual / DevTools MCP
- Connect 3 servers (Lima VM + 2 mock SSH)
- Verify per-session windows, accent colors, preferences
- Switch via hover bar (mouse + keyboard)
- Hibernate session 2 explicitly
- Close browser, reopen → unlock → all 3 reconnect → land on last-active
- Right-click tile → change accent → confirm visual update everywhere
- Open Control Center → Fleet → click server → lands on that session

### Performance Targets
- Warm-tier flush: < 50ms p95
- Cold-tier wake (read + reconnect SSH): < 500ms + SSH handshake time
- 5+ concurrent active sessions: no UI lag, < 100MB additional memory
- Background polling: ≤ 25% the rate of active sessions

---

## Files: Summary Manifest

**New:**
- `shared/schemas/session.ts`
- `server/src/config/session-store.ts`
- `server/src/routes/sessions.ts`
- `server/tests/config/session-store.test.ts`
- `server/tests/routes/sessions.test.ts`
- `client/src/store/sessions-store.ts`
- `client/src/components/Desktop/SessionSwitcher.tsx`
- `client/src/components/Desktop/SessionTile.tsx`
- `client/src/hooks/useSessionShortcuts.ts`
- `client/src/components/ControlCenter/` (rename of `Login/`)
- `client/src/components/ControlCenter/SessionsView.tsx`
- `client/src/components/ControlCenter/GlobalSettingsView.tsx`
- `client/tests/store/sessions-store.test.ts`
- `client/tests/components/SessionSwitcher.test.tsx`
- `shared/schemas/session.test.ts`

**Modified:**
- `client/src/store/window-store.ts` — windows are derived from active session
- `client/src/store/app-store.ts` — `activeServerId` becomes derived from `useSessionsStore.activeSessionId`; screen routing collapses
- `client/src/store/preferences-store.ts` — layered effective values
- `client/src/store/clipboard-store.ts` — confirm per-server scoping
- `client/src/store/dynamic-ui-store.ts` — pinned view ids move into session
- `client/src/components/Desktop/DesktopLayout.tsx` — render based on `activeSessionId` + accent strip
- `client/src/components/Desktop/Taskbar.tsx` — per-session windows + accent
- `client/src/components/App.tsx` — routing: ControlCenter ↔ Desktop
- `client/src/components/Fleet/FleetDashboardView.tsx` — relocated to ControlCenter
- `server/src/index.ts` — graceful shutdown hibernation hook
- `docs/ARCHITECTURE.md`, `docs/CONTEXT.md`, `docs/UI_DESIGN.md`, `docs/APP_REGISTRY.md`, `docs/PROGRESS.md`, `docs/TRACEABILITY.md`
