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

  /** App version from package.json */
  version: require('./package.json').version,

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
