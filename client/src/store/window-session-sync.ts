// EX6-A.7: Window ↔ Session Sync
// @see docs/phases/phase-ex6.md
// @see docs/DECISIONS.md (ADR-021)
//
// Bidirectional sync between the live `useDesktopStore` (UI) and the
// persistent `useSessionsStore` (per-server state on disk).
//
// Why a separate sync layer?
//   - `useDesktopStore` keeps a flat global windows[] array (already
//     serverId-aware). Existing components consume it that way — we don't
//     want to refactor every consumer.
//   - `useSessionsStore` needs per-server window arrays (PersistedWindow[])
//     for hibernation + restore.
//
// Direction OUT (windows → session):
//   - Subscribe to `useDesktopStore.windows`. On change, project to
//     PersistedWindow shape per affected serverId, debounced 250ms.
//
// Direction IN (session → windows):
//   - On `activate(serverId)` / `wake(serverId)`, merge persisted windows
//     for that server into useDesktopStore.windows (without disturbing
//     windows belonging to other servers).
//
// Direction OUT on hibernate:
//   - Persist current windows for that server (already mirrored), then
//     remove them from useDesktopStore.windows so the desktop UI clears.

import { useDesktopStore, type WindowState } from './window-store';
import { useSessionsStore, registerSessionLifecycleHooks } from './sessions-store';
import { useDynamicUIStore } from './dynamic-ui-store';
import type { PersistedWindow } from 'headlessos-shared/schemas/session';

// ── Projection helpers ────────────────────────────────

function toPersisted(w: WindowState): PersistedWindow {
  // Drop ephemeral fields: focused, preSnap, serverId
  return {
    id: w.id,
    appId: w.appId,
    title: w.title,
    icon: w.icon,
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    minimized: w.minimized,
    maximized: w.maximized,
    zIndex: w.zIndex,
    ...(w.meta ? { meta: w.meta } : {}),
  };
}

function fromPersisted(p: PersistedWindow, serverId: string): WindowState {
  return {
    id: p.id,
    appId: p.appId,
    serverId,
    title: p.title,
    icon: p.icon,
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    minimized: p.minimized,
    maximized: p.maximized,
    focused: false, // Restored windows start unfocused
    zIndex: p.zIndex,
    ...(p.meta ? { meta: p.meta } : {}),
  };
}

// ── Window-counter coordination ───────────────────────
//
// useDesktopStore generates IDs as `win-${counter}`. After restoring
// persisted windows (which carry their original IDs), we must bump the
// counter past the highest restored ID to avoid collisions.

