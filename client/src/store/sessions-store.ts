// EX6-A.6: Sessions Store — Zustand store managing per-server desktop sessions
// @see docs/phases/phase-ex6.md
// @see docs/DECISIONS.md (ADR-020, ADR-021)
//
// Three-tier storage architecture:
//   Hot  (this store, in-memory)        — instant switching of `activeServerId`
//   Warm (localStorage, debounced 500ms) — survives page reload
//   Cold (`PUT /api/sessions/:id`)        — survives full backend restart, hibernation
//
// Lifecycle: active → background → hibernated → wake → active

import { create } from 'zustand';
import {
  createEmptySessionState,
  trimAgentHistory,
  type SessionState,
  type SessionLifecycle,
  type SessionSummary,
} from 'headlessos-shared/schemas/session';
import * as api from '../lib/api';

// ── Constants ─────────────────────────────────────────

const WARM_STORAGE_KEY = 'headlessos-sessions';
const WARM_DEBOUNCE_MS = 500;
const COLD_DEBOUNCE_MS = 2000; // Backend writes batched at 2s

// ── Lifecycle hooks (registered by window-session-sync) ──

type LifecycleHook = (serverId: string) => void;
let onActivateHook: LifecycleHook = () => {};
let onHibernateHook: LifecycleHook = () => {};
let onTerminateHook: LifecycleHook = () => {};
let onBeforeHibernateHook: LifecycleHook = () => {};

/**
 * Register lifecycle hooks. Used by window-session-sync to merge
 * persisted windows into useDesktopStore on activate/wake and to drop
 * them on hibernate/terminate. Call once at app boot.
 */
export function registerSessionLifecycleHooks(hooks: {
  onActivate?: LifecycleHook;
  onBeforeHibernate?: LifecycleHook;
  onHibernate?: LifecycleHook;
  onTerminate?: LifecycleHook;
}): void {
  if (hooks.onActivate) onActivateHook = hooks.onActivate;
  if (hooks.onBeforeHibernate) onBeforeHibernateHook = hooks.onBeforeHibernate;
  if (hooks.onHibernate) onHibernateHook = hooks.onHibernate;
  if (hooks.onTerminate) onTerminateHook = hooks.onTerminate;
}

/** Test-only: reset hooks to no-ops. */
export function _resetSessionLifecycleHooksForTests(): void {
  onActivateHook = () => {};
  onBeforeHibernateHook = () => {};
  onHibernateHook = () => {};
  onTerminateHook = () => {};
  activationGuard = async () => true;
}

// ── EX6-D.1: Activation guard (per-session lock) ────────────────
//
// When a session has `lockOnHibernate: true` and is being woken from
// the hibernated state, the registered guard is consulted first. The
// guard returns true to proceed with the wake or false to abort. The
// default no-op guard always allows. Register a real one (e.g. that
// shows a ConfirmDialog) at app boot.

type ActivationGuard = (serverId: string) => Promise<boolean> | boolean;
let activationGuard: ActivationGuard = async () => true;

export function registerActivationGuard(guard: ActivationGuard): void {
  activationGuard = guard;
}

// ── State shape ───────────────────────────────────────

interface SessionsState {
  /** Live in-memory sessions, keyed by serverId. Only contains non-hibernated sessions. */
  sessions: Record<string, SessionState>;
  /** Lightweight summaries of ALL sessions (including hibernated), from backend listSessions. */
  summaries: SessionSummary[];
  /** Currently focused session's serverId, or null when at the Control Center / no active server. */
  activeServerId: string | null;

  // ── Lifecycle actions ───────────────────────────────

  /**
   * Bring a session into the foreground. Loads from cold storage if not yet
   * in memory (i.e. the user just woke a hibernated session).
   * Returns the session state for the active server.
   */
  activate: (serverId: string) => Promise<SessionState>;

  /** Move a session to the background (still in memory, just not focused). */
  background: (serverId: string) => void;

  /**
   * Hibernate: flush state to cold storage, drop from memory, ask backend
   * to disconnect the SSH connection.
   */
  hibernate: (serverId: string) => Promise<void>;

  /** Hibernate all currently active/background sessions (e.g. on app close). */
  hibernateAll: () => Promise<void>;

