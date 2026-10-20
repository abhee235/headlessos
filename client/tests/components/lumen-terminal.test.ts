// EX8.6: terminal font resolution — upgrade only the exact pre-EX8 default
import { describe, it, expect } from 'vitest';
import {
  resolveTerminalFont,
  LUMEN_TERMINAL_FONT,
  LUMEN_TERMINAL_FONT_SIZE,
} from '../../src/components/Terminal/lumen-terminal';

const LEGACY = '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace';

describe('resolveTerminalFont', () => {
  it('upgrades the saved pre-EX8 default to Geist Mono 13px', () => {
    expect(resolveTerminalFont(LEGACY, 14)).toEqual({ fontFamily: LUMEN_TERMINAL_FONT, fontSize: LUMEN_TERMINAL_FONT_SIZE });
  });

  it('keeps a size the user changed while on the legacy family', () => {
    expect(resolveTerminalFont(LEGACY, 16)).toEqual({ fontFamily: LUMEN_TERMINAL_FONT, fontSize: 16 });
  });

  it('honours any font the user picked, including 14px', () => {
    expect(resolveTerminalFont('"JetBrains Mono", monospace', 14)).toEqual({ fontFamily: '"JetBrains Mono", monospace', fontSize: 14 });
    expect(resolveTerminalFont(LUMEN_TERMINAL_FONT, 14)).toEqual({ fontFamily: LUMEN_TERMINAL_FONT, fontSize: 14 });
  });
});
