import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
