// EX9.1: helpers for writing catalog entries
// @see docs/phases/phase-ex9.md §1

import { z } from 'zod';
import { DEFAULT_MAX_OUTPUT, type ActionDef, type ActionParams } from '../types.js';

export const NO_PARAMS = z.object({}).strict();

type ReadInput<P extends ActionParams> =
  Omit<ActionDef<P>, 'risk' | 'timeoutMs' | 'maxOutputBytes' | 'params'> & {
    params?: P;
    timeoutMs?: number;
    maxOutputBytes?: number;
  };

/** A read action with the usual defaults: no params, 15 s, 64 KiB. */
export function readAction<P extends ActionParams = typeof NO_PARAMS>(input: ReadInput<P>): ActionDef<P> {
  return {
    ...input,
    risk: 'read',
    params: (input.params ?? NO_PARAMS) as P,
    timeoutMs: input.timeoutMs ?? 15_000,
    maxOutputBytes: input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT,
  };
}

type ChangeInput<P extends ActionParams> =
  Omit<ActionDef<P>, 'risk' | 'maxOutputBytes' | 'params' | 'run'> & {
    params: P;
    run: Extract<ActionDef<P>['run'], { kind: 'exec' }>;
    maxOutputBytes?: number;
  };

/** EX9.2: an action that changes the server; it runs only after the owner allows it. */
export function changeAction<P extends ActionParams>(input: ChangeInput<P>): ActionDef<P> {
  return { ...input, risk: 'change', maxOutputBytes: input.maxOutputBytes ?? 16 * 1024 };
}

/** Parse `--format '{{json .}}'` output (one JSON object per line) and keep chosen keys. */
export function jsonLines(keys: string[]) {
  return (stdout: string): Array<Record<string, unknown>> =>
    stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const row = JSON.parse(line) as Record<string, unknown>;
        return Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]));
      });
}
