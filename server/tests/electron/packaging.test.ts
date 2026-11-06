// M14.12: the desktop app finds its system wallpapers in every layout the server runs from
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSystemDir } from '../../src/routes/wallpapers.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** A file system that has only `dir` */
const only = (dir: string) => (d: string) => d === dir;

describe('system wallpaper folder', () => {
  it('uses resources/assets next to the desktop app server', () => {
    const resources = join('C:', 'Program Files', 'HeadlessOS', 'resources');
    const want = join(resources, 'assets', 'wallpapers', 'system');
    expect(findSystemDir(resources, only(want))).toBe(want);
  });

  it('uses server/assets from the source tree', () => {
    const routes = join(root, 'server', 'src', 'routes');
    const want = join(root, 'server', 'assets', 'wallpapers', 'system');
    expect(findSystemDir(routes, only(want))).toBe(want);
    // and the real tree has it
    expect(findSystemDir(routes)).toBe(want);
  });

  it('uses ../server/assets for the bundle in electron/ (npm run test:prod)', () => {
    const electron = join(root, 'electron');
    expect(findSystemDir(electron)).toBe(join(root, 'server', 'assets', 'wallpapers', 'system'));
  });

  it('is copied into the desktop app by electron-builder', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'electron', 'package.json'), 'utf8'));
    expect(pkg.build.extraResources).toEqual(expect.arrayContaining([{ from: '../server/assets', to: 'assets' }]));
  });
});

// M15.2: a file main.js loads but electron-builder leaves out stops the app from starting
describe('desktop app files', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'electron', 'package.json'), 'utf8'));
  const main = readFileSync(join(root, 'electron', 'main.js'), 'utf8');

  it('packages every local file main.js requires', () => {
    const local = [...main.matchAll(/require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(local).toContain('diagnostics');
    for (const file of local) {
      expect(pkg.build.files, file).toContain(file.endsWith('.js') ? file : `${file}.js`);
    }
  });
});

// M15.5: deb packages need a maintainer, and the site's Linux card looks for these files
describe('Linux release build', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'electron', 'package.json'), 'utf8'));
  const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');

  it('has what a deb package needs, and no personal address', () => {
    expect(pkg.build.linux.target).toEqual(['AppImage', 'deb']);
    expect(pkg.homepage).toBe('https://headlessos.com');
    expect(pkg.build.linux.maintainer).toMatch(/^HeadlessOS <\S+@headlessos\.com>$/);
  });

  it('builds Linux before the release, and attaches the files', () => {
    expect(workflow).toContain('needs: [build-mac, build-windows, build-linux]');
    expect(workflow).toContain('electron-builder --linux --x64');
    expect(workflow).toContain('electron/dist/*.AppImage');
    expect(workflow).toContain('electron/dist/*.deb');
    expect(workflow).toContain('name: linux-dist');
  });

  it('creates a release only from a tag, so a manual build cannot publish', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("if: startsWith(github.ref, 'refs/tags/')");
  });
});

// M15.8: Terminal is exempt from macOS local network privacy, and the app is not
describe('macOS build', () => {
  it('says why it needs the local network', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'electron', 'package.json'), 'utf8'));
    expect(pkg.build.mac.extendInfo.NSLocalNetworkUsageDescription).toMatch(/SSH/);
  });
});
