// EX9.4: Loop guard — notice a run going in circles, warn once, then stop it
// EX10.11: "back to back" is any call of the previous turn; the way out is the agent's own
// @see docs/phases/phase-ex9.md §9 (ported from an earlier agent project), docs/phases/phase-ex10.md §8c
//
// Signals:
//  - the same call (tool + input) returning the same result again and again
//  - the same call made back to back several times
//  - the same opening sentence repeated across recent turns
// The first time a limit is crossed the model gets a warning. After that an
// identical call repeated from the previous turn is refused without running;
// refusing twice stops the run. A change action (or any call whose result keeps changing) clears the
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

export interface LoopGuardOptions {
  /** how this agent finishes, for the messages: "give your answer" (default) */
  finish?: string;
}

export class LoopGuard {
  private readonly entries = new Map<string, Entry>();
  private readonly finish: string;
  private lastCall: string | null = null;
  private inARow = 0;
  /** EX10.11: calls (run or refused) of the previous turn and of this one */
  private previousTurn = new Set<string>();
  private thisTurn = new Set<string>();
  private openings: string[] = [];
  private narrationWarned = false;

  constructor(opts: LoopGuardOptions = {}) {
    this.finish = opts.finish ?? 'give your answer';
  }

  /**
   * EX10.11 follow-up: compaction trimmed or dropped tool results, and the model was told to
   * run a call again if it needs the output; a repeat now is not going in circles.
   */
  reset(): void {
    this.entries.clear();
    this.lastCall = null;
    this.inARow = 0;
    this.previousTurn = new Set();
    this.thisTurn = new Set();
  }

  /** Before running: a call already warned about, made again right after the turn it was made in. */
  blocked(name: string, input: unknown): boolean {
    const key = callKey(name, input);
    if (!key || !this.previousTurn.has(key)) return false;
    const entry = this.entries.get(key);
    return !!entry && entry.warned && entry.same >= SAME_RESULT_LIMIT;
  }

  /** A blocked call was refused; refusing it twice ends the run. */
  refused(name: string, input: unknown): LoopFinding {
    const key = callKey(name, input) ?? name;
    const entry = this.entries.get(key) ?? { fingerprint: '', same: 0, warned: true, runningWarned: false, refused: 0 };
    entry.refused++;
    this.entries.set(key, entry);
    this.thisTurn.add(key);
    const times = entry.same + entry.refused;
    return entry.refused >= REFUSED_LIMIT
      ? { kind: 'stop', rule: 'refused', tool: name, times, message: stopMessage(name) }
      : { kind: 'warn', rule: 'refused', tool: name, times, message: refusedMessage(name, times, this.finish) };
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
      this.thisTurn.add(key);
      const fingerprint = hash(`${call.ok ? 'ok' : 'error'}\n${call.output}`);
      const prev = this.entries.get(key);
      const entry: Entry = prev && prev.fingerprint === fingerprint
        ? { ...prev, same: prev.same + 1 }
        // EX10.11: a changed result does not re-arm the in-a-row nudge; breaking the streak does (below)
        : { fingerprint, same: 1, warned: prev?.warned ?? false, runningWarned: prev?.runningWarned ?? false, refused: prev?.refused ?? 0 };
      this.inARow = key === this.lastCall ? this.inARow + 1 : 1;
      this.lastCall = key;

      if (entry.same >= SAME_RESULT_LIMIT * 2 && entry.warned) {
        findings.push({ kind: 'stop', rule: 'unchanged', tool: call.name, times: entry.same, message: stopMessage(call.name) });
      } else if (entry.same >= SAME_RESULT_LIMIT && !entry.warned) {
        entry.warned = true;
        findings.push({ kind: 'warn', rule: 'unchanged', tool: call.name, times: entry.same, message: unchangedMessage(call.name, entry.same, this.finish) });
      } else if (this.inARow >= IN_A_ROW_LIMIT && !entry.runningWarned) {
        entry.runningWarned = true;
        findings.push({ kind: 'warn', rule: 'running', tool: call.name, times: this.inARow, message: runningMessage(call.name, this.inARow) });
      }
      if (this.inARow < IN_A_ROW_LIMIT) entry.runningWarned = false;
      this.entries.set(key, entry);
    }
    this.previousTurn = this.thisTurn;
    this.thisTurn = new Set();
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
      message: `You are repeating the same message without making progress. Change your approach: use what you already found, try a different tool, or ${this.finish}.`,
    };
  }
}

/** EX10.11: verbs of a next step ("Let me check …", "I'll run …") */
const ANNOUNCES = /\b(?:let me|let's|i'll|i will|i am going to|i'm going to|i need to)\s+(?:now\s+|first\s+|next\s+|also\s+|then\s+)?(?:check|look|run|inspect|examine|see|get|fetch|read|list|query|investigate|search|find|verify|gather|review|analy[sz]e|try|call|open|pull|collect|start|dig|use)\b/i;

/** EX10.11: the reply's last sentence says what the model will do next, so it is not an answer. */
export function announcesStep(text: string): boolean {
  const sentences = text.trim().split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  return ANNOUNCES.test(sentences[sentences.length - 1] ?? '');
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

function unchangedMessage(tool: string, times: number, finish: string): string {
  return `You have called ${tool} with the same input ${times} times and got the same result. Running it again will not tell you anything new. Use what you have, try a different tool or different parameters, or ${finish}.`;
}

function runningMessage(tool: string, times: number): string {
  return `You have called ${tool} ${times} times in a row. If the result is what you need, move on; otherwise try something different.`;
}

function refusedMessage(tool: string, times: number, finish: string): string {
  return `Not run: ${tool} with this input already returned the same result ${times - 1} times. Take another way, or ${finish}.`;
}

/** Appended when the run stops; the next turn has tools off. */
export function stopMessage(tool?: string): string {
  return `You are stuck${tool ? ` repeating ${tool}` : ''}. Stop calling tools. Tell the owner what you tried, what you found, what failed, and how they could continue.`;
}
