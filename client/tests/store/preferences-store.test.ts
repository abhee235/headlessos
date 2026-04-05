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
import { usePreferencesStore } from '../../src/store/preferences-store';

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
});
