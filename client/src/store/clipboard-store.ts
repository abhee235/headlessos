// M6.7 + EX6-A.9: File Clipboard Store — per-session facade
// @see docs/phases/phase-6.md
// @see docs/phases/phase-ex6.md (made session-scoped)
//
// Backwards-compatible API: keeps `entries` / `operation` / `sourceDir` /
// `copy` / `cut` / `clear` / `hasEntries`. Storage now lives inside
// `useSessionsStore.sessions[activeServerId].clipboard`, so each server
// has its own clipboard (Citrix-style isolation).

import { create } from 'zustand';
import { useSessionsStore } from './sessions-store';
import {
  EMPTY_CLIPBOARD,
  type ClipboardEntry,
  type SessionClipboard,
} from 'headlessos-shared/schemas/session';

export type { ClipboardEntry } from 'headlessos-shared/schemas/session';
export type ClipboardOperation = 'copy' | 'cut';

interface ClipboardState {
  entries: ClipboardEntry[];
  operation: ClipboardOperation | null;
  sourceDir: string | null;

  copy: (entries: ClipboardEntry[], sourceDir: string) => void;
  cut: (entries: ClipboardEntry[], sourceDir: string) => void;
  clear: () => void;
  hasEntries: () => boolean;
}

function readActiveClipboard(): SessionClipboard {
  const s = useSessionsStore.getState();
  if (!s.activeServerId) return EMPTY_CLIPBOARD;
  const session = s.sessions[s.activeServerId];
  return session?.clipboard ?? EMPTY_CLIPBOARD;
}

function writeActiveClipboard(next: SessionClipboard): void {
  const s = useSessionsStore.getState();
  if (!s.activeServerId) return;
  s.updateSession(s.activeServerId, { clipboard: next });
}

export const useClipboardStore = create<ClipboardState>((set, get) => {
  const initial = readActiveClipboard();

  // Subscribe to session changes — push active session's clipboard into this store.
  // Runs in both browser and jsdom (test) environments.
  useSessionsStore.subscribe((state, prev) => {
    const activeChanged = state.activeServerId !== prev.activeServerId;
    let clipChanged = false;
    if (state.activeServerId) {
      const a = state.sessions[state.activeServerId]?.clipboard;
      const b = prev.sessions[state.activeServerId]?.clipboard;
      clipChanged = a !== b;
    }
    if (activeChanged || clipChanged) {
      const next = readActiveClipboard();
      const cur = get();
      if (
        cur.entries !== next.entries ||
        cur.operation !== next.operation ||
        cur.sourceDir !== next.sourceDir
      ) {
        set({
          entries: next.entries,
          operation: next.operation,
          sourceDir: next.sourceDir,
        });
      }
    }
  });

  return {
    entries: initial.entries,
    operation: initial.operation,
    sourceDir: initial.sourceDir,

    copy: (entries, sourceDir) => {
      writeActiveClipboard({ entries, operation: 'copy', sourceDir });
      set({ entries, operation: 'copy', sourceDir });
    },

    cut: (entries, sourceDir) => {
      writeActiveClipboard({ entries, operation: 'cut', sourceDir });
      set({ entries, operation: 'cut', sourceDir });
    },

    clear: () => {
      writeActiveClipboard({ ...EMPTY_CLIPBOARD });
      set({ entries: [], operation: null, sourceDir: null });
    },

    hasEntries: () => get().entries.length > 0,
  };
});