  /**
   * Wake a hibernated session — load state from cold storage into memory.
   * Caller is responsible for triggering SSH reconnection (auth flow).
   */
  wake: (serverId: string) => Promise<SessionState>;

  /** Permanently delete a session (cold storage + memory + summaries). */
  terminate: (serverId: string) => Promise<void>;

  // ── State mutation (used by other stores via subscriptions) ─

  /** Patch an in-memory session. Triggers warm + cold debounced flush. */
  updateSession: (serverId: string, patch: Partial<SessionState>) => void;

  /** Replace the entire in-memory session for serverId. */
  setSession: (state: SessionState) => void;

  // ── Bootstrap / cleanup ─────────────────────────────

  /** Load summaries from backend + warm-tier sessions from localStorage. */
  loadAll: () => Promise<void>;

  /**
   * Synchronous flush — used in `beforeunload` handler. Writes warm tier
   * immediately and fires keepalive requests to cold tier.
   */
  flushAll: () => void;
}

// ── Warm tier (localStorage) ───────────────────────────

function loadWarm(): Record<string, SessionState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(WARM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SessionState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveWarm(sessions: Record<string, SessionState>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WARM_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage full / blocked — silently ignore
  }
}

// ── Debouncers (shared, per-serverId) ──────────────────

const warmTimers = new Map<string, ReturnType<typeof setTimeout>>();
const coldTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleWarmFlush(getAll: () => Record<string, SessionState>) {
  const key = '__all__';
  const existing = warmTimers.get(key);
  if (existing) clearTimeout(existing);
  warmTimers.set(
    key,
    setTimeout(() => {
      saveWarm(getAll());
      warmTimers.delete(key);
    }, WARM_DEBOUNCE_MS),
  );
}

function scheduleColdFlush(serverId: string, getState: () => SessionState | undefined) {
  const existing = coldTimers.get(serverId);
  if (existing) clearTimeout(existing);
  coldTimers.set(
    serverId,
    setTimeout(async () => {
      coldTimers.delete(serverId);
      const state = getState();
      if (!state) return;
      try {
        await api.saveSession(state);
      } catch (err) {
        // Cold tier failures are non-fatal — warm tier still has the data
        console.warn(`[sessions-store] cold flush failed for ${serverId}:`, err);
      }
    }, COLD_DEBOUNCE_MS),
  );
}

