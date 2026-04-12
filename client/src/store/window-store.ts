// M2.X: Window Manager Store — manages desktop windows, taskbar, start menu
// @see docs/phases/phase-2.md

import { create } from 'zustand';
import { usePreferencesStore } from './preferences-store';

export type SnapZone = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'maximize' | null;

export interface WindowState {
  id: string;
  appId: string;
  serverId: string;
  title: string;
  icon: string;

  // Position & size
  x: number;
  y: number;
  width: number;
  height: number;

  // Pre-snap position/size for restore
  preSnap?: { x: number; y: number; width: number; height: number };

  // State
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
  zIndex: number;

  // Optional metadata for the app (e.g. initialPath for file explorer)
  meta?: Record<string, string>;
}

interface DesktopState {
  windows: WindowState[];
  nextZIndex: number;
  startMenuOpen: boolean;
  snapPreview: SnapZone;

  // Actions
  openWindow: (appId: string, serverId: string, title: string, icon: string, meta?: Record<string, string>) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
  snapWindow: (id: string, zone: SnapZone) => void;
  setSnapPreview: (zone: SnapZone) => void;
  toggleStartMenu: () => void;
  closeStartMenu: () => void;
  toggleShowDesktop: () => void;
}

let windowCounter = 0;

// Default sizes for different apps
const APP_DEFAULTS: Record<string, { width: number; height: number }> = {
  dashboard: { width: 900, height: 650 },
  files: { width: 850, height: 600 },
  terminal: { width: 800, height: 500 },
  settings: { width: 860, height: 580 },
  taskmanager: { width: 1000, height: 650 },
  docker: { width: 950, height: 600 },
  services: { width: 900, height: 600 },
  serveradmin: { width: 1000, height: 650 },
  'dynamic-ui': { width: 900, height: 650 },
  observatory: { width: 1100, height: 700 },
};

