// EX8.2: Keyboard shortcut → display glyphs, shared by context menus,
// dropdown menus and the command palette.
//   "Ctrl+Shift+Esc" → ["⌃", "⇧", "Esc"]
//   "Alt+F4"         → ["⌥", "F4"]
//   "⇧⌘N"            → ["⇧", "⌘", "N"]   (glyph runs are split too)
// Esc and F-keys stay as text.
// @see docs/phases/phase-ex8.md

const NAMED: Record<string, string> = {
  ctrl: '⌃',
  control: '⌃',
  shift: '⇧',
  alt: '⌥',
  option: '⌥',
  meta: '⌘',
  cmd: '⌘',
  command: '⌘',
  enter: '↩',
  return: '↩',
  delete: '⌫',
  del: '⌫',
  backspace: '⌫',
  tab: '⇥',
  up: '↑',
  arrowup: '↑',
  down: '↓',
  arrowdown: '↓',
  left: '←',
  arrowleft: '←',
  right: '→',
  arrowright: '→',
  esc: 'Esc',
  escape: 'Esc',
  space: 'Space',
};

const MODIFIER_GLYPHS = new Set(['⌃', '⇧', '⌥', '⌘']);

function mapToken(token: string): string {
  const named = NAMED[token.toLowerCase()];
  if (named) return named;
  return token.length === 1 ? token.toUpperCase() : token;
}

export function formatShortcut(shortcut: string): string[] {
  const out: string[] = [];
  for (const raw of shortcut.split('+')) {
    let part = raw.trim();
    if (!part) continue;
    // Peel leading modifier glyphs: "⇧⌘N" → ⇧, ⌘, then "N"
    while (part.length > 0 && MODIFIER_GLYPHS.has(part[0]!)) {
      out.push(part[0]!);
      part = part.slice(1);
    }
    if (part) out.push(mapToken(part));
  }
  return out;
}
