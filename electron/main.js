// M11.2: Electron Main Process
// @see docs/phases/phase-6.md (B.9: Electron Wrapper)
//
// Loads the HeadlessOS web app in a native window.
// In dev mode, connects to localhost:3000 (Vite dev server).
// In production, loads the built client from ../client/dist/.

const { app, BrowserWindow, Menu, safeStorage, shell, dialog, ipcMain, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { backendExitAction, createLog, describeExit } = require('./diagnostics');
const { keychainNotice, markKeychainExplained, openInstallSecret, shouldExplainKeychain } = require('./keychain');

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
let stopping = false; // M15.2: the app is quitting, so a backend exit is expected

// M15.3: where backend output and failures go. Without it, stdout is read and thrown away
const log = createLog({ dir: path.join(os.homedir(), '.headlessos', 'logs'), home: os.homedir() });

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
 * M16.2: only this process can use the OS keychain, so it opens the install secret for the
 * backend. M16.3: on a Mac it says why a password prompt may follow, once per version.
 */
function openSecretForBackend() {
  const dir = path.join(os.homedir(), '.headlessos');
  const version = app.getVersion();
  try {
    if (shouldExplainKeychain({ dir, version })) {
      dialog.showMessageBoxSync(keychainNotice(app.getName()));
      markKeychainExplained({ dir, version });
    }
    const opened = openInstallSecret({ dir, safeStorage, note: (text) => log.line('main', text) });
    log.line('main', `saved logins: ${opened.store}`);
    return opened.secret;
  } catch (err) {
    log.line('main', `saved logins: ${err.message}`);
    return null; // the backend then reports locked, or uses the plain file
  }
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
    let ready = false;

    const installSecret = openSecretForBackend();

    log.line('main', 'starting the backend');
    serverProcess = utilityProcess.fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: '0',           // OS assigns a free port — no conflicts
        NODE_ENV: 'production',
        ...(installSecret ? { HEADLESSOS_INSTALL_SECRET: installSecret } : {}),
      },
      stdio: 'pipe',
    });

    const timeout = setTimeout(() => {
      reject(new Error('Server failed to start within 20 seconds'));
    }, 20000);

    serverProcess.stdout.on('data', (data) => {
      const text = data.toString();
      log.write('backend', text);
      const tokenMatch = text.match(/HEADLESSOS_TOKEN:([a-f0-9]+)/);
      if (tokenMatch) {
        serverToken = tokenMatch[1];
      }
      const match = text.match(/HEADLESSOS_PORT:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        ready = true;
        serverPort = parseInt(match[1], 10);
        resolve(serverPort);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      log.write('backend', data.toString());
      console.error('[server stderr]', data.toString().trim());
    });

    serverProcess.on('exit', (code) => {
      clearTimeout(timeout);
      log.flush();
      log.line('main', `the backend ${describeExit(code)}`);
      if (code !== 0 && code !== null) {
        console.error(`[server] exited unexpectedly with code ${code}`);
      }
      serverProcess = null;

      // M15.2: without this the app waits out the timeout, or every window just stops working
      const action = backendExitAction({ stopping, ready });
      if (action === 'failed-to-start') {
        reject(new Error(`The backend ${describeExit(code)} before it was ready.`));
      } else if (action === 'ask') {
        askAfterBackendStopped(code);
      }
    });
  });
}

function showStartError(err) {
  log.line('main', `could not start the backend: ${err.message}`);
  dialog.showErrorBox(
    'HeadlessOS — Server Error',
    `The backend server could not start:\n\n${err.message}\n\nThe log may say why:\n${log.file}\n\nThe application will now quit.`,
  );
  app.quit();
}

/**
 * M15.2: the backend died while the app was running. Restarting it needs only a window
 * reload: that runs the preload again, which reads the new port and token.
 */
async function askAfterBackendStopped(code) {
  const options = {
    type: 'error',
    title: 'HeadlessOS — Backend Stopped',
    message: 'The HeadlessOS backend stopped.',
    detail: `It ${describeExit(code)}, so the app can't reach your servers until it restarts. The log may say why:\n\n${log.file}`,
    buttons: ['Restart', 'Open Log', 'Quit'],
    defaultId: 0,
    cancelId: 2,
  };
  let response;
  do {
    ({ response } = await (mainWindow
      ? dialog.showMessageBox(mainWindow, options)
      : dialog.showMessageBox(options)));
    if (response === 1) shell.showItemInFolder(log.file);
  } while (response === 1);
  if (response === 2) {
    app.quit();
    return;
  }

  try {
    log.line('main', 'restarting the backend');
    await startServer();
    if (mainWindow) mainWindow.reload();
  } catch (err) {
    showStartError(err);
  }
}

function stopServer() {
  stopping = true;
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

// M15.4: the window has no menu bar on Windows and Linux, so Settings asks for the log here
ipcMain.handle('open-logs', () => shell.showItemInFolder(log.file));

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

  // M15.3: what the window itself reports. preload-error is the M14.11 fault: without its
  // preload the window has no backend port, and nothing else says why.
  mainWindow.webContents.on('preload-error', (_event, _preloadPath, error) => {
    log.line('window', `the preload failed: ${error.message}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.line('window', `the renderer stopped: ${details.reason} (${details.exitCode})`);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 3) log.line('window', `${message} (${sourceId.split('/').pop()}:${line})`);
  });

  // Show a readable error instead of a silent black screen if the file fails to load
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] did-fail-load: ${errorCode} ${errorDescription} url=${validatedURL}`);
    log.line('window', `did-fail-load: ${errorCode} ${errorDescription}`);
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
        { label: 'Open Logs', click: () => shell.showItemInFolder(log.file) },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://headlessos.com/docs/introduction'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/abhee235/headlessos/issues'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── App Lifecycle ───────────────────────────────────────

app.whenReady().then(async () => {
  log.line('main', `HeadlessOS ${app.getVersion()} on ${process.platform} ${process.arch}, Electron ${process.versions.electron}`);
  createMenu();

  // Start the backend server and wait for it to signal its port.
  // In dev mode this resolves immediately with port 3001.
  try {
    await startServer();
  } catch (err) {
    showStartError(err);
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
