// M17.7, M17.8: a Mac is told what macOS will ask about the local network, and can open the setting
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { LOCAL_NETWORK_SETTINGS, NOTICE_FILE, localNetworkNotice, markLocalNetworkExplained, shouldExplainLocalNetwork } =
  require('../../../electron/local-network.js');

const electron = fileURLToPath(new URL('../../../electron/', import.meta.url));
let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hos-local-network-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the Local Network note', () => {
  it('is shown once per version, on a Mac', () => {
    expect(shouldExplainLocalNetwork({ dir, platform: 'darwin', version: '0.3.3' })).toBe(true);
    markLocalNetworkExplained({ dir, version: '0.3.3' });
    expect(shouldExplainLocalNetwork({ dir, platform: 'darwin', version: '0.3.3' })).toBe(false);
    expect(shouldExplainLocalNetwork({ dir, platform: 'darwin', version: '0.3.4' })).toBe(true);
  });

  it('is never shown on Windows or Linux, which don\'t ask', () => {
    expect(shouldExplainLocalNetwork({ dir, platform: 'win32', version: '0.3.3' })).toBe(false);
    expect(shouldExplainLocalNetwork({ dir, platform: 'linux', version: '0.3.3' })).toBe(false);
  });

  it('keeps its own record, apart from the Keychain note\'s', () => {
    markLocalNetworkExplained({ dir, version: '0.3.3' });
    expect(NOTICE_FILE).toBe('local-network-notice');
    expect(readFileSync(join(dir, NOTICE_FILE), 'utf8')).toBe('0.3.3');
  });

  it('says what to click, and that the first try may fail while macOS asks', () => {
    const notice = localNetworkNotice('HeadlessOS');
    expect(notice.message).toBe('macOS will ask about your local network');
    expect(notice.detail).toContain('Click Allow');
    expect(notice.detail).toContain('connect again');
    expect(notice.detail).toContain('again after an update');
    expect(notice.buttons).toEqual(['Continue']);
  });
});

describe('opening the setting', () => {
  const main = readFileSync(join(electron, 'main.js'), 'utf8');
  const preload = readFileSync(join(electron, 'preload.js'), 'utf8');

  it('opens one fixed address, in System Settings', () => {
    expect(LOCAL_NETWORK_SETTINGS).toBe('x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork');
    const handler = main.slice(main.indexOf("ipcMain.handle('open-local-network-settings'"));
    expect(handler.slice(0, 200)).toContain("process.platform === 'darwin' ? shell.openExternal(LOCAL_NETWORK_SETTINGS)");
  });

  it('is offered to the window on a Mac only, and takes no address from it', () => {
    const mac = preload.slice(preload.indexOf("process.platform === 'darwin'"));
    expect(mac).toContain("explainLocalNetwork: () => ipcRenderer.invoke('explain-local-network')");
    expect(mac).toContain("openLocalNetworkSettings: () => ipcRenderer.invoke('open-local-network-settings')");
    expect(preload).not.toMatch(/invoke\('open-local-network-settings',/);
  });

  it('marks the note as read only after the owner closes it', () => {
    const handler = main.slice(main.indexOf("ipcMain.handle('explain-local-network'"), main.indexOf("ipcMain.handle('open-local-network-settings'"));
    expect(handler.indexOf('await')).toBeLessThan(handler.indexOf('markLocalNetworkExplained'));
  });
});
