// M6.7: File Clipboard Store — manages cut/copy/paste state for file operations
// @see docs/phases/phase-6.md

import { create } from 'zustand';

export interface ClipboardEntry {
  /** Server the file belongs to */
  serverId: string;
  /** Full path to the file/directory */
  path: string;
  /** File name */
  name: string;
  /** Whether it's a directory */
  isDirectory: boolean;
}

export type ClipboardOperation = 'copy' | 'cut';

interface ClipboardState {
  /** Files currently in clipboard */
  entries: ClipboardEntry[];
  /** Whether it's a copy or cut operation */
  operation: ClipboardOperation | null;
  /** Source directory where the copy/cut happened */
  sourceDir: string | null;

  // Actions
  copy: (entries: ClipboardEntry[], sourceDir: string) => void;
  cut: (entries: ClipboardEntry[], sourceDir: string) => void;
  clear: () => void;
  hasEntries: () => boolean;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  entries: [],
  operation: null,
  sourceDir: null,

  copy: (entries, sourceDir) => {
    set({ entries, operation: 'copy', sourceDir });
  },

  cut: (entries, sourceDir) => {
    set({ entries, operation: 'cut', sourceDir });
  },

  clear: () => {
    set({ entries: [], operation: null, sourceDir: null });
  },

  hasEntries: () => get().entries.length > 0,
}));
