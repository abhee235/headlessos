// User Preferences Store — persisted to localStorage
// Stores file explorer settings, terminal settings, wallpaper, and other user preferences

import { create } from 'zustand';
import type { ViewMode } from '../components/FileExplorer/ExplorerToolbar';
import { DEFAULT_WALLPAPER_ID } from '../components/Desktop/wallpapers';
import { LUMEN_ACCENTS, type GlassStrength } from '../lib/lumen-theme';

export type IconSize = 'medium' | 'large';
export type DesktopIconSize = 'small' | 'medium' | 'large';
export type DesktopSortBy = 'name' | 'type' | 'date';
/** EX8.12: where the dock sits — centred along the bottom, or centred on the right edge */
export type DockPosition = 'bottom' | 'right';
/** EX8.16: dock tiles — per-app colour tiles (macOS-style) or the neutral glass plates */
export type DockIconStyle = 'color' | 'glass';
/** EX8.15: city for the HomeHub weather card (Open-Meteo coordinates) */
export interface WeatherLocation { name: string; latitude: number; longitude: number }
export type WeatherUnits = 'celsius' | 'fahrenheit';
export type CursorStyle = 'block' | 'underline' | 'bar';
export type DateFormat = '12h' | '24h';
export type ToastPosition = 'bottom-right' | 'top-right';

/**
 * Per-session tile colours (SessionTile / SessionSwitcher hash into this list).
 * The theme accent is NOT taken from here any more — see `LUMEN_ACCENTS` in
 * `lib/lumen-theme.ts`, which `accentColorIndex` now indexes (EX8.1).
 */
