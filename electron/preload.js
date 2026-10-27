// M11.2: Electron Preload Script
// @see docs/phases/phase-6.md (B.9: Electron Wrapper)
//
// Exposes a minimal, safe API to the renderer process.
// Uses contextBridge to avoid exposing Node.js APIs directly.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Platform identifier: 'darwin' | 'win32' | 'linux' */
  platform: process.platform,

  /** Whether running in Electron (vs browser) */
  isElectron: true,

  /**
   * App version, from the main process (M14.11): this preload is sandboxed, and a
   * sandboxed preload can only require electron, events, timers and url.
   */
  version: ipcRenderer.sendSync('get-app-version'),

  /**
   * Backend server port (dynamically assigned at startup via PORT=0).
   * Read synchronously from the main process before page scripts run,
   * so api.ts can use it at module load time.
   */
  serverPort: ipcRenderer.sendSync('get-server-port'),

  /**
   * API auth token (C3). Read synchronously before page scripts run so api.ts
   * can attach it to every backend request. Empty in dev (Vite proxy injects it).
   */
  authToken: ipcRenderer.sendSync('get-auth-token'),

  /** Listen for messages from the main process */
  onMessage: (channel, callback) => {
    const validChannels = ['open-settings'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  /** Remove listener */
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
});
