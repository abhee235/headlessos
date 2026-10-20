// Terminal control-frame parsing. Regression: resize frames arrive as Buffers
// from `ws`, and were being typed into the shell as "type:resize..." text.
import { describe, it, expect } from 'vitest';
import { parseTerminalControl } from '../../src/terminal/control.js';

const buf = (s: string) => Buffer.from(s, 'utf8');

describe('parseTerminalControl', () => {
  it('recognises a resize sent as a Buffer (how ws delivers text frames)', () => {
    expect(parseTerminalControl(buf('{"type":"resize","rows":40,"cols":120}'))).toEqual({
      type: 'resize',
      rows: 40,
      cols: 120,
    });
  });

  it('recognises string frames and the legacy 0x01 sentinel', () => {
    expect(parseTerminalControl('{"type":"resize","rows":24,"cols":80}')).toEqual({ type: 'resize', rows: 24, cols: 80 });
    expect(parseTerminalControl(Buffer.concat([Buffer.from([0x01]), buf('{"type":"resize","rows":10,"cols":20}')]))).toEqual({
      type: 'resize',
      rows: 10,
      cols: 20,
    });
  });

  it('parses get-buffer with and without lastN', () => {
    expect(parseTerminalControl(buf('{"type":"get-buffer","lastN":50}'))).toEqual({ type: 'get-buffer', lastN: 50 });
    expect(parseTerminalControl(buf('{"type":"get-buffer"}'))).toEqual({ type: 'get-buffer' });
  });

  it('treats ordinary keystrokes as terminal input', () => {
    expect(parseTerminalControl(buf('l'))).toBeNull();
    expect(parseTerminalControl(buf('ls -la\r'))).toBeNull();
    expect(parseTerminalControl(buf('\x1b[A'))).toBeNull(); // arrow up
    expect(parseTerminalControl('a')).toBeNull();
    expect(parseTerminalControl(Buffer.alloc(0))).toBeNull();
  });

  it('treats a typed "{" or arbitrary JSON as input, not control', () => {
    expect(parseTerminalControl(buf('{'))).toBeNull();
    expect(parseTerminalControl(buf('{"a":1}'))).toBeNull();
    expect(parseTerminalControl(buf('{"type":"exec","cmd":"rm -rf /"}'))).toBeNull();
  });

  it('rejects malformed resize dimensions', () => {
    expect(parseTerminalControl(buf('{"type":"resize","rows":0,"cols":80}'))).toBeNull();
    expect(parseTerminalControl(buf('{"type":"resize","rows":"x","cols":80}'))).toBeNull();
    expect(parseTerminalControl(buf('{"type":"resize","rows":24}'))).toBeNull();
  });
});
