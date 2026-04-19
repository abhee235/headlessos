// EX5-C.3: Saved App Store + App Launcher Integration Tests
// @see docs/phases/phase-ex5.md — EX5-C.3

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSavedAppStore } from '../../src/store/saved-app-store';
import * as api from '../../src/lib/api';
import type { SavedApp } from '../../src/lib/api';

// ── Mock the DynamicUI window opener ──
vi.mock('../../src/components/DynamicUI/open-dynamic-ui-window', () => ({
  openDynamicUIWindow: vi.fn(),
}));

// ── Fixtures ──

function makeSavedApp(overrides?: Partial<SavedApp>): SavedApp {
  return {
    id: 'test-app-1',
    name: 'Docker Dashboard',
    icon: 'Container',
    cliTool: 'docker',
    description: 'Monitor Docker containers',
    tags: ['docker', 'monitoring'],
    view: { title: 'Docker Dashboard', sidebarItems: [], sections: {} },
    commandPatterns: ['docker ps'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ──

describe('useSavedAppStore (EX5-C.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset store state
    useSavedAppStore.setState({
      apps: [],
      loading: false,
      fetched: false,
    });
  });

  describe('initial state', () => {
    it('starts with empty apps array', () => {
      const state = useSavedAppStore.getState();
      expect(state.apps).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.fetched).toBe(false);
    });
  });

  describe('fetchApps', () => {
    it('fetches apps from API and stores them', async () => {
      const apps = [makeSavedApp(), makeSavedApp({ id: 'test-app-2', name: 'Nginx Status' })];
      vi.spyOn(api, 'fetchSavedApps').mockResolvedValue(apps);

      await useSavedAppStore.getState().fetchApps();

      const state = useSavedAppStore.getState();
      expect(state.apps).toHaveLength(2);
      expect(state.apps[0].name).toBe('Docker Dashboard');
      expect(state.apps[1].name).toBe('Nginx Status');
      expect(state.fetched).toBe(true);
      expect(state.loading).toBe(false);
    });

    it('sets fetched to true even on error', async () => {
      vi.spyOn(api, 'fetchSavedApps').mockRejectedValue(new Error('Network'));

      await useSavedAppStore.getState().fetchApps();

      const state = useSavedAppStore.getState();
      expect(state.fetched).toBe(true);
      expect(state.apps).toEqual([]);
    });

    it('does not fetch if already loading', async () => {
      useSavedAppStore.setState({ loading: true });
      const spy = vi.spyOn(api, 'fetchSavedApps').mockResolvedValue([]);

      await useSavedAppStore.getState().fetchApps();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('removeApp', () => {
    it('removes an app from state after API call', async () => {
      const apps = [makeSavedApp(), makeSavedApp({ id: 'test-app-2', name: 'Other' })];
      useSavedAppStore.setState({ apps });
      vi.spyOn(api, 'deleteSavedApp').mockResolvedValue(undefined);

      await useSavedAppStore.getState().removeApp('test-app-1');

      const state = useSavedAppStore.getState();
      expect(state.apps).toHaveLength(1);
      expect(state.apps[0].id).toBe('test-app-2');
    });

    it('calls deleteSavedApp API', async () => {
      useSavedAppStore.setState({ apps: [makeSavedApp()] });
      const spy = vi.spyOn(api, 'deleteSavedApp').mockResolvedValue(undefined);

      await useSavedAppStore.getState().removeApp('test-app-1');

      expect(spy).toHaveBeenCalledWith('test-app-1');
    });

    it('does not crash on API error', async () => {
      useSavedAppStore.setState({ apps: [makeSavedApp()] });
      vi.spyOn(api, 'deleteSavedApp').mockRejectedValue(new Error('fail'));

      // Should not throw
      await useSavedAppStore.getState().removeApp('test-app-1');

      // App remains since deletion failed silently
      expect(useSavedAppStore.getState().apps).toHaveLength(1);
    });
  });

  describe('openApp', () => {
    it('calls openDynamicUIWindow with correct args', async () => {
      const { openDynamicUIWindow } = await import(
        '../../src/components/DynamicUI/open-dynamic-ui-window'
      );
      const app = makeSavedApp();

      useSavedAppStore.getState().openApp(app, 'server-1');

      expect(openDynamicUIWindow).toHaveBeenCalledWith(
        'server-1',
        app.view,
        'Container',
      );
    });
  });
});
