// EX8.1: LumenOS appearance resolution
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LUMEN_ACCENTS,
  accentForWallpaper,
  resolveAccent,
  isDarkWallpaper,
  applyLumenAppearance,
} from '../../src/lib/lumen-theme';

describe('accentForWallpaper', () => {
  it('maps each Lumen wallpaper to its accent', () => {
    expect(accentForWallpaper('system:alpine.jpg')).toBe('blue');
    expect(accentForWallpaper('system:highlands.jpg')).toBe('moss');
    expect(accentForWallpaper('system:still-lake.jpg')).toBe('teal');
    expect(accentForWallpaper('system:mist.jpg')).toBe('teal');
    expect(accentForWallpaper('system:dusk.jpg')).toBe('iris');
    expect(accentForWallpaper('system:northern-lights.jpg')).toBe('moss');
  });

  it('falls back to iris for any other wallpaper', () => {
    expect(accentForWallpaper('builtin:celestial')).toBe('iris');
    expect(accentForWallpaper('user:holiday.png')).toBe('iris');
    expect(accentForWallpaper('')).toBe('iris');
  });
});

describe('resolveAccent', () => {
  it('index 0 follows the wallpaper', () => {
    expect(LUMEN_ACCENTS[0].id).toBe('auto');
    expect(resolveAccent(0, 'system:alpine.jpg')).toBe('blue');
    expect(resolveAccent(0, 'system:dusk.jpg')).toBe('iris');
  });

  it('explicit choices ignore the wallpaper', () => {
    expect(resolveAccent(1, 'system:alpine.jpg')).toBe('iris');
    expect(resolveAccent(2, 'system:alpine.jpg')).toBe('teal');
    expect(resolveAccent(3, 'system:dusk.jpg')).toBe('blue');
    expect(resolveAccent(4, 'system:dusk.jpg')).toBe('moss');
  });

  it('indices left over from the old 8-colour picker fall back to auto', () => {
    expect(resolveAccent(7, 'system:still-lake.jpg')).toBe('teal');
    expect(resolveAccent(-1, 'system:alpine.jpg')).toBe('blue');
  });
});

describe('isDarkWallpaper', () => {
  it('treats builtin gradients and legacy bare ids as dark', () => {
    expect(isDarkWallpaper('builtin:celestial')).toBe(true);
    expect(isDarkWallpaper('celestial')).toBe(true);
  });

  it('only flags the dark Lumen photo among image wallpapers', () => {
    expect(isDarkWallpaper('system:northern-lights.jpg')).toBe(true);
    expect(isDarkWallpaper('system:dusk.jpg')).toBe(false);
    expect(isDarkWallpaper('user:holiday.png')).toBe(false);
  });
});

describe('applyLumenAppearance', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement('html');
  });

  it('writes accent, glass and wallpaper-tone attributes', () => {
    applyLumenAppearance(root, { accent: 'teal', glass: 'balanced', transparency: true, darkWallpaper: true });
    expect(root.getAttribute('data-accent')).toBe('teal');
    expect(root.getAttribute('data-glass')).toBe('balanced');
    expect(root.getAttribute('data-wall-tone')).toBe('dark');
    expect(root.hasAttribute('data-transparency')).toBe(false);
  });

  it('sets transparency=off and clears the tone when toggled back', () => {
    applyLumenAppearance(root, { accent: 'iris', glass: 'heavy', transparency: false, darkWallpaper: true });
    expect(root.getAttribute('data-transparency')).toBe('off');
    applyLumenAppearance(root, { accent: 'iris', glass: 'heavy', transparency: true, darkWallpaper: false });
    expect(root.hasAttribute('data-transparency')).toBe(false);
    expect(root.hasAttribute('data-wall-tone')).toBe(false);
  });
});
