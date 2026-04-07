// EX1.13: Dynamic UI Store — manages pinned dynamic views for desktop windows
// @see docs/phases/phase-ex1.md

import { create } from 'zustand';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

export interface PinnedView {
  /** Unique ID for this pinned view */
  id: string;
  /** Server it was generated for */
  serverId: string;
  /** Display title */
  title: string;
  /** Lucide icon name */
  icon: string;
  /** The full view JSON */
  view: DynamicView;
  /** When it was pinned */
  pinnedAt: number;
}

interface DynamicUIState {
  /** Pinned views keyed by ID */
  pinnedViews: Record<string, PinnedView>;
  /** Mapping from window ID to pinned view ID */
  windowToView: Record<string, string>;

  /** Pin a dynamic view (returns the pinned view ID) */
  pinView: (serverId: string, view: DynamicView, icon?: string) => string;
  /** Unpin a view by ID */
  unpinView: (id: string) => void;
  /** Associate a window ID with a pinned view ID */
  linkWindow: (windowId: string, viewId: string) => void;
  /** Get view data for a window */
  getViewForWindow: (windowId: string) => PinnedView | undefined;
  /** Clean up window mapping when window closes */
  unlinkWindow: (windowId: string) => void;
  /** Load pinned views from favorites API */
  loadFromFavorites: (favorites: Array<{ id: string; label: string; view: DynamicView }>) => void;
}

let viewCounter = 0;

export const useDynamicUIStore = create<DynamicUIState>((set, get) => ({
  pinnedViews: {},
  windowToView: {},

  pinView: (serverId, view, icon) => {
    viewCounter++;
    const id = `dyn-${Date.now()}-${viewCounter}`;
    const pinned: PinnedView = {
      id,
      serverId,
      title: view.title,
      icon: icon ?? view.icon ?? 'Sparkles',
      view,
      pinnedAt: Date.now(),
    };

    set(state => ({
      pinnedViews: { ...state.pinnedViews, [id]: pinned },
    }));

    return id;
  },

  unpinView: (id) => {
    set(state => {
      const { [id]: _, ...rest } = state.pinnedViews;
      // Also clean up any window links
      const windowToView = { ...state.windowToView };
      for (const [winId, viewId] of Object.entries(windowToView)) {
        if (viewId === id) delete windowToView[winId];
      }
      return { pinnedViews: rest, windowToView };
    });
  },

  linkWindow: (windowId, viewId) => {
    set(state => ({
      windowToView: { ...state.windowToView, [windowId]: viewId },
    }));
  },

  getViewForWindow: (windowId) => {
    const state = get();
    const viewId = state.windowToView[windowId];
    if (!viewId) return undefined;
    return state.pinnedViews[viewId];
  },

  unlinkWindow: (windowId) => {
    set(state => {
      const { [windowId]: _, ...rest } = state.windowToView;
      return { windowToView: rest };
    });
  },

  loadFromFavorites: (favorites) => {
    const pinnedViews: Record<string, PinnedView> = {};
    for (const fav of favorites) {
      pinnedViews[fav.id] = {
        id: fav.id,
        serverId: '', // favorites are server-agnostic in current design
        title: fav.label,
        icon: fav.view.icon ?? 'Sparkles',
        view: fav.view,
        pinnedAt: Date.now(),
      };
    }
    set({ pinnedViews });
  },
}));
