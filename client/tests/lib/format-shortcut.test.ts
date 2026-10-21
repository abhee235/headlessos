// EX8.2: formatShortcut
import { describe, it, expect } from 'vitest';
import { formatShortcut } from '../../src/lib/format-shortcut';

describe('formatShortcut', () => {
  it('maps named modifiers to glyphs', () => {
    expect(formatShortcut('Ctrl+Shift+Esc')).toEqual(['⌃', '⇧', 'Esc']);
    expect(formatShortcut('Alt+F4')).toEqual(['⌥', 'F4']);
    expect(formatShortcut('Ctrl+Space')).toEqual(['⌃', 'Space']);
    expect(formatShortcut('Meta+K')).toEqual(['⌘', 'K']);
  });

  it('maps Enter and Delete/Backspace', () => {
    expect(formatShortcut('Alt+Enter')).toEqual(['⌥', '↩']);
    expect(formatShortcut('Shift+Delete')).toEqual(['⇧', '⌫']);
    expect(formatShortcut('Backspace')).toEqual(['⌫']);
  });

  it('splits glyph runs that are already formatted', () => {
    expect(formatShortcut('⇧⌘N')).toEqual(['⇧', '⌘', 'N']);
    expect(formatShortcut('⌃⇧Esc')).toEqual(['⌃', '⇧', 'Esc']);
    expect(formatShortcut('Alt+↩')).toEqual(['⌥', '↩']);
    expect(formatShortcut('⌘V')).toEqual(['⌘', 'V']);
  });

  it('keeps F-keys and Esc as text, uppercases single letters', () => {
    expect(formatShortcut('F5')).toEqual(['F5']);
    expect(formatShortcut('esc')).toEqual(['Esc']);
    expect(formatShortcut('ctrl+w')).toEqual(['⌃', 'W']);
  });

  it('tolerates spaces and empty parts', () => {
    expect(formatShortcut(' Ctrl + Alt + T ')).toEqual(['⌃', '⌥', 'T']);
    expect(formatShortcut('')).toEqual([]);
  });
});
