import path from 'path';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// C3: the backend requires an API token on every request. In dev, the browser
// talks to the backend through this proxy, so the proxy attaches the token the
// server wrote to ~/.headlessos/api-token. Read lazily (the backend may boot a
// moment after Vite) and cache once found.
const TOKEN_FILE = path.join(homedir(), '.headlessos', 'api-token');
let _cachedToken = '';
function getApiToken(): string {
  if (_cachedToken) return _cachedToken;
  try {
    const t = readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t) _cachedToken = t;
    return t;
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Use relative paths in production build so Electron file:// protocol works
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // M10.10: Performance — code splitting & chunk optimization
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        playground: path.resolve(__dirname, 'playground.html'),
      },
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-tooltip', '@radix-ui/react-context-menu', '@radix-ui/react-dropdown-menu'],
          'vendor-xterm': ['@xterm/xterm', '@xterm/addon-fit'],
          'vendor-charts': ['recharts'],
          'vendor-state': ['zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const t = getApiToken();
            if (t) proxyReq.setHeader('x-headlessos-token', t);
          });
        },
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReqWs', (proxyReq) => {
            const t = getApiToken();
            if (t) proxyReq.setHeader('x-headlessos-token', t);
          });
        },
      },
    },
  },
});
