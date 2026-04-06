// M6.4: Theme Store — light/dark theme management with localStorage persistence
// @see docs/phases/phase-6.md

import { create } from 'zustand';
import { ACCENT_PRESETS } from './preferences-store';

export type Theme = 'dark' | 'light' | 'auto';

interface ThemeState {
  theme: Theme;
  /** The resolved (effective) theme — 'dark' or 'light' */
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'headlessos-theme';

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'auto') return getSystemTheme();
  return theme;
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  return 'dark';
}

function applyTheme(resolved: 'dark' | 'light') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  // Re-apply accent color when theme changes (light/dark may differ)
  try {
    const raw = localStorage.getItem('headlessos-preferences');
    if (raw) {
      const prefs = JSON.parse(raw);
      const idx = typeof prefs.accentColorIndex === 'number' ? prefs.accentColorIndex : 0;
      const preset = ACCENT_PRESETS[idx] ?? ACCENT_PRESETS[0];
      root.style.setProperty('--primary', resolved === 'dark' ? preset.oklchDark : preset.oklchLight);
      root.style.setProperty('--primary-foreground', preset.oklchFg);
      root.style.setProperty('--sidebar-primary', resolved === 'dark' ? preset.oklchDark : preset.oklchLight);
      root.style.setProperty('--ring', resolved === 'dark' ? preset.oklchDark : preset.oklchLight);
    }
  } catch {
    // Ignore — accent color will be applied by preference store init
  }
}

export const useThemeStore = create<ThemeState>((set) => {
  // Apply initial theme on load
  const initial = getInitialTheme();
  const resolved = resolveTheme(initial);
  if (typeof document !== 'undefined') {
    applyTheme(resolved);
  }

  // Listen for system theme changes when using 'auto'
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const currentTheme = localStorage.getItem(STORAGE_KEY);
      if (currentTheme === 'auto') {
        const newResolved = getSystemTheme();
        applyTheme(newResolved);
        set({ resolvedTheme: newResolved });
      }
    });
  }

  return {
    theme: initial,
    resolvedTheme: resolved,
    setTheme: (theme) => {
      const resolved = resolveTheme(theme);
      applyTheme(resolved);
      localStorage.setItem(STORAGE_KEY, theme);
      set({ theme, resolvedTheme: resolved });
    },
    toggleTheme: () => {
      set((state) => {
        const next = state.resolvedTheme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY, next);
        return { theme: next, resolvedTheme: next };
      });
    },
  };
});