export const useDesktopStore = create<DesktopState>((set, get) => ({
  windows: [],
  nextZIndex: 100,
  startMenuOpen: false,
  snapPreview: null,

  openWindow: (appId, serverId, title, icon, meta) => {
    const state = get();

    // Single-instance apps: focus existing window
    const singleInstance = ['dashboard', 'files', 'terminal', 'settings', 'taskmanager', 'docker', 'services', 'serveradmin', 'observatory'];
    if (singleInstance.includes(appId)) {
      const existing = state.windows.find(
        w => w.appId === appId && w.serverId === serverId,
      );
      if (existing) {
        get().focusWindow(existing.id);
        if (existing.minimized) get().restoreWindow(existing.id);
        return;
      }
    }

    windowCounter++;
    const defaults = APP_DEFAULTS[appId] ?? { width: 800, height: 550 };
    // Cascade new windows
    const offset = (windowCounter % 8) * 32;
    const newZ = state.nextZIndex;

    // Clamp initial position & size to viewport
    const taskbarH = 56;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight - taskbarH;
    const winW = Math.min(defaults.width, screenW - 40);
    const winH = Math.min(defaults.height, screenH - 40);
    const winX = Math.min(120 + offset, screenW - winW - 20);
    const winY = Math.min(60 + offset, screenH - 80);

    const win: WindowState = {
      id: `win-${windowCounter}`,
      appId,
      serverId,
      title,
      icon,
      x: Math.max(0, winX),
      y: Math.max(0, winY),
      width: winW,
      height: winH,
      minimized: false,
      maximized: false,
      focused: true,
      zIndex: newZ,
      ...(meta ? { meta } : {}),
    };

    set({
      windows: [
        ...state.windows.map(w => ({ ...w, focused: false })),
        win,
      ],
      nextZIndex: newZ + 1,
      startMenuOpen: false,
    });

    // Track recently used apps (M9.2)
    usePreferencesStore.getState().recordAppUsage(appId);
  },

  closeWindow: (id) => {
    set(s => {
      const remaining = s.windows.filter(w => w.id !== id);
      // Focus the topmost remaining window
      if (remaining.length > 0) {
        const topWindow = remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
        return {
          windows: remaining.map(w => ({ ...w, focused: w.id === topWindow.id })),
        };
      }
      return { windows: remaining };
    });
  },

  focusWindow: (id) => {
    set(s => {
      const newZ = s.nextZIndex;
      return {
        windows: s.windows.map(w =>
          w.id === id
            ? { ...w, focused: true, zIndex: newZ }
            : { ...w, focused: false },
        ),
        nextZIndex: newZ + 1,
      };
    });
  },

  minimizeWindow: (id) => {
    set(s => {
      const windows = s.windows.map(w =>
        w.id === id ? { ...w, minimized: true, focused: false } : w,
      );
      // Focus next visible window
      const visible = windows.filter(w => !w.minimized);
      if (visible.length > 0) {
        const topVisible = visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
        return {
          windows: windows.map(w => ({ ...w, focused: w.id === topVisible.id })),
        };
      }
      return { windows };
    });
  },

  maximizeWindow: (id) => {
    set(s => ({
      windows: s.windows.map(w =>
        w.id === id ? { ...w, maximized: true } : w,
      ),
    }));
  },

  restoreWindow: (id) => {
    set(s => {
      const newZ = s.nextZIndex;
      const taskbarH = 56;
      const screenW = window.innerWidth;
      const screenH = window.innerHeight - taskbarH;
      const TITLE_BAR_H = 40;
      const MIN_VISIBLE_X = 100;

      return {
        windows: s.windows.map(w => {
          if (w.id !== id) return { ...w, focused: false };
          const restored = w.preSnap ?? { x: w.x, y: w.y, width: w.width, height: w.height };
          // Clamp restored position to current viewport
          const clampedX = Math.min(
            Math.max(restored.x, -(restored.width - MIN_VISIBLE_X)),
            screenW - MIN_VISIBLE_X,
          );
          const clampedY = Math.min(
            Math.max(restored.y, 0),
            screenH - TITLE_BAR_H,
          );
          return {
            ...w,
            x: clampedX,
            y: clampedY,
            width: Math.min(restored.width, screenW),
            height: Math.min(restored.height, screenH),
            preSnap: undefined,
            minimized: false,
            maximized: false,
            focused: true,
            zIndex: newZ,
          };
        }),
        nextZIndex: newZ + 1,
      };
    });
  },

  moveWindow: (id, x, y) => {
    // Clamp position so the window title bar is always reachable
    const taskbarH = 56;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight - taskbarH;
    const TITLE_BAR_H = 40;
    const MIN_VISIBLE_X = 100; // at least 100px visible horizontally

    set(s => ({
      windows: s.windows.map(w => {
        if (w.id !== id) return w;
        // Horizontal: keep at least MIN_VISIBLE_X px of the window visible
        const clampedX = Math.min(
          Math.max(x, -(w.width - MIN_VISIBLE_X)),
          screenW - MIN_VISIBLE_X,
        );
        // Vertical: top can't go above 0, bottom of title bar must stay in viewport
        const clampedY = Math.min(
          Math.max(y, 0),
          screenH - TITLE_BAR_H,
        );
        return { ...w, x: clampedX, y: clampedY };
      }),
    }));
  },

  resizeWindow: (id, width, height) => {
    const taskbarH = 56;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight - taskbarH;
    set(s => ({
      windows: s.windows.map(w => {
        if (w.id !== id) return w;
        // Clamp: min 400x300, max to fill viewport from current position
        const clampedW = Math.min(Math.max(400, width), screenW - w.x);
        const clampedH = Math.min(Math.max(300, height), screenH - w.y);
        return { ...w, width: clampedW, height: clampedH };
      }),
    }));
  },

  snapWindow: (id, zone) => {
    if (!zone) return;
    const taskbarH = 56;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight - taskbarH;

    set(s => ({
      snapPreview: null,
      windows: s.windows.map(w => {
        if (w.id !== id) return w;
        // Save pre-snap dimensions (only if not already snapped/maximized)
        const preSnap = w.preSnap ?? { x: w.x, y: w.y, width: w.width, height: w.height };

        switch (zone) {
          case 'maximize':
            return { ...w, preSnap, maximized: true };
          case 'left':
            return { ...w, preSnap, maximized: false, x: 0, y: 0, width: Math.round(screenW / 2), height: screenH };
          case 'right':
            return { ...w, preSnap, maximized: false, x: Math.round(screenW / 2), y: 0, width: Math.round(screenW / 2), height: screenH };
          case 'top-left':
            return { ...w, preSnap, maximized: false, x: 0, y: 0, width: Math.round(screenW / 2), height: Math.round(screenH / 2) };
          case 'top-right':
            return { ...w, preSnap, maximized: false, x: Math.round(screenW / 2), y: 0, width: Math.round(screenW / 2), height: Math.round(screenH / 2) };
          case 'bottom-left':
            return { ...w, preSnap, maximized: false, x: 0, y: Math.round(screenH / 2), width: Math.round(screenW / 2), height: Math.round(screenH / 2) };
          case 'bottom-right':
            return { ...w, preSnap, maximized: false, x: Math.round(screenW / 2), y: Math.round(screenH / 2), width: Math.round(screenW / 2), height: Math.round(screenH / 2) };
          default:
            return w;
        }
      }),
    }));
  },

  setSnapPreview: (zone) => {
    set({ snapPreview: zone });
  },

  toggleStartMenu: () => {
    set(s => ({ startMenuOpen: !s.startMenuOpen }));
  },

  closeStartMenu: () => {
    set({ startMenuOpen: false });
  },

  toggleShowDesktop: () => {
    set(s => {
      const visible = s.windows.filter(w => !w.minimized);
      if (visible.length > 0) {
        // Minimize all visible windows
        return {
          windows: s.windows.map(w => w.minimized ? w : { ...w, minimized: true, focused: false }),
        };
      } else {
        // Restore all minimized windows
        return {
          windows: s.windows.map(w => ({ ...w, minimized: false })),
        };
      }
    });
  },
}));
