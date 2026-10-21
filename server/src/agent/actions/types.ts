// EX9.1: Action catalog — types
// @see docs/phases/phase-ex9.md §1, docs/DECISIONS.md (ADR-024)
//
// An action is code, not text: the model picks an id and parameters, the server
// validates them, builds argv, quotes it, runs it and caps the output.

import type { z } from 'zod';

export type ActionRisk = 'read' | 'change';

export const ACTION_CATEGORIES = [
  'system', 'disk', 'process', 'network', 'service', 'logs',
  'docker', 'packages', 'web', 'security', 'cron', 'files', 'cli',
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

// The params of an action are always a strict object of bounded fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionParams = z.ZodObject<any>;

export type ActionRun<P extends ActionParams> =
  | {
      kind: 'exec';
      /** argv; argv[0] is a literal program name written in code */
      build(params: z.infer<P>): string[];
      /** prefix `sudo -n` (never prompts) */
      sudo?: boolean;
    }
  | {
      /** read a file over SFTP; the resolved real path is re-checked against the read rules */
      kind: 'sftp-read';
      path(params: z.infer<P>): string;
      maxBytes(params: z.infer<P>): number;
      /** read from the end and keep only the last N lines (log tails) */
      tailLines?(params: z.infer<P>): number;
    };

export interface ActionDef<P extends ActionParams = ActionParams> {
  /** snake_case; also a valid native tool name */
  id: string;
  title: string;
  /** one line, ≤ 120 chars, written for the model */
  description: string;
  category: ActionCategory;
  risk: ActionRisk;
  params: P;
  run: ActionRun<P>;
  /**
   * Optional parser. When present, the model sees its result (compact JSON)
   * instead of raw stdout — used where that is smaller or safer (e.g. it drops
   * container environment variables).
   */
  parse?(stdout: string): unknown;
  timeoutMs: number;
  maxOutputBytes: number;
  /** which end of stdout to keep when it passes maxOutputBytes (logs keep the tail) */
  keep?: 'head' | 'tail';
  /** exit codes that still count as success (default [0]); e.g. `systemctl status` → 3 when inactive */
  okExitCodes?: number[];
  /** extra words that should select this action for a request (EX9.1 selection) */
  keywords?: string[];
  /** EX9.3: other names models use for a parameter, e.g. { unit: ['daemon'] } */
  aliases?: Record<string, string[]>;
}

/** Identity helper that keeps the params type flowing into build()/path(). */
export function defineAction<P extends ActionParams>(def: ActionDef<P>): ActionDef<P> {
  return def;
}

export interface ActionRunResult {
  ok: boolean;
  actionId: string;
  /** exactly what ran, or would have run; empty when validation failed */
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  /** parse() result, when the action has a parser and it succeeded */
  data?: unknown;
  durationMs: number;
  /** short, model-facing reason when ok is false */
  error?: string;
  /** EX9.2: set for change actions — what the owner decided */
  approval?: { approvalId: string; decision: 'allow' | 'deny'; by: 'owner' | 'stop' | 'timeout' };
}

export const DEFAULT_MAX_OUTPUT = 64 * 1024;
export const MAX_STDERR = 4 * 1024;
export const MAX_TIMEOUT_MS = 60_000;
/** EX9.2: change actions may run longer (package installs) */
export const MAX_CHANGE_TIMEOUT_MS = 600_000;