// ── Store ──────────────────────────────────────────────

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: {},
  summaries: [],
  activeServerId: null,

  // ── Lifecycle ───────────────────────────────────────

  activate: async (serverId: string) => {
    let session = get().sessions[serverId];
    if (!session) {
      // EX6-D.1: Per-session lock — ask the registered guard before waking
      const summary = get().summaries.find((s) => s.serverId === serverId);
      if (summary?.lockOnHibernate) {
        const allowed = await activationGuard(serverId);
        if (!allowed) {
          throw new Error('Activation cancelled by guard');
        }
      }
      // Try cold storage (user just woke a hibernated session)
      session = await get().wake(serverId);
    } else if (session.lifecycle !== 'active') {
      session = { ...session, lifecycle: 'active', lastActiveAt: new Date().toISOString() };
      get().setSession(session);
    }
    set({ activeServerId: serverId });
    onActivateHook(serverId);
    return session;
  },

  background: (serverId: string) => {
    const session = get().sessions[serverId];
    if (!session) return;
    if (session.lifecycle === 'background') return;
    get().setSession({ ...session, lifecycle: 'background' });
  },

  hibernate: async (serverId: string) => {
    // Give the sync layer a chance to flush any pending writes
    onBeforeHibernateHook(serverId);
    const session = get().sessions[serverId];
    if (session) {
      // Flush latest state to cold tier first (synchronous-ish)
      const hibernated: SessionState = {
        ...session,
        lifecycle: 'hibernated',
        hibernatedAt: new Date().toISOString(),
      };
      try {
        await api.saveSession(hibernated);
      } catch (err) {
        console.warn(`[sessions-store] hibernate save failed for ${serverId}:`, err);
      }
    }
    // Ask backend to disconnect SSH + mark hibernated (idempotent)
    try {
      await api.hibernateSession(serverId);
    } catch (err) {
      console.warn(`[sessions-store] hibernate API failed for ${serverId}:`, err);
    }
    // Drop from memory; refresh summaries
    set((s) => {
      const next = { ...s.sessions };
      delete next[serverId];
      const newActive = s.activeServerId === serverId ? null : s.activeServerId;
      return { sessions: next, activeServerId: newActive };
    });
    onHibernateHook(serverId);
    // Update warm tier and reload summaries
    saveWarm(get().sessions);
    await get().loadAll();
  },

  hibernateAll: async () => {
    const ids = Object.keys(get().sessions);
    await Promise.all(ids.map((id) => get().hibernate(id)));
  },

  wake: async (serverId: string) => {
    // Try warm tier first (faster, includes uncommitted changes)
    const warm = loadWarm()[serverId];
    let state: SessionState | null = warm ?? null;

    // Fallback to cold tier
    if (!state) {
      state = await api.fetchSession(serverId);
    }

    // Brand new session
    if (!state) {
      state = createEmptySessionState(serverId);
    }

    const woken: SessionState = {
      ...state,
      lifecycle: 'active',
      lastActiveAt: new Date().toISOString(),
      hibernatedAt: undefined,
    };
    get().setSession(woken);
    return woken;
  },

  terminate: async (serverId: string) => {
    try {
      await api.deleteSession(serverId);
    } catch (err) {
      console.warn(`[sessions-store] terminate API failed for ${serverId}:`, err);
    }
    set((s) => {
      const next = { ...s.sessions };
      delete next[serverId];
      return {
        sessions: next,
        activeServerId: s.activeServerId === serverId ? null : s.activeServerId,
        summaries: s.summaries.filter((x) => x.serverId !== serverId),
      };
    });
    onTerminateHook(serverId);
    saveWarm(get().sessions);
  },

  // ── Mutation ───────────────────────────────────────

  updateSession: (serverId: string, patch: Partial<SessionState>) => {
    const current = get().sessions[serverId];
    if (!current) return;
    const next: SessionState = {
      ...current,
      ...patch,
      // Always enforce agent-history cap
      agentHistory: patch.agentHistory
        ? trimAgentHistory(patch.agentHistory)
        : current.agentHistory,
      // Bump lastActiveAt for any mutation while active
      lastActiveAt: current.lifecycle === 'active' ? new Date().toISOString() : current.lastActiveAt,
    };
    set((s) => ({ sessions: { ...s.sessions, [serverId]: next } }));
    scheduleWarmFlush(() => get().sessions);
    scheduleColdFlush(serverId, () => get().sessions[serverId]);
  },

  setSession: (state: SessionState) => {
    const safe: SessionState = {
      ...state,
      agentHistory: trimAgentHistory(state.agentHistory),
    };
    set((s) => ({ sessions: { ...s.sessions, [state.serverId]: safe } }));
    scheduleWarmFlush(() => get().sessions);
    scheduleColdFlush(state.serverId, () => get().sessions[state.serverId]);
  },

  // ── Bootstrap ───────────────────────────────────────

  loadAll: async () => {
    // Load warm tier into memory immediately so UI is responsive
    const warm = loadWarm();
    set({ sessions: warm });

    // Refresh summaries from backend (authoritative list)
    try {
      const summaries = await api.fetchSessions();
      set({ summaries });
    } catch (err) {
      console.warn('[sessions-store] failed to load summaries:', err);
    }
  },

  flushAll: () => {
    // Cancel pending debouncers, write warm + fire cold via keepalive
    for (const t of warmTimers.values()) clearTimeout(t);
    warmTimers.clear();
    for (const t of coldTimers.values()) clearTimeout(t);
    coldTimers.clear();

    const sessions = get().sessions;
    saveWarm(sessions);

    if (typeof window !== 'undefined') {
      for (const state of Object.values(sessions)) {
        // Best-effort keepalive; ignore promise (page is unloading)
        try {
          api.saveSessionBeacon(state);
        } catch {
          // ignore
        }
      }
    }
  },
}));

// ── Browser bootstrap ──────────────────────────────────
// Wire up `beforeunload` once, lazily, to flush on tab close.

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    useSessionsStore.getState().flushAll();
  });
}
