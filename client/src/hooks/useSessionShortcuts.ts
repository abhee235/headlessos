// EX6-B.4: Session keyboard shortcuts
// @see docs/phases/phase-ex6.md
//
// Shortcuts:
//   Ctrl/Cmd + 1..9               → switch to session N (by lastActiveAt order)
//   Ctrl/Cmd + Tab                → next session
//   Ctrl/Cmd + Shift + Tab        → previous session
//   Ctrl/Cmd + Shift + H          → hibernate active session
//   Ctrl/Cmd + Shift + Space      → open Control Center (no-op until C lands)

import { useEffect } from 'react';
import { useAppStore } from '../store/app-store';
import { useSessionsStore } from '../store/sessions-store';

export function useSessionShortcuts(): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) return;

      // Build ordered server list (sessions take precedence; fall back to app-store)
      const sessionsState = useSessionsStore.getState();
      const summaries = sessionsState.summaries;
      const orderedIds: string[] = summaries.length
        ? summaries.map((s) => s.serverId)
        : useAppStore.getState().servers.map((s) => s.id);
      const activeId = sessionsState.activeServerId ?? useAppStore.getState().activeServerId;

      // Ctrl/Cmd + 1..9 — switch to session N
      if (!e.shiftKey && !e.altKey && /^Digit[1-9]$/.test(e.code)) {
        const index = parseInt(e.code.slice(5), 10) - 1;
        const target = orderedIds[index];
        if (target && target !== activeId) {
          e.preventDefault();
          useAppStore.getState().setActiveServer(target);
        }
        return;
      }

      // Ctrl/Cmd + Tab / Shift+Tab — cycle
      if (e.key === 'Tab' && orderedIds.length > 1) {
        e.preventDefault();
        const idx = activeId ? orderedIds.indexOf(activeId) : -1;
        const dir = e.shiftKey ? -1 : 1;
        const next = orderedIds[(idx + dir + orderedIds.length) % orderedIds.length]!;
        if (next !== activeId) {
          useAppStore.getState().setActiveServer(next);
        }
        return;
      }

      // Ctrl/Cmd + Shift + H — hibernate active
      if (e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        if (!activeId) return;
        e.preventDefault();
        void useSessionsStore.getState().hibernate(activeId);
        return;
      }

      // EX6-C.6: Ctrl/Cmd + Shift + Space — open Control Center
      if (e.shiftKey && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        useAppStore.getState().goToLogin();
        return;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
