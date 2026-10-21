// EX8.6: LumenOS v3 terminal look, shared by TerminalView and DockerInstallTerminal.
//   Pane:  inset 8px (mx-2 mb-2), radius 12px, always-dark bg-term with a faint
//          hairline (as in the LumenOS prototype, in both themes). xterm's own
//          background is transparent.
//   Font:  Geist Mono 13px when the user kept the default terminal font.
//   Theme: dark ANSI palette, foreground --lumen-term-fg, cursor --lumen-accent-hi,
//          selection --lumen-accent-glow, re-read when <html> `class` / `data-accent` change.
// @see Custom OS UI Design/handoff/HANDOFF.md §3 Terminal, docs/phases/phase-ex8.md

import { useEffect, type RefObject } from 'react';
import type { ITheme, Terminal } from '@xterm/xterm';

/** Rounded inset pane that hosts xterm. */
export const TERMINAL_PANE_CLASS = 'relative min-h-0 overflow-hidden rounded-[12px] border border-white/[.08] bg-term';
/** Padding around the xterm element (kept off xterm's parent so FitAddon measures correctly). */
export const TERMINAL_PADDING_CLASS = 'h-full w-full py-3.5 pl-[18px] pr-1.5';
/** Element passed to `term.open()`; xterm.css paints `.xterm-viewport` black by default. */
export const TERMINAL_HOST_CLASS = 'h-full w-full [&_.xterm-viewport]:bg-transparent!';

export const LUMEN_TERMINAL_FONT = "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace";
export const LUMEN_TERMINAL_FONT_SIZE = 13;
export const LUMEN_TERMINAL_LINE_HEIGHT = 1.2;

// The pre-EX8 store default. New installs default to Geist Mono 13px in the
// store itself; this only upgrades preferences saved before that, and only the
// exact old default — any font or size the user picked is honoured.
const LEGACY_DEFAULT_FONT_FAMILY = '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace';
const LEGACY_DEFAULT_FONT_SIZE = 14;

export function resolveTerminalFont(fontFamily: string, fontSize: number) {
  if (fontFamily !== LEGACY_DEFAULT_FONT_FAMILY) return { fontFamily, fontSize };
  return {
    fontFamily: LUMEN_TERMINAL_FONT,
    fontSize: fontSize === LEGACY_DEFAULT_FONT_SIZE ? LUMEN_TERMINAL_FONT_SIZE : fontSize,
  };
}

// ANSI palette. Terminal colour data (like chart series), tuned to the Lumen hues
// (danger / success / warning / chart-3 / chart-4) on the always-dark pane.
const ANSI_DARK: ITheme = {
  black: '#4B5059',
  red: '#FF7B72',
  green: '#7FD3A0',
  yellow: '#F2C66D',
  blue: '#8AB4FF',
  magenta: '#D6A4FF',
  cyan: '#4FC3D6',
  white: '#D6DEE4',
  brightBlack: '#7D8590',
  brightRed: '#FFA198',
  brightGreen: '#A5E3BC',
  brightYellow: '#F8DA9A',
  brightBlue: '#AFCBFF',
  brightMagenta: '#E7C8FF',
  brightCyan: '#7AD6E5',
  brightWhite: '#FFFFFF',
};

// Fully transparent, so the pane colour shows through. The RGB part only matters
// for xterm's internal blends (selection, inverse text), so it approximates the
// pane's colour.
const BG_DARK = 'rgba(9, 13, 19, 0)';

function token(name: string): string | undefined {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || undefined;
}

/** Builds the xterm theme from the current Lumen tokens on <html>. */
export function getLumenTerminalTheme(): ITheme {
  // The pane is dark in both themes, so the dark palette always applies.
  return {
    ...ANSI_DARK,
    background: BG_DARK,
    foreground: token('--lumen-term-fg'),
    cursor: token('--lumen-accent-hi'),
    cursorAccent: '#090D13',
    selectionBackground: token('--lumen-accent-glow'),
    scrollbarSliderBackground: 'rgba(255, 255, 255, .16)',
    scrollbarSliderHoverBackground: 'rgba(255, 255, 255, .28)',
    scrollbarSliderActiveBackground: 'rgba(255, 255, 255, .28)',
  };
}

/** Re-applies the theme whenever the colour scheme or accent on <html> changes. */
export function useLumenTerminalTheme(termRef: RefObject<Terminal | null>) {
  useEffect(() => {
    const apply = () => {
      if (termRef.current) termRef.current.options.theme = getLumenTerminalTheme();
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-accent'],
    });
    return () => observer.disconnect();
  }, [termRef]);
}

/**
 * xterm measures its cell size once, when it opens. If the web font was not
 * loaded yet, nudge the font size after it arrives so xterm re-measures, then refit.
 */
export function refitWhenFontReady(term: Terminal, refit: () => void) {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts?.load) return;
  const { fontFamily, fontSize } = term.options;
  if (!fontFamily || !fontSize) return;
  const spec = `${fontSize}px ${fontFamily}`;
  try {
    if (fonts.check(spec)) return;
  } catch {
    return;
  }
  fonts.load(spec).then(
    () => {
      if (!term.element || term.options.fontFamily !== fontFamily || term.options.fontSize !== fontSize) return;
      try {
        term.options.fontSize = fontSize + 1;
        term.options.fontSize = fontSize;
        refit();
      } catch {
        // terminal was disposed while the font loaded
      }
    },
    () => {},
  );
}
