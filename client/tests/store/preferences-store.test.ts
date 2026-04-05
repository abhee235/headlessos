// Unit tests for preferences store — persistence, defaults, and state management
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing the store
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
  clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
  get length() { return Object.keys(storage).length; },
  key: vi.fn((_index: number) => null),
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

const STORAGE_KEY = 'headlessos-preferences';

// Import after localStorage is mocked
import { usePreferencesStore, ACCENT_PRESETS } from '../../src/store/preferences-store';

describe('preferences-store', () => {
  beforeEach(() => {
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.clearAllMocks();
    // Reset store to defaults
    usePreferencesStore.setState({
      explorerViewMode: 'large-icons',
      explorerIconSize: 'large',
      explorerSortBy: 'name',
      explorerSortAsc: true,
      wallpaperId: 'builtin:celestial',
      accentColorIndex: 0,
      autoRefreshInterval: 30,
      dateFormat: '12h',
      showToasts: true,
      toastPosition: 'bottom-right',
      desktopIconSize: 'large',
    });
  });

  describe('defaults', () => {
    it('has large-icons as default view mode', () => {
      const state = usePreferencesStore.getState();
      expect(state.explorerViewMode).toBe('large-icons');
    });

    it('has large as default icon size', () => {
      const state = usePreferencesStore.getState();
      expect(state.explorerIconSize).toBe('large');
    });

    it('has name as default sort field', () => {
      const state = usePreferencesStore.getState();
      expect(state.explorerSortBy).toBe('name');
    });

    it('sorts ascending by default', () => {
      const state = usePreferencesStore.getState();
      expect(state.explorerSortAsc).toBe(true);
    });

    it('has builtin:celestial as default wallpaper', () => {
      const state = usePreferencesStore.getState();
      expect(state.wallpaperId).toBe('builtin:celestial');
    });
  });

  describe('setters', () => {
    it('updates view mode and persists to localStorage', () => {
      usePreferencesStore.getState().setExplorerViewMode('details');
      expect(usePreferencesStore.getState().explorerViewMode).toBe('details');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"explorerViewMode":"details"'),
      );
    });

    it('updates icon size and persists to localStorage', () => {
      usePreferencesStore.getState().setExplorerIconSize('medium');
      expect(usePreferencesStore.getState().explorerIconSize).toBe('medium');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"explorerIconSize":"medium"'),
      );
    });

    it('updates sort by and persists to localStorage', () => {
      usePreferencesStore.getState().setExplorerSortBy('size');
      expect(usePreferencesStore.getState().explorerSortBy).toBe('size');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"explorerSortBy":"size"'),
      );
    });

    it('toggles sort ascending and persists to localStorage', () => {
      usePreferencesStore.getState().setExplorerSortAsc(false);
      expect(usePreferencesStore.getState().explorerSortAsc).toBe(false);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"explorerSortAsc":false'),
      );
    });

    it('updates wallpaper ID and persists to localStorage', () => {
      usePreferencesStore.getState().setWallpaperId('aurora');
      expect(usePreferencesStore.getState().wallpaperId).toBe('aurora');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"wallpaperId":"aurora"'),
      );
    });
  });

  describe('updatePreferences', () => {
    it('updates multiple preferences at once', () => {
      usePreferencesStore.getState().updatePreferences({
        explorerViewMode: 'list',
        explorerIconSize: 'medium',
      });

      const state = usePreferencesStore.getState();
      expect(state.explorerViewMode).toBe('list');
      expect(state.explorerIconSize).toBe('medium');
    });

    it('persists batch update to localStorage', () => {
      usePreferencesStore.getState().updatePreferences({
        explorerViewMode: 'details',
        explorerSortAsc: false,
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"explorerViewMode":"details"'),
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"explorerSortAsc":false'),
      );
    });
  });

  describe('persistence round-trip', () => {
    it('saves and retrieves preferences via localStorage', () => {
      // Set some values — these call savePreferences internally
      usePreferencesStore.getState().setExplorerViewMode('details');
      usePreferencesStore.getState().setExplorerIconSize('medium');

      // Verify the stored JSON
      const stored = JSON.parse(storage[STORAGE_KEY]);
      expect(stored.explorerViewMode).toBe('details');
      expect(stored.explorerIconSize).toBe('medium');
    });
  });

  // ─── M7.4: Appearance preferences ────────────────────────────────────────

  describe('accent color (M7.4)', () => {
    it('defaults to index 0 (Blue)', () => {
      const state = usePreferencesStore.getState();
      expect(state.accentColorIndex).toBe(0);
    });

    it('updates accent color index and persists', () => {
      usePreferencesStore.getState().setAccentColorIndex(3);
      expect(usePreferencesStore.getState().accentColorIndex).toBe(3);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"accentColorIndex":3'),
      );
    });

    it('ACCENT_PRESETS has 8 entries with required fields', () => {
      expect(ACCENT_PRESETS).toHaveLength(8);
      for (const preset of ACCENT_PRESETS) {
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('oklchLight');
        expect(preset).toHaveProperty('oklchDark');
        expect(preset).toHaveProperty('oklchFg');
      }
    });

    it('defaults desktop icon size to large', () => {
      const state = usePreferencesStore.getState();
      expect(state.desktopIconSize).toBe('large');
    });

    it('updates desktop icon size', () => {
      usePreferencesStore.getState().setDesktopIconSize('large');
      expect(usePreferencesStore.getState().desktopIconSize).toBe('large');
    });
  });

  // ─── M7.5: General preferences ───────────────────────────────────────────

  describe('general settings (M7.5)', () => {
    it('defaults auto-refresh interval to 30', () => {
      const state = usePreferencesStore.getState();
      expect(state.autoRefreshInterval).toBe(30);
    });

    it('updates auto-refresh interval and persists', () => {
      usePreferencesStore.getState().setAutoRefreshInterval(60);
      expect(usePreferencesStore.getState().autoRefreshInterval).toBe(60);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"autoRefreshInterval":60'),
      );
    });

    it('can set auto-refresh to 0 (off)', () => {
      usePreferencesStore.getState().setAutoRefreshInterval(0);
      expect(usePreferencesStore.getState().autoRefreshInterval).toBe(0);
    });

    it('defaults date format to 12h', () => {
      const state = usePreferencesStore.getState();
      expect(state.dateFormat).toBe('12h');
    });

    it('updates date format and persists', () => {
      usePreferencesStore.getState().setDateFormat('24h');
      expect(usePreferencesStore.getState().dateFormat).toBe('24h');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"dateFormat":"24h"'),
      );
    });
  });

  // ─── M7.6: Notifications & Data ──────────────────────────────────────────

  describe('notifications & data (M7.6)', () => {
    it('defaults showToasts to true', () => {
      const state = usePreferencesStore.getState();
      expect(state.showToasts).toBe(true);
    });

    it('toggles showToasts and persists', () => {
      usePreferencesStore.getState().setShowToasts(false);
      expect(usePreferencesStore.getState().showToasts).toBe(false);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"showToasts":false'),
      );
    });

    it('defaults toastPosition to bottom-right', () => {
      const state = usePreferencesStore.getState();
      expect(state.toastPosition).toBe('bottom-right');
    });

    it('updates toast position and persists', () => {
      usePreferencesStore.getState().setToastPosition('top-right');
      expect(usePreferencesStore.getState().toastPosition).toBe('top-right');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"toastPosition":"top-right"'),
      );
    });

    it('resetAllPreferences restores every field to defaults', () => {
      // Modify several fields
      usePreferencesStore.getState().setAccentColorIndex(5);
      usePreferencesStore.getState().setAutoRefreshInterval(120);
      usePreferencesStore.getState().setDateFormat('24h');
      usePreferencesStore.getState().setShowToasts(false);
      usePreferencesStore.getState().setToastPosition('top-right');
      usePreferencesStore.getState().setDesktopIconSize('large');
      usePreferencesStore.getState().setExplorerViewMode('details');

      // Reset
      usePreferencesStore.getState().resetAllPreferences();

      const state = usePreferencesStore.getState();
      expect(state.accentColorIndex).toBe(0);
      expect(state.autoRefreshInterval).toBe(30);
      expect(state.dateFormat).toBe('12h');
      expect(state.showToasts).toBe(true);
      expect(state.toastPosition).toBe('bottom-right');
      expect(state.desktopIconSize).toBe('large');
      expect(state.explorerViewMode).toBe('large-icons');
    });
  });
});
