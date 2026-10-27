// M14.11: the desktop window's preload runs sandboxed. A require() it cannot load throws
// before contextBridge runs, and the client then has no server port or API token.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const electronDir = fileURLToPath(new URL('../../../electron/', import.meta.url));
const preload = readFileSync(`${electronDir}preload.js`, 'utf8');
const main = readFileSync(`${electronDir}main.js`, 'utf8');

/** What a sandboxed preload's require() can load (Electron docs, "Process Sandboxing") */
const SANDBOX_MODULES = ['electron', 'events', 'timers', 'url'];

describe('electron preload', () => {
  it('requires only modules a sandboxed preload can load', () => {
    const required = [...preload.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(required.length).toBeGreaterThan(0);
    expect(required.filter((m) => !SANDBOX_MODULES.includes(m))).toEqual([]);
  });

  it('asks main.js only for channels it answers', () => {
    const channels = [...preload.matchAll(/sendSync\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(channels).toEqual(expect.arrayContaining(['get-server-port', 'get-auth-token', 'get-app-version']));
    for (const c of channels) expect(main, c).toContain(`ipcMain.on('${c}'`);
  });

  it('keeps the window sandboxed with the preload', () => {
    expect(main).toMatch(/preload: path\.join\(__dirname, 'preload\.js'\)/);
    expect(main).toMatch(/sandbox: true/);
    expect(main).toMatch(/contextIsolation: true/);
  });
});
