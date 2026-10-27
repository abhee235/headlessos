// M11.2: Electron Main Process
// @see docs/phases/phase-6.md (B.9: Electron Wrapper)
//
// Loads the HeadlessOS web app in a native window.
// In dev mode, connects to localhost:3000 (Vite dev server).
// In production, loads the built client from ../client/dist/.

const { app, BrowserWindow, Menu, shell, dialog, ipcMain, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const IS_DEV = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const DEV_URL = 'http://localhost:3000';
// In packaged app, client/dist lands in Resources/ via extraResources.
// In unpackaged (npx electron .), it's at ../client/dist relative to electron/.
const PROD_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'client', 'dist', 'index.html')
  : path.join(__dirname, '..', 'client', 'dist', 'index.html');

let mainWindow = null;

// ── Backend Server Management ───────────────────────────

let serverProcess = null;
let serverPort = IS_DEV ? 3001 : null; // dev mode: developer runs server separately
let serverToken = null; // C3: API auth token, read from the server's stdout in prod

/**
 * Resolve path to the bundled server.mjs (built by `npm run build:server`; M14.3: not in git).
 * - Packaged app: process.resourcesPath (outside asar)
 * - Unpackaged production: __dirname/server.mjs
 */
function getServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server.mjs');
  }
  return path.join(__dirname, 'server.mjs');
}

/**
 * Spawn the bundled Fastify backend with PORT=0 so the OS picks a free port.
 * Resolves with the actual port once the server writes HEADLESSOS_PORT:<n> to stdout.
 */
function startServer() {
  return new Promise((resolve, reject) => {
    if (IS_DEV) {
      resolve(3001); // developer starts server manually via `npm run dev`
      return;
    }

    const serverPath = getServerPath();

    serverProcess = utilityProcess.fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: '0',           // OS assigns a free port — no conflicts
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    });

    const timeout = setTimeout(() => {
      reject(new Error('Server failed to start within 20 seconds'));
    }, 20000);

    serverProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const tokenMatch = text.match(/HEADLESSOS_TOKEN:([a-f0-9]+)/);
      if (tokenMatch) {
        serverToken = tokenMatch[1];
      }
      const match = text.match(/HEADLESSOS_PORT:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        serverPort = parseInt(match[1], 10);
        resolve(serverPort);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[server stderr]', data.toString().trim());
    });

    serverProcess.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null) {
        console.error(`[server] exited unexpectedly with code ${code}`);
      }
      serverProcess = null;
    });
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

// Synchronous IPC: renderer preload calls ipcRenderer.sendSync('get-server-port')
// and we return the port before the page scripts run.
ipcMain.on('get-server-port', (event) => {
  event.returnValue = serverPort ?? 3001;
});

// M14.11: the sandboxed preload cannot require package.json, so it asks for the version
ipcMain.on('get-app-version', (event) => {
  event.returnValue = app.getVersion();
});

// C3: renderer reads the API token (prod only; in dev the Vite proxy injects it).
// Prefer the token captured from stdout, but fall back to reading the token file
// directly — this is race-free because the server writes ~/.headlessos/api-token
// at startup, before it ever prints the port line we wait on.
ipcMain.on('get-auth-token', (event) => {
  if (serverToken) {
    event.returnValue = serverToken;
    return;
  }
  try {
    const tokenPath = path.join(os.homedir(), '.headlessos', 'api-token');
    serverToken = fs.readFileSync(tokenPath, 'utf8').trim();
    event.returnValue = serverToken;
  } catch {
    event.returnValue = '';
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'HeadlessOS',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    backgroundColor: '#09090b', // zinc-950
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    // Frameless for custom title bar (matches the web app's design)
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    show: false, // Show after ready-to-show to avoid flash
  });

  // Load the app
  if (IS_DEV) {
    mainWindow.loadURL(DEV_URL);
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(PROD_PATH);
  }

  // Show window when content is ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Show a readable error instead of a silent black screen if the file fails to load
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] did-fail-load: ${errorCode} ${errorDescription} url=${validatedURL}`);
    dialog.showErrorBox(
      'HeadlessOS — Failed to Load',
      `The app UI could not be loaded.\n\nURL: ${validatedURL}\nError: ${errorDescription} (${errorCode})\n\nPlease reinstall the application.`,
    );
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Clean up
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Application Menu ────────────────────────────────────

function createMenu() {
  const template = [
    {
      label: 'HeadlessOS',
      submenu: [
        { label: 'About HeadlessOS', role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('open-settings');
          }
        }},
        { type: 'separator' },
        { label: 'Hide HeadlessOS', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/headlessos/headlessos'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/headlessos/headlessos/issues'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── App Lifecycle ───────────────────────────────────────

app.whenReady().then(async () => {
  createMenu();

  // Start the backend server and wait for it to signal its port.
  // In dev mode this resolves immediately with port 3001.
  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox(
      'HeadlessOS — Server Error',
      `The backend server could not start:\n\n${err.message}\n\nThe application will now quit.`,
    );
    app.quit();
    return;
  }

  createWindow();

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopServer();
    app.quit();
  }
});

// Ensure the server is stopped when the app quits (macOS quit from Dock etc.)
app.on('before-quit', () => {
  stopServer();
});

// Security: prevent new windows from being created
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    // Allow navigation within the app
    if (IS_DEV && url.startsWith(DEV_URL)) return;
    if (!IS_DEV && url.startsWith('file://')) return;
    event.preventDefault();
  });
});
