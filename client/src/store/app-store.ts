// M1.8: Application State Store (Zustand)
// @see docs/phases/phase-1.md

import { create } from 'zustand';
import type { ServerConfig, ConnectionState, AppDefinition } from 'headlessos-shared';
import type { ServerWithState } from '../lib/api';
import * as api from '../lib/api';

// ── Tab ─────────────────────────────────────────────────

export interface Tab {
  id: string;
  appId: string;
  serverId: string;
  title: string;
}

// ── Screen State (M6.11 Login Flow) ────────────────────

export type AppScreen = 'lock' | 'login' | 'desktop';

// ── Store ───────────────────────────────────────────────

interface AppState {
  // Screen
  screen: AppScreen;
  loginError: string | null;

  // Servers
  servers: ServerWithState[];
  activeServerId: string | null;
  loadingServers: boolean;
  /** EX8.28: why the last load of the server list failed (null after a good load) */
  serversError: string | null;

  // Tabs
  tabs: Tab[];
  activeTabId: string | null;

  // Terminal
  terminalVisible: boolean;

  // Actions — screen
  unlockScreen: () => void;
  goToLogin: () => void;
  goToDesktop: () => void;
  lockScreen: () => void;
  switchUser: () => Promise<void>;
  signOut: () => Promise<void>;
  setLoginError: (error: string | null) => void;

  // Actions — servers
  fetchServers: () => Promise<void>;
  addServer: (config: Omit<ServerConfig, 'id'>) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  connectServer: (id: string, credentials?: import('../lib/api').ConnectCredentials) => Promise<void>;
  disconnectServer: (id: string) => Promise<void>;
  setActiveServer: (id: string | null) => void;

  // Actions — tabs
  openTab: (app: AppDefinition, serverId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Actions — terminal
  toggleTerminal: () => void;
}

let tabCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  screen: 'lock' as AppScreen,
  loginError: null,
  servers: [],
  activeServerId: null,
  loadingServers: false,
  serversError: null,
  tabs: [],
  activeTabId: null,
  terminalVisible: false,

  // ── Screen Actions (M6.11) ──────────────────────────

  unlockScreen: () => {
    set({ screen: 'login' });
  },

  goToLogin: () => {
    set({ screen: 'login', loginError: null });
  },

  goToDesktop: () => {
    set({ screen: 'desktop', loginError: null });
  },

  lockScreen: () => {
    // Go back to lock screen — session stays alive
    set({ screen: 'lock' });
  },

  switchUser: async () => {
    // Disconnect current server and go to login screen
    const { activeServerId } = get();
    if (activeServerId) {
      try {
        await api.disconnectServer(activeServerId);
      } catch { /* ignore */ }
    }
    set({ screen: 'login', activeServerId: null, loginError: null, tabs: [], activeTabId: null });
    await get().fetchServers();
  },

  signOut: async () => {
    // Disconnect and go to login screen
    const { activeServerId } = get();
    if (activeServerId) {
      try {
        await api.disconnectServer(activeServerId);
      } catch { /* ignore */ }
    }
    set({ screen: 'login', activeServerId: null, loginError: null, tabs: [], activeTabId: null });
    await get().fetchServers();
  },

  setLoginError: (error) => {
    set({ loginError: error });
  },

  // ── Server Actions ──────────────────────────────────

  fetchServers: async () => {
    set({ loadingServers: true });
    try {
      const servers = await api.fetchServers();
      const state = get();
      // Auto-select: if no active server, pick the first one (or the first connected one)
      let activeServerId = state.activeServerId;
      if (!activeServerId && servers.length > 0) {
        const connected = servers.find(s => s.state?.status === 'connected');
        activeServerId = connected?.id ?? servers[0].id;
      }
      set({ servers, loadingServers: false, serversError: null, activeServerId });
    } catch (err) {
      // Keep the last list: a backend that is down or restarting is not "no servers"
      set({ loadingServers: false, serversError: err instanceof Error ? err.message : String(err) });
    }
  },

  addServer: async (config) => {
    await api.addServer(config);
    await get().fetchServers();
  },

  removeServer: async (id) => {
    await api.removeServer(id);
    const state = get();
    // Clean up tabs for that server
    const remaining = state.tabs.filter(t => t.serverId !== id);
    set({
      tabs: remaining,
      activeTabId: remaining.length > 0 ? remaining[remaining.length - 1].id : null,
      activeServerId: state.activeServerId === id ? null : state.activeServerId,
    });
    await get().fetchServers();
  },

  connectServer: async (id, credentials) => {
    // Optimistic: mark connecting
    set(s => ({
      servers: s.servers.map(srv =>
        srv.id === id
          ? { ...srv, state: { serverId: id, status: 'connecting' as const } }
          : srv,
      ),
    }));
    try {
      const state = await api.connectServer(id, credentials);
      set(s => ({
        servers: s.servers.map(srv =>
          srv.id === id ? { ...srv, state } : srv,
        ),
      }));
    } catch {
      await get().fetchServers();
    }
  },

  disconnectServer: async (id) => {
    await api.disconnectServer(id);
    await get().fetchServers();
  },

  setActiveServer: (id) => {
    set({ activeServerId: id });
  },

  // ── Tab Actions ─────────────────────────────────────

  openTab: (app, serverId) => {
    const state = get();

    // Single-instance: re-focus existing tab
    if (app.singleInstance) {
      const existing = state.tabs.find(
        t => t.appId === app.id && t.serverId === serverId,
      );
      if (existing) {
        set({ activeTabId: existing.id });
        return;
      }
    }

    tabCounter++;
    const tab: Tab = {
      id: `tab-${tabCounter}`,
      appId: app.id,
      serverId,
      title: app.name,
    };

    set(s => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    }));
  },

  closeTab: (tabId) => {
    set(s => {
      const remaining = s.tabs.filter(t => t.id !== tabId);
      return {
        tabs: remaining,
        activeTabId:
          s.activeTabId === tabId
            ? remaining.length > 0
              ? remaining[remaining.length - 1].id
              : null
            : s.activeTabId,
      };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  // ── Terminal ────────────────────────────────────────

  toggleTerminal: () => {
    set(s => ({ terminalVisible: !s.terminalVisible }));
  },
}));
