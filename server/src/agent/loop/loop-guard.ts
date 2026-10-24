// EX9.4: Loop guard — notice a run going in circles, warn once, then stop it
// @see docs/phases/phase-ex9.md §9 (ported from an earlier agent project)
//
// Signals:
//  - the same call (tool + input) returning the same result again and again
//  - the same call made back to back several times
//  - the same opening sentence repeated across recent turns
// The first time a limit is crossed the model gets a warning. After that an
// identical back-to-back call is refused without running; refusing twice stops
// the run. A change action (or any call whose result keeps changing) clears the
// history: repeating a read after a change is productive.

import { createHash } from 'node:crypto';

export const SAME_RESULT_LIMIT = 3;
export const IN_A_ROW_LIMIT = 4;
export const NARRATION_LIMIT = 3;
export const NARRATION_WINDOW = 6;
export const REFUSED_LIMIT = 2;

export interface LoopFinding {
  kind: 'warn' | 'stop';
  rule: 'unchanged' | 'running' | 'narration' | 'refused';
  /** text appended for the model */
  message: string;
  tool?: string;
  times: number;
}

export interface FoldedCall {
  name: string;
  input: unknown;
  ok: boolean;
  output: string;
  /** a change action ran: earlier repeats no longer count */
  mutating?: boolean;
}

interface Entry {
  fingerprint: string;
  same: number;
  warned: boolean;
  runningWarned: boolean;
  refused: number;
}

export class LoopGuard {
  private readonly entries = new Map<string, Entry>();
  private lastCall: string | null = null;
  private inARow = 0;
  private openings: string[] = [];
  private narrationWarned = false;

  /** Before running: an identical back-to-back repeat of a call already warned about. */
  blocked(name: string, input: unknown): boolean {
    const key = callKey(name, input);
    if (!key || key !== this.lastCall) return false;
    const entry = this.entries.get(key);
    return !!entry && entry.warned && entry.same >= SAME_RESULT_LIMIT;
  }

  /** A blocked call was refused; refusing it twice ends the run. */
  refused(name: string, input: unknown): LoopFinding {
    const key = callKey(name, input) ?? name;
    const entry = this.entries.get(key) ?? { fingerprint: '', same: 0, warned: true, runningWarned: false, refused: 0 };
    entry.refused++;
    this.entries.set(key, entry);
    const times = entry.same + entry.refused;
    return entry.refused >= REFUSED_LIMIT
      ? { kind: 'stop', rule: 'refused', tool: name, times, message: stopMessage(name) }
      : { kind: 'warn', rule: 'refused', tool: name, times, message: refusedMessage(name, times) };
  }

  /** After a turn's tools ran: update the history and report crossed limits. */
  fold(calls: FoldedCall[]): LoopFinding[] {
    if (calls.some((c) => c.mutating)) {
      this.entries.clear();
      this.lastCall = null;
      this.inARow = 0;
    }
    const findings: LoopFinding[] = [];
    for (const call of calls) {
      if (call.mutating) continue;
      const key = callKey(call.name, call.input);
      if (!key) continue;
      const fingerprint = hash(`${call.ok ? 'ok' : 'error'}\n${call.output}`);
      const prev = this.entries.get(key);
      const entry: Entry = prev && prev.fingerprint === fingerprint
        ? { ...prev, same: prev.same + 1 }
        : { fingerprint, same: 1, warned: prev?.warned ?? false, runningWarned: false, refused: prev?.refused ?? 0 };
      this.inARow = key === this.lastCall ? this.inARow + 1 : 1;
      this.lastCall = key;

      if (entry.same >= SAME_RESULT_LIMIT * 2 && entry.warned) {
        findings.push({ kind: 'stop', rule: 'unchanged', tool: call.name, times: entry.same, message: stopMessage(call.name) });
      } else if (entry.same >= SAME_RESULT_LIMIT && !entry.warned) {
        entry.warned = true;
        findings.push({ kind: 'warn', rule: 'unchanged', tool: call.name, times: entry.same, message: unchangedMessage(call.name, entry.same) });
      } else if (this.inARow >= IN_A_ROW_LIMIT && !entry.runningWarned) {
        entry.runningWarned = true;
        findings.push({ kind: 'warn', rule: 'running', tool: call.name, times: this.inARow, message: runningMessage(call.name, this.inARow) });
      }
      if (this.inARow < IN_A_ROW_LIMIT) entry.runningWarned = false;
      this.entries.set(key, entry);
    }
    return findings;
  }

  /** The same opening sentence again and again: warn once, then stop. */
  foldNarration(text: string): LoopFinding | null {
    const opening = text.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 120);
    if (opening.length < 40) return null;
    const recent = this.openings.slice(-(NARRATION_WINDOW - 1));
    const times = recent.filter((o) => o === opening).length + 1;
    this.openings.push(opening);
    if (times < NARRATION_LIMIT) return null;
    this.openings = [];
    if (this.narrationWarned) {
      return { kind: 'stop', rule: 'narration', times, message: stopMessage() };
    }
    this.narrationWarned = true;
    return {
      kind: 'warn', rule: 'narration', times,
      message: 'You are repeating the same message without making progress. Change your approach: use what you already found, try a different tool, or give your answer.',
    };
  }
}

function callKey(name: string, input: unknown): string | null {
  try {
    return `${name}:${JSON.stringify(input ?? {})}`;
  } catch {
    return null;
  }
}

function hash(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function unchangedMessage(tool: string, times: number): string {
  return `You have called ${tool} with the same input ${times} times and got the same result. Running it again will not tell you anything new. Use what you have, try a different tool or different parameters, or give your answer.`;
}

function runningMessage(tool: string, times: number): string {
  return `You have called ${tool} ${times} times in a row. If the result is what you need, move on; otherwise try something different.`;
}

function refusedMessage(tool: string, times: number): string {
  return `Not run: ${tool} with this input already returned the same result ${times - 1} times. Take another way, or give your answer.`;
}

/** Appended when the run stops; the next turn has tools off. */
export function stopMessage(tool?: string): string {
  return `You are stuck${tool ? ` repeating ${tool}` : ''}. Stop calling tools. Tell the owner what you tried, what you found, what failed, and how they could continue.`;
}
