// EX8.18: Window frame — the drop shadow lives beside the glass, not on it
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

import { render } from '@testing-library/react';
import { WindowFrame } from '../../src/components/Desktop/Window';
import type { WindowState } from '../../src/store/window-store';

const win = (over: Partial<WindowState> = {}): WindowState => ({
  id: 'w1', appId: 'docker', serverId: 's1', title: 'Docker', icon: 'docker',
  x: 100, y: 80, width: 950, height: 600,
  minimized: false, maximized: false, focused: true, zIndex: 101,
  ...over,
});

function parts(w: WindowState) {
  const { container } = render(<WindowFrame win={w}><p>body</p></WindowFrame>);
  const frame = container.firstElementChild as HTMLElement;
  const [drop, glass] = Array.from(frame.children) as HTMLElement[];
  return { frame, drop, glass };
}

describe('WindowFrame', () => {
  it('keeps the drop shadow off the glass element', () => {
    const { frame, drop, glass } = parts(win());
    expect(frame.style).toMatchObject({ left: '100px', top: '80px', width: '950px', height: '600px', zIndex: '101' });
    expect(frame.className).not.toMatch(/glass|shadow/);
    expect(drop).toHaveAttribute('aria-hidden');
    expect(drop.className).toMatch(/\bshadow-window-drop\b/);
    expect(glass.className).toMatch(/\bglass\b/);
    expect(glass.className).not.toMatch(/shadow-window/);
    expect(glass).toHaveTextContent('body');
  });

  it('softens the shadow when unfocused and squares both layers when maximized', () => {
    expect(parts(win({ focused: false })).drop.className).toMatch(/\bshadow-window-drop-unfocused\b/);
    const { drop, glass } = parts(win({ maximized: true }));
    expect(drop.className).toMatch(/\brounded-none\b/);
    expect(glass.className).toMatch(/\brounded-none\b/);
  });
});