export const ACCENT_PRESETS = [
  { name: 'Blue',   oklchLight: 'oklch(0.488 0.243 264.376)', oklchDark: 'oklch(0.488 0.243 264.376)', oklchFg: 'oklch(0.97 0.014 254.604)' },
  { name: 'Purple', oklchLight: 'oklch(0.541 0.281 293.009)', oklchDark: 'oklch(0.541 0.281 293.009)', oklchFg: 'oklch(0.97 0.014 254.604)' },
  { name: 'Pink',   oklchLight: 'oklch(0.592 0.249 0.584)',   oklchDark: 'oklch(0.592 0.249 0.584)',   oklchFg: 'oklch(0.97 0.014 254.604)' },
  { name: 'Red',    oklchLight: 'oklch(0.577 0.245 27.325)',  oklchDark: 'oklch(0.628 0.258 29.234)',  oklchFg: 'oklch(0.97 0.014 254.604)' },
  { name: 'Orange', oklchLight: 'oklch(0.702 0.209 41.348)',  oklchDark: 'oklch(0.702 0.209 41.348)',  oklchFg: 'oklch(0.97 0.014 254.604)' },
  { name: 'Yellow', oklchLight: 'oklch(0.795 0.184 86.047)',  oklchDark: 'oklch(0.795 0.184 86.047)',  oklchFg: 'oklch(0.21 0.006 285.885)' },
  { name: 'Green',  oklchLight: 'oklch(0.696 0.17 162.48)',   oklchDark: 'oklch(0.696 0.17 162.48)',   oklchFg: 'oklch(0.97 0.014 254.604)' },
  { name: 'Teal',   oklchLight: 'oklch(0.627 0.14 178.547)',  oklchDark: 'oklch(0.627 0.14 178.547)',  oklchFg: 'oklch(0.97 0.014 254.604)' },
] as const;

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
  /** EX8.12: dock placement (only the dock moves; its panels open where they always do) */
  dockPosition: DockPosition;
  dockIconStyle: DockIconStyle;
  /** EX8.15: HomeHub weather city (null = not set) and units */
  weatherLocation: WeatherLocation | null;
  weatherUnits: WeatherUnits;
  /** EX8.15: display level 0–100 — 50 is the normal look, below dims, above brightens — and the warm night-light tint */
  displayLevel: number;
  nightLight: boolean;
  /** EX8.17: minutes without input before the Home hub covers the desktop (0 = off) */
  idleGlanceMinutes: number;

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

  // ── Appearance (M7.4, EX8.1) ──────────────────────────────────────────────
  /** Theme accent index into LUMEN_ACCENTS (0 = match wallpaper) */
  accentColorIndex: number;
  /** Glass opacity/blur preset */
  glassStrength: GlassStrength;
  /** Translucent glass; false = near-opaque surfaces, no blur */
  transparency: boolean;

  // ── General (M7.5) ────────────────────────────────────────────────────────
  /** Auto-refresh interval in seconds (0 = off) */
  autoRefreshInterval: number;
  /** Clock display format */
  dateFormat: DateFormat;

  // ── Notifications & Data (M7.6) ───────────────────────────────────────────
  /** Show toast notifications */
  showToasts: boolean;
  /** Toast notification position */
  toastPosition: ToastPosition;
  // ── Auto-hibernation (EX6-D.5) ─────────────────────────────────────
  /** Auto-hibernate inactive sessions after N minutes (0 = disabled). Default: off. */
  autoHibernateMinutes: number;
  // ── Recently Used (M9.2) ──────────────────────────────────────────────────
  /** Recently opened app IDs with timestamps */
  recentApps: Array<{ appId: string; timestamp: number }>;

  // ── Pinned Apps (M9.3) ────────────────────────────────────────────────────
  /** Pinned app IDs in taskbar */
  pinnedAppIds: string[];

  // ── Onboarding (M9.12) ────────────────────────────────────────────────────
  /** Whether the user has seen the first-run onboarding */
  hasSeenOnboarding: boolean;
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
  setDockPosition: (position: DockPosition) => void;
  setDockIconStyle: (style: DockIconStyle) => void;
  setWeatherLocation: (location: WeatherLocation | null) => void;
  setWeatherUnits: (units: WeatherUnits) => void;
  setDisplayLevel: (level: number) => void;
  setNightLight: (on: boolean) => void;
  setIdleGlanceMinutes: (minutes: number) => void;
  setAccentColorIndex: (index: number) => void;
  setGlassStrength: (strength: GlassStrength) => void;
  setTransparency: (enabled: boolean) => void;
  setAutoRefreshInterval: (seconds: number) => void;
  setDateFormat: (format: DateFormat) => void;
  setShowToasts: (show: boolean) => void;
  setToastPosition: (position: ToastPosition) => void;
  setAutoHibernateMinutes: (minutes: number) => void;
  recordAppUsage: (appId: string) => void;
  pinApp: (appId: string) => void;
  unpinApp: (appId: string) => void;
  markOnboardingSeen: () => void;
  resetAllPreferences: () => void;
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
  dockPosition: 'bottom',
  dockIconStyle: 'color',
  weatherLocation: null,
  weatherUnits: 'celsius',
  displayLevel: 50,
  nightLight: false,
  // Settings → General → Sessions → Privacy Screen
  idleGlanceMinutes: 5,
  // EX8.6: LumenOS terminal type — Geist Mono 13px (bundled via @fontsource)
  terminalFontSize: 13,
  terminalFontFamily: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace",
  terminalCursorStyle: 'block',
  terminalScrollback: 5000,
  terminalCopyOnSelect: true,
  accentColorIndex: 0,
  glassStrength: 'heavy',
  transparency: true,
  autoRefreshInterval: 30,
  dateFormat: '12h',
  showToasts: true,
  toastPosition: 'bottom-right',
  autoHibernateMinutes: 0,
  recentApps: [],
  pinnedAppIds: ['dashboard', 'files', 'terminal', 'docker', 'taskmanager', 'settings'],
  hasSeenOnboarding: false,
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

  // Accent, glass and transparency are applied as <html> data attributes by
  // useLumenAppearance(), which also knows the effective wallpaper.
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

    setDockPosition: (position) => {
      set({ dockPosition: position });
      savePreferences({ ...get(), dockPosition: position });
    },

    setDockIconStyle: (style) => {
      set({ dockIconStyle: style });
      savePreferences({ ...get(), dockIconStyle: style });
    },

    setWeatherLocation: (location) => {
      set({ weatherLocation: location });
      savePreferences({ ...get(), weatherLocation: location });
    },

    setWeatherUnits: (units) => {
      set({ weatherUnits: units });
      savePreferences({ ...get(), weatherUnits: units });
    },

    setDisplayLevel: (level) => {
      const clamped = Math.max(0, Math.min(100, Math.round(level)));
      set({ displayLevel: clamped });
      savePreferences({ ...get(), displayLevel: clamped });
    },

    setNightLight: (on) => {
      set({ nightLight: on });
      savePreferences({ ...get(), nightLight: on });
    },

    setIdleGlanceMinutes: (minutes) => {
      const safe = Math.max(0, Math.floor(minutes));
      set({ idleGlanceMinutes: safe });
      savePreferences({ ...get(), idleGlanceMinutes: safe });
    },

    setDesktopSortBy: (field) => {
      set({ desktopSortBy: field });
      savePreferences({ ...get(), desktopSortBy: field });
    },

    setAccentColorIndex: (index) => {
      const clamped = Math.max(0, Math.min(LUMEN_ACCENTS.length - 1, index));
      set({ accentColorIndex: clamped });
      savePreferences({ ...get(), accentColorIndex: clamped });
    },

    setGlassStrength: (strength) => {
      set({ glassStrength: strength });
      savePreferences({ ...get(), glassStrength: strength });
    },

    setTransparency: (enabled) => {
      set({ transparency: enabled });
      savePreferences({ ...get(), transparency: enabled });
    },

    setAutoRefreshInterval: (seconds) => {
      set({ autoRefreshInterval: seconds });
      savePreferences({ ...get(), autoRefreshInterval: seconds });
    },

    setDateFormat: (format) => {
      set({ dateFormat: format });
      savePreferences({ ...get(), dateFormat: format });
    },

    setShowToasts: (show) => {
      set({ showToasts: show });
      savePreferences({ ...get(), showToasts: show });
    },

    setToastPosition: (position) => {
      set({ toastPosition: position });
      savePreferences({ ...get(), toastPosition: position });
    },

    setAutoHibernateMinutes: (minutes) => {
      const safe = Math.max(0, Math.floor(minutes));
      set({ autoHibernateMinutes: safe });
      savePreferences({ ...get(), autoHibernateMinutes: safe });
    },

    recordAppUsage: (appId) => {
      const current = get();
      const filtered = current.recentApps.filter(r => r.appId !== appId);
      const updated = [{ appId, timestamp: Date.now() }, ...filtered].slice(0, 8);
      set({ recentApps: updated });
      savePreferences({ ...get(), recentApps: updated });
    },

    pinApp: (appId) => {
      const current = get();
      if (current.pinnedAppIds.includes(appId)) return;
      const updated = [...current.pinnedAppIds, appId];
      set({ pinnedAppIds: updated });
      savePreferences({ ...get(), pinnedAppIds: updated });
    },

    unpinApp: (appId) => {
      const current = get();
      const updated = current.pinnedAppIds.filter(id => id !== appId);
      set({ pinnedAppIds: updated });
      savePreferences({ ...get(), pinnedAppIds: updated });
    },

    markOnboardingSeen: () => {
      set({ hasSeenOnboarding: true });
      savePreferences({ ...get(), hasSeenOnboarding: true });
    },

    resetAllPreferences: () => {
      set(DEFAULTS);
      savePreferences(DEFAULTS);
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
        dockPosition: updated.dockPosition,
        dockIconStyle: updated.dockIconStyle,
        weatherLocation: updated.weatherLocation,
        weatherUnits: updated.weatherUnits,
        displayLevel: updated.displayLevel,
        nightLight: updated.nightLight,
        idleGlanceMinutes: updated.idleGlanceMinutes,
        accentColorIndex: updated.accentColorIndex,
        glassStrength: updated.glassStrength,
        transparency: updated.transparency,
        autoRefreshInterval: updated.autoRefreshInterval,
        dateFormat: updated.dateFormat,
        showToasts: updated.showToasts,
        toastPosition: updated.toastPosition,
        autoHibernateMinutes: updated.autoHibernateMinutes,
        recentApps: updated.recentApps,
        pinnedAppIds: updated.pinnedAppIds,
        hasSeenOnboarding: updated.hasSeenOnboarding,
      });
    },
  };
});
