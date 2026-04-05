// User Preferences Store — persisted to localStorage
// Stores file explorer settings, terminal settings, wallpaper, and other user preferences

import { create } from 'zustand';
import type { ViewMode } from '../components/FileExplorer/ExplorerToolbar';
import { DEFAULT_WALLPAPER_ID } from '../components/Desktop/wallpapers';

export type IconSize = 'medium' | 'large';
export type DesktopIconSize = 'small' | 'medium' | 'large';
export type DesktopSortBy = 'name' | 'type' | 'date';
export type CursorStyle = 'block' | 'underline' | 'bar';

interface UserPreferences {
  /** Default view mode for File Explorer */
  explorerViewMode: ViewMode;
  /** Icon size in grid views: medium = 40px, large = 60px */
  explorerIconSize: IconSize;
  /** Sort field for file explorer */
  explorerSortBy: 'name' | 'size' | 'date' | 'type';
  /** Sort direction */
  explorerSortAsc: boolean;
  /** Active wallpaper ID */
  wallpaperId: string;
  /** Desktop icon size */
  desktopIconSize: DesktopIconSize;
  /** Desktop sort field */
  desktopSortBy: DesktopSortBy;

  // ── Terminal Settings ──────────────────────────────────────────────────────
  /** Terminal font size in px */
  terminalFontSize: number;
  /** Terminal font family */
  terminalFontFamily: string;
  /** Terminal cursor style */
  terminalCursorStyle: CursorStyle;
  /** Terminal scrollback buffer lines (-1 = unlimited) */
  terminalScrollback: number;
  /** Copy text to clipboard on selection */
  terminalCopyOnSelect: boolean;
}

interface PreferencesState extends UserPreferences {
  setExplorerViewMode: (mode: ViewMode) => void;
  setExplorerIconSize: (size: IconSize) => void;
  setExplorerSortBy: (field: UserPreferences['explorerSortBy']) => void;
  setExplorerSortAsc: (asc: boolean) => void;
  setWallpaperId: (id: string) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalFontFamily: (family: string) => void;
  setTerminalCursorStyle: (style: CursorStyle) => void;
  setTerminalScrollback: (lines: number) => void;
  setTerminalCopyOnSelect: (enabled: boolean) => void;
  setDesktopIconSize: (size: DesktopIconSize) => void;
  setDesktopSortBy: (field: DesktopSortBy) => void;
  /** Update multiple preferences at once */
  updatePreferences: (partial: Partial<UserPreferences>) => void;
}

const STORAGE_KEY = 'headlessos-preferences';

const DEFAULTS: UserPreferences = {
  explorerViewMode: 'large-icons',
  explorerIconSize: 'large',
  explorerSortBy: 'name',
  explorerSortAsc: true,
  wallpaperId: DEFAULT_WALLPAPER_ID,
  desktopIconSize: 'large',
  desktopSortBy: 'name',
  terminalFontSize: 14,
  terminalFontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  terminalCursorStyle: 'block',
  terminalScrollback: 5000,
  terminalCopyOnSelect: true,
};

function loadPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function savePreferences(prefs: UserPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be full or blocked — silently ignore
  }
}

export const usePreferencesStore = create<PreferencesState>((set, get) => {
  const initial = loadPreferences();

  return {
    ...initial,

    setExplorerViewMode: (mode) => {
      set({ explorerViewMode: mode });
      savePreferences({ ...get(), explorerViewMode: mode });
    },

    setExplorerIconSize: (size) => {
      set({ explorerIconSize: size });
      savePreferences({ ...get(), explorerIconSize: size });
    },

    setExplorerSortBy: (field) => {
      set({ explorerSortBy: field });
      savePreferences({ ...get(), explorerSortBy: field });
    },

    setExplorerSortAsc: (asc) => {
      set({ explorerSortAsc: asc });
      savePreferences({ ...get(), explorerSortAsc: asc });
    },

    setWallpaperId: (id) => {
      set({ wallpaperId: id });
      savePreferences({ ...get(), wallpaperId: id });
    },

    setTerminalFontSize: (size) => {
      const clamped = Math.max(10, Math.min(24, size));
      set({ terminalFontSize: clamped });
      savePreferences({ ...get(), terminalFontSize: clamped });
    },

    setTerminalFontFamily: (family) => {
      set({ terminalFontFamily: family });
      savePreferences({ ...get(), terminalFontFamily: family });
    },

    setTerminalCursorStyle: (style) => {
      set({ terminalCursorStyle: style });
      savePreferences({ ...get(), terminalCursorStyle: style });
    },

    setTerminalScrollback: (lines) => {
      set({ terminalScrollback: lines });
      savePreferences({ ...get(), terminalScrollback: lines });
    },

    setTerminalCopyOnSelect: (enabled) => {
      set({ terminalCopyOnSelect: enabled });
      savePreferences({ ...get(), terminalCopyOnSelect: enabled });
    },

    setDesktopIconSize: (size) => {
      set({ desktopIconSize: size });
      savePreferences({ ...get(), desktopIconSize: size });
    },

    setDesktopSortBy: (field) => {
      set({ desktopSortBy: field });
      savePreferences({ ...get(), desktopSortBy: field });
    },

    updatePreferences: (partial) => {
      const current = get();
      const updated = { ...current, ...partial };
      set(partial);
      savePreferences({
        explorerViewMode: updated.explorerViewMode,
        explorerIconSize: updated.explorerIconSize,
        explorerSortBy: updated.explorerSortBy,
        explorerSortAsc: updated.explorerSortAsc,
        wallpaperId: updated.wallpaperId,
        terminalFontSize: updated.terminalFontSize,
        terminalFontFamily: updated.terminalFontFamily,
        terminalCursorStyle: updated.terminalCursorStyle,
        terminalScrollback: updated.terminalScrollback,
        terminalCopyOnSelect: updated.terminalCopyOnSelect,
        desktopIconSize: updated.desktopIconSize,
        desktopSortBy: updated.desktopSortBy,
      });
    },
  };
});