function bumpWindowCounter(windows: WindowState[]): void {
  let max = 0;
  for (const w of windows) {
    const m = /^win-(\d+)$/.exec(w.id);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  useDesktopStore.getState().setCounterFloor(max);
}

// ── Sync OUT: windows → session ───────────────────────

let outboundTimer: ReturnType<typeof setTimeout> | null = null;
const OUTBOUND_DEBOUNCE_MS = 250;
let lastSeenWindows: WindowState[] = [];

function scheduleOutboundSync() {
  if (outboundTimer) clearTimeout(outboundTimer);
  outboundTimer = setTimeout(() => {
    outboundTimer = null;
    flushOutboundSync();
  }, OUTBOUND_DEBOUNCE_MS);
}

export function flushOutboundSync(): void {
  if (outboundTimer) {
    clearTimeout(outboundTimer);
    outboundTimer = null;
  }
  const windows = useDesktopStore.getState().windows;
  const sessions = useSessionsStore.getState().sessions;
  const focusedId = windows.find((w) => w.focused)?.id;
  const nextZIndex = useDesktopStore.getState().nextZIndex;

  // Group by serverId
  const byServer = new Map<string, WindowState[]>();
  for (const w of windows) {
    const arr = byServer.get(w.serverId) ?? [];
    arr.push(w);
    byServer.set(w.serverId, arr);
  }

  // For every active session, push its windows (or empty array)
  for (const serverId of Object.keys(sessions)) {
    const wins = byServer.get(serverId) ?? [];
    const persisted = wins.map(toPersisted);
    useSessionsStore.getState().updateSession(serverId, {
      windows: persisted,
      nextZIndex,
      focusedWindowId: wins.some((w) => w.id === focusedId) ? focusedId : undefined,
    });
  }
}

// ── Sync IN: session → windows ────────────────────────

/**
 * Merge a session's persisted windows into useDesktopStore.windows.
 * Windows for OTHER serverIds are preserved untouched.
 * Idempotent — calling twice with the same session is a no-op.
 */
export function restoreWindowsFromSession(serverId: string): void {
  const session = useSessionsStore.getState().sessions[serverId];
  if (!session) return;

  useDesktopStore.setState((state) => {
    // Drop any existing windows for this server (they may be stale)
    const others = state.windows.filter((w) => w.serverId !== serverId);
    const restored = session.windows.map((p) => fromPersisted(p, serverId));
    const merged = [...others, ...restored];

    // Bump counter past restored IDs
    bumpWindowCounter(restored);

    // Pick focus: respect session.focusedWindowId if present and visible
    const focusId = session.focusedWindowId;
    let next = merged;
    if (focusId && restored.some((w) => w.id === focusId)) {
      next = merged.map((w) => ({ ...w, focused: w.id === focusId }));
    }

    // Maintain a high-water-mark zIndex across all sessions
    const maxZ = next.reduce((m, w) => (w.zIndex > m ? w.zIndex : m), state.nextZIndex);

    return {
      windows: next,
      nextZIndex: Math.max(state.nextZIndex, maxZ + 1),
    };
  });

  // Snapshot so the next outbound diff doesn't immediately re-write
  lastSeenWindows = useDesktopStore.getState().windows;
}

/**
 * Remove all windows for a server from useDesktopStore (e.g. after
 * hibernation). The session store still has them persisted.
 */
export function removeWindowsForServer(serverId: string): void {
  useDesktopStore.setState((state) => ({
    windows: state.windows.filter((w) => w.serverId !== serverId),
  }));
  lastSeenWindows = useDesktopStore.getState().windows;
}

/**
 * EX6-D.2: Move a window from its current session to another live or
 * hibernated session. The window is removed from useDesktopStore (which
 * triggers an outbound sync that drops it from the source session) and
 * appended to the target session's persisted windows array.
 *
 * Returns true if the move succeeded; false if the window or target
 * session is missing or the target equals the source.
 */
export function moveWindowToSession(windowId: string, targetServerId: string): boolean {
  const desktop = useDesktopStore.getState();
  const win = desktop.windows.find((w) => w.id === windowId);
  if (!win) return false;
  if (win.serverId === targetServerId) return false;

  const sessionsApi = useSessionsStore.getState();
  const target = sessionsApi.sessions[targetServerId];
  if (!target) {
    // Target session is hibernated — not supported in v1 (would need
    // to load cold tier first). Keep the window where it is.
    return false;
  }

  const persisted = toPersisted(win);

  // Append to target session, ensuring no ID collision (rename if needed)
  const existingIds = new Set(target.windows.map((w) => w.id));
  let newId = persisted.id;
  if (existingIds.has(newId)) {
    newId = `${newId}-${Date.now()}`;
  }
  const movedPersisted = { ...persisted, id: newId };

  sessionsApi.updateSession(targetServerId, {
    windows: [...target.windows, movedPersisted],
    nextZIndex: Math.max(target.nextZIndex, movedPersisted.zIndex + 1),
  });

  // Remove from desktop store. If the source session is the active one,
  // window-session-sync will propagate the removal to its persisted state.
  useDesktopStore.setState((state) => ({
    windows: state.windows.filter((w) => w.id !== windowId),
  }));
  lastSeenWindows = useDesktopStore.getState().windows;
  return true;
}

// ── Bootstrap ─────────────────────────────────────────

let initialized = false;

/**
 * Wire up the subscription. Idempotent — safe to call multiple times.
 * Call once at app boot (e.g. DesktopLayout mount).
 */
export function initWindowSessionSync(): void {
  if (initialized) return;
  initialized = true;

  lastSeenWindows = useDesktopStore.getState().windows;

  useDesktopStore.subscribe((state) => {
    // Only schedule a sync if windows or focus actually changed
    const prev = lastSeenWindows;
    const curr = state.windows;
    if (prev === curr) return;
    lastSeenWindows = curr;
    scheduleOutboundSync();
  });

  registerSessionLifecycleHooks({
    onActivate: (serverId) => restoreWindowsFromSession(serverId),
    onBeforeHibernate: () => flushOutboundSync(),
    onHibernate: (serverId) => {
      removeWindowsForServer(serverId);
      useDynamicUIStore.getState().unpinAllForServer(serverId);
    },
    onTerminate: (serverId) => {
      removeWindowsForServer(serverId);
      useDynamicUIStore.getState().unpinAllForServer(serverId);
    },
  });
}

/** Test-only — reset all module state. */
export function _resetWindowSessionSyncForTests(): void {
  if (outboundTimer) clearTimeout(outboundTimer);
  outboundTimer = null;
  lastSeenWindows = [];
  initialized = false;
}
