# HeadlessOS Electron Wrapper

## Development

```bash
# 1. Start the web app first
cd .. && npm run dev

# 2. In another terminal, start Electron in dev mode
cd electron && npm start
```

## Building

```bash
# Install electron dependencies
cd electron && npm install

# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux
```

Output goes to `electron/dist/`.

## Architecture

- **main.js** — Main process: creates BrowserWindow, loads the web app
- **preload.js** — Preload script: exposes `window.electronAPI` via contextBridge
- **icons/** — App icons for each platform (add .icns/.ico/.png files)

In dev mode (`npm start` or `electron . --dev`), loads `http://localhost:3000`.  
In production, loads the built client from `../client/dist/index.html`.

## Notes

- The Electron wrapper does NOT bundle the backend server. 
  Run `npm run dev:server` separately or bundle it with a process manager.
- Native window uses `hiddenInset` title bar on macOS for seamless integration.
- All external links open in the default browser (not in new Electron windows).
