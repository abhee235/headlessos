// Terminal WebSocket control frames (resize, get-buffer).
//
// The browser sends keystrokes and JSON control messages on the same socket,
// both as text frames, and the `ws` library hands every frame to the route as
// a Buffer. So a frame is a control message only if it decodes to a JSON
// object with a known `type`; anything else is raw terminal input. A leading
// 0x01 sentinel byte is still accepted for older clients.
// @see docs/phases/phase-ex8.md (found during the EX8 terminal restyle)

export type TerminalControl =
  | { type: 'resize'; rows: number; cols: number }
  | { type: 'get-buffer'; lastN?: number };

const OPEN_BRACE = 0x7b; // '{'
const SENTINEL = 0x01;

export function parseTerminalControl(data: Buffer | string): TerminalControl | null {
  let text: string;
  if (typeof data === 'string') {
    text = data;
  } else {
    if (data.length === 0) return null;
    const first = data[0];
    if (first !== OPEN_BRACE && first !== SENTINEL) return null; // cheap reject for keystrokes
    text = data.toString('utf8');
  }
  if (text.charCodeAt(0) === SENTINEL) text = text.slice(1);
  if (!text.startsWith('{')) return null;

  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return null; // e.g. the user typed or pasted a lone "{"
  }
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as { type?: unknown; rows?: unknown; cols?: unknown; lastN?: unknown };

  if (m.type === 'resize') {
    const rows = Number(m.rows);
    const cols = Number(m.cols);
    if (Number.isInteger(rows) && Number.isInteger(cols) && rows > 0 && cols > 0) {
      return { type: 'resize', rows, cols };
    }
    return null;
  }
  if (m.type === 'get-buffer') {
    const lastN = Number(m.lastN);
    return Number.isInteger(lastN) && lastN > 0 ? { type: 'get-buffer', lastN } : { type: 'get-buffer' };
  }
  return null;
}
