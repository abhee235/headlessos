// M2.X: Window Manager Store — manages desktop windows, taskbar, start menu
// @see docs/phases/phase-2.md

import { create } from 'zustand';

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

  // State
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
  zIndex: number;
}

interface DesktopState {
  windows: WindowState[];
  nextZIndex: number;
  startMenuOpen: boolean;

  // Actions
  openWindow: (appId: string, serverId: string, title: string, icon: string) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
  toggleStartMenu: () => void;
  closeStartMenu: () => void;
}

let windowCounter = 0;

// Default sizes for different apps
const APP_DEFAULTS: Record<string, { width: number; height: number }> = {
  dashboard: { width: 900, height: 650 },
  files: { width: 850, height: 600 },
  terminal: { width: 800, height: 500 },
  settings: { width: 860, height: 580 },
  taskmanager: { width: 1000, height: 650 },
};

export const useDesktopStore = create<DesktopState>((set, get) => ({
  windows: [],
  nextZIndex: 100,
  startMenuOpen: false,

  openWindow: (appId, serverId, title, icon) => {
    const state = get();

    // Single-instance apps: focus existing window
    const singleInstance = ['dashboard', 'files', 'terminal', 'settings', 'taskmanager'];
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

    const win: WindowState = {
      id: `win-${windowCounter}`,
      appId,
      serverId,
      title,
      icon,
      x: 120 + offset,
      y: 60 + offset,
      width: defaults.width,
      height: defaults.height,
      minimized: false,
      maximized: false,
      focused: true,
      zIndex: newZ,
    };

    set({
      windows: [
        ...state.windows.map(w => ({ ...w, focused: false })),
        win,
      ],
      nextZIndex: newZ + 1,
      startMenuOpen: false,
    });
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
      return {
        windows: s.windows.map(w =>
          w.id === id
            ? { ...w, minimized: false, maximized: false, focused: true, zIndex: newZ }
            : { ...w, focused: false },
        ),
        nextZIndex: newZ + 1,
      };
    });
  },

  moveWindow: (id, x, y) => {
    set(s => ({
      windows: s.windows.map(w =>
        w.id === id ? { ...w, x, y } : w,
      ),
    }));
  },

  resizeWindow: (id, width, height) => {
    set(s => ({
      windows: s.windows.map(w =>
        w.id === id ? { ...w, width: Math.max(400, width), height: Math.max(300, height) } : w,
      ),
    }));
  },

  toggleStartMenu: () => {
    set(s => ({ startMenuOpen: !s.startMenuOpen }));
  },

  closeStartMenu: () => {
    set({ startMenuOpen: false });
  },
}));
