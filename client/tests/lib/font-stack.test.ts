// EX8.32: a Mac gets San Francisco, and no other computer changes at all. The list every other
// computer reads must stay exactly as it was, so this reads the built stylesheet, because the build
// rewrites these rules. An earlier version only checked the order of the names, and passed while
// Chromium rendered Manrope: -apple-system does nothing there. What renders was measured by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transform } from 'lightningcss';
import { isMac, markPlatform } from '../../src/lib/platform';

const src = (file: string) => readFileSync(resolve(__dirname, '../../src', file), 'utf8');

const built = transform({
  filename: 'styles.css',
  code: Buffer.from(src('styles.css')),
  minify: true,
  errorRecovery: true,
}).code.toString();

const names = (list: string) => list.split(',').map((name) => name.trim().replace(/^["']|["']$/g, ''));

function fontList(pattern: RegExp): string[] {
  const found = built.match(pattern);
  if (!found) throw new Error(`${pattern} is not in the built stylesheet`);
  return names(found[1]);
}

describe('interface font', () => {
  it('leaves the list Windows and Linux have always read', () => {
    expect(fontList(/(?:^|[{;\s])--font-sans:\s*([^;}]+)/)).toEqual([
      'Manrope Variable', 'Manrope', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif',
    ]);
  });

  it('uses the system font only on a marked Mac', () => {
    const mac = fontList(/\[data-platform=["']?mac["']?\]\{--font-sans:([^;}]+)/);
    expect(mac[0]).toBe('system-ui');
    expect(mac).toContain('Manrope Variable');
  });

  it('draws a Mac at native weight, and leaves the smoothing rule everyone else has', () => {
    expect(built).toMatch(/\[data-platform=["']?mac["']?\] body\{-webkit-font-smoothing:auto/);
    expect(built).toMatch(/(?:^|})body\{[^}]*-webkit-font-smoothing:antialiased/);
  });

  it('is set in one place, so no screen stays on Manrope on a Mac', () => {
    expect(src('components/HomeHub/HomeHub.tsx')).not.toContain('Manrope');
    // @theme inline writes the Manrope list into the font-sans class, so it can't follow a Mac
    expect(src('components/ui/sonner.tsx')).not.toContain('!font-sans');
  });
});

describe('markPlatform', () => {
  it.each(['MacIntel', 'MacPPC'])('marks %s', (platform) => {
    expect(isMac(platform)).toBe(true);
    const root = document.createElement('html');
    markPlatform(root, platform);
    expect(root.dataset.platform).toBe('mac');
  });

  it.each(['Win32', 'Linux x86_64', 'Linux aarch64', ''])('leaves "%s" unmarked', (platform) => {
    expect(isMac(platform)).toBe(false);
    const root = document.createElement('html');
    markPlatform(root, platform);
    expect(root.dataset.platform).toBeUndefined();
  });

  it.each(['main.tsx', 'playground-entry.tsx'])('runs in %s', (entry) => {
    expect(src(entry)).toMatch(/^markPlatform\(\);$/m);
  });
});
