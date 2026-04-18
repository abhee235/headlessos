// EX5-C.3: Saved App Store — Zustand store for user-saved DynamicView apps
// @see docs/phases/phase-ex5.md

import { create } from 'zustand';
import { fetchSavedApps, deleteSavedApp, type SavedApp } from '../lib/api';
import { openDynamicUIWindow } from '../components/DynamicUI/open-dynamic-ui-window';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

export interface SavedAppState {
  /** All saved apps fetched from backend */
  apps: SavedApp[];
  /** Whether the initial fetch is in progress */
  loading: boolean;
  /** Whether apps have been fetched at least once */
  fetched: boolean;
  /** Fetch all saved apps from backend */
  fetchApps: () => Promise<void>;
  /** Delete a saved app */
  removeApp: (id: string) => Promise<void>;
  /** Open a saved app as a desktop DynamicUI window */
  openApp: (app: SavedApp, serverId: string) => void;
}

export const useSavedAppStore = create<SavedAppState>((set, get) => ({
  apps: [],
  loading: false,
  fetched: false,

  fetchApps: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const apps = await fetchSavedApps();
      set({ apps: Array.isArray(apps) ? apps : [], fetched: true });
    } catch {
      // Silently fail — saved apps are optional enhancement
      set({ fetched: true });
    } finally {
      set({ loading: false });
    }
  },

  removeApp: async (id: string) => {
    try {
      await deleteSavedApp(id);
      set({ apps: get().apps.filter((a) => a.id !== id) });
    } catch {
      // Ignore — will refresh on next fetch
    }
  },

  openApp: (app: SavedApp, serverId: string) => {
    const view = app.view as unknown as DynamicView;
    openDynamicUIWindow(serverId, view, app.icon);
  },
}));
