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
