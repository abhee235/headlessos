// EX6-B (bridge): Sync legacy `useAppStore.activeServerId` → `useSessionsStore.activate()`
// @see docs/phases/phase-ex6.md
//
// The legacy app-store is the source of truth for SSH connection lifecycle.
// The new sessions-store tracks per-server desktop state. This module
// subscribes to app-store changes and keeps sessions-store in sync.
//
// Direction:
//   useAppStore.activeServerId  →  useSessionsStore.activate(id)
//   useAppStore.activeServerId === null → useSessionsStore.activeServerId = null
//
// Also seeds session summaries on first sync so the SessionSwitcher has data.

import { useAppStore } from './app-store';
import { useSessionsStore } from './sessions-store';

let initialized = false;
let lastActiveId: string | null = null;

export function initAppSessionBridge(): void {
  if (initialized) return;
  initialized = true;

  // Seed once
  void useSessionsStore.getState().loadAll();

  // Bridge active server changes
  useAppStore.subscribe((state) => {
    const id = state.activeServerId;
    if (id === lastActiveId) return;
    lastActiveId = id;

    if (id) {
      void useSessionsStore.getState().activate(id);
    } else {
      useSessionsStore.setState({ activeServerId: null });
    }
  });

  // beforeunload — flush warm-tier + send keepalive cold-tier writes
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      try {
        useSessionsStore.getState().flushAll();
      } catch {
        // best-effort
      }
    });
  }
}

export function _resetAppSessionBridgeForTests(): void {
  initialized = false;
  lastActiveId = null;
}
