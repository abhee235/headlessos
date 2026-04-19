// EX2.12: Agent Session Store (Zustand)
// @see docs/phases/phase-ex2.md — EX2.12
//
// Client-side state management for UI Agent sessions.
// Each session tracks events, status, final view, and meta.

import { create } from 'zustand';
import type { AgentEventType, AgentMetaType } from '../components/Agent/AgentPanel';
import { useSessionsStore } from './sessions-store';
import { trimAgentHistory, type PersistedAgentMessage } from 'headlessos-shared/schemas/session';

// ── EX6-D.6: Persist completed agent runs into session.agentHistory ────
function persistAgentRun(
  serverId: string,
  requestId: string,
  prompt: string,
  startedAtMs: number,
  status: PersistedAgentMessage['status'],
  extras: Partial<PersistedAgentMessage>,
): void {
  const sessions = useSessionsStore.getState();
  const session = sessions.sessions[serverId];
  if (!session) return;
  const entry: PersistedAgentMessage = {
    requestId,
    prompt,
    status,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date().toISOString(),
    ...extras,
  };
  const next = trimAgentHistory([...session.agentHistory, entry]);
  sessions.updateSession(serverId, { agentHistory: next });
}

// ── Types ──

export type AgentSessionStatus = 'running' | 'complete' | 'error' | 'aborted';

export interface AgentSession {
  /** Unique request/session ID */
  requestId: string;
  /** Server this session is for */
  serverId: string;
  /** User prompt that started the session */
  prompt: string;
  /** Ordered timeline of events */
  events: Array<{ id: number; event: AgentEventType; timestamp: number }>;
  /** Current session status */
  status: AgentSessionStatus;
  /** Progressive partial view (updated live during generation) */
  partialView: Record<string, unknown> | null;
  /** Final generated view (set on 'complete') */
  view: unknown | null;
  /** Session metadata (set on 'complete') */
  meta: AgentMetaType | null;
  /** Error message if status is 'error' */
  errorMessage: string | null;
  /** When the session started */
  startedAt: number;
}

// ── Store Interface ──

interface AgentStoreState {
  /** All sessions keyed by requestId */
  sessions: Map<string, AgentSession>;

  // Actions
  addSession: (requestId: string, serverId: string, prompt: string) => void;
  addEvent: (requestId: string, event: AgentEventType) => void;
  updatePartialView: (requestId: string, view: Record<string, unknown>) => void;
  completeSession: (requestId: string, view: unknown, meta: AgentMetaType) => void;
  errorSession: (requestId: string, message: string) => void;
  abortSession: (requestId: string) => void;
  removeSession: (requestId: string) => void;
  clearSessions: () => void;
  getSession: (requestId: string) => AgentSession | undefined;
  getServerSessions: (serverId: string) => AgentSession[];
}

// ── Event counter per session (outside store for simplicity) ──
const eventCounters = new Map<string, number>();

// ── Store ──

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  sessions: new Map(),

  addSession: (requestId, serverId, prompt) => {
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.set(requestId, {
        requestId,
        serverId,
        prompt,
        events: [],
        status: 'running',
        partialView: null,
        view: null,
        meta: null,
        errorMessage: null,
        startedAt: Date.now(),
      });
      eventCounters.set(requestId, 0);
      return { sessions };
    });
  },

  addEvent: (requestId, event) => {
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(requestId);
      if (!session) return state;

      const counter = (eventCounters.get(requestId) ?? 0) + 1;
      eventCounters.set(requestId, counter);

      sessions.set(requestId, {
        ...session,
        events: [
          ...session.events,
          { id: counter, event, timestamp: Date.now() },
        ],
      });
      return { sessions };
    });
  },

  updatePartialView: (requestId, view) => {
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(requestId);
      if (!session) return state;

      sessions.set(requestId, {
        ...session,
        partialView: view,
      });
      return { sessions };
    });
  },

  completeSession: (requestId, view, meta) => {
    let captured: { serverId: string; prompt: string; startedAt: number } | null = null;
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(requestId);
      if (!session) return state;
      captured = { serverId: session.serverId, prompt: session.prompt, startedAt: session.startedAt };
      sessions.set(requestId, { ...session, status: 'complete', view, meta });
      return { sessions };
    });
    if (captured) {
      const { serverId, prompt, startedAt } = captured;
      const viewTitle = (view as { title?: string } | null)?.title;
      persistAgentRun(serverId, requestId, prompt, startedAt, 'complete', {
        viewTitle: typeof viewTitle === 'string' ? viewTitle : undefined,
        meta: meta
          ? {
              latencyMs: typeof meta.latencyMs === 'number' ? meta.latencyMs : undefined,
              stepsCompleted:
                typeof meta.stepsCompleted === 'number' ? meta.stepsCompleted : undefined,
              reflectionLoops:
                typeof meta.reflectionLoops === 'number' ? meta.reflectionLoops : undefined,
            }
          : undefined,
      });
    }
  },

  errorSession: (requestId, message) => {
    let captured: { serverId: string; prompt: string; startedAt: number } | null = null;
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(requestId);
      if (!session) return state;
      captured = { serverId: session.serverId, prompt: session.prompt, startedAt: session.startedAt };
      sessions.set(requestId, { ...session, status: 'error', errorMessage: message });
      return { sessions };
    });
    if (captured) {
      const { serverId, prompt, startedAt } = captured;
      persistAgentRun(serverId, requestId, prompt, startedAt, 'error', { errorMessage: message });
    }
  },

  abortSession: (requestId) => {
    let captured: { serverId: string; prompt: string; startedAt: number } | null = null;
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(requestId);
      if (!session) return state;
      captured = { serverId: session.serverId, prompt: session.prompt, startedAt: session.startedAt };
      sessions.set(requestId, { ...session, status: 'aborted' });
      return { sessions };
    });
    if (captured) {
      const { serverId, prompt, startedAt } = captured;
      persistAgentRun(serverId, requestId, prompt, startedAt, 'aborted', {});
    }
  },

  removeSession: (requestId) => {
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.delete(requestId);
      eventCounters.delete(requestId);
      return { sessions };
    });
  },

  clearSessions: () => {
    eventCounters.clear();
    set({ sessions: new Map() });
  },

  getSession: (requestId) => {
    return get().sessions.get(requestId);
  },

  getServerSessions: (serverId) => {
    const all = get().sessions;
    const result: AgentSession[] = [];
    for (const s of all.values()) {
      if (s.serverId === serverId) result.push(s);
    }
    return result;
  },
}));
