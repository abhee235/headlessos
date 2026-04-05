// User Preferences Store — persisted to localStorage
// Stores file explorer settings, icon sizes, wallpaper, and other user preferences

import { create } from 'zustand';
import type { ViewMode } from '../components/FileExplorer/ExplorerToolbar';
import { DEFAULT_WALLPAPER_ID } from '../components/Desktop/wallpapers';

export type IconSize = 'medium' | 'large';

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
}

interface PreferencesState extends UserPreferences {
  setExplorerViewMode: (mode: ViewMode) => void;
  setExplorerIconSize: (size: IconSize) => void;
  setExplorerSortBy: (field: UserPreferences['explorerSortBy']) => void;
  setExplorerSortAsc: (asc: boolean) => void;
  setWallpaperId: (id: string) => void;
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
      });
    },
  };
});
