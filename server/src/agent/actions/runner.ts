// EX9.1: Action runner — the only way an agent touches a server
// @see docs/phases/phase-ex9.md §4, docs/DECISIONS.md (ADR-024)
//
// look up → validate (strict Zod, short model-facing errors) → build argv → quote
// → risk gate → run inside a grant (CommandPolicy lets exactly this command through)
// → cap output → parse.

import type { ZodError } from 'zod';
import type { SFTPWrapper } from 'ssh2';
import type { ConnectionManager } from '../../ssh/connection-manager.js';
import { withGrant } from '../../services/policy/agent-scope.js';
import { sanitizeErrorMessage } from '../../security/validators.js';
import { ActionCatalog, getDefaultCatalog } from './catalog/index.js';
import { ArgvError, toCommand } from './quote.js';
import { isSecretPath, isUnderRoot, READ_ROOTS } from './params.js';
import { MAX_STDERR, type ActionDef, type ActionRunResult } from './types.js';

export type ActionSsh = Pick<ConnectionManager, 'exec' | 'getSftp'>;

export interface RunOptions {
  /** agent run id (audit / approvals) */
  runId?: string;
  /** EX5 sandbox container; cli_* actions run inside it when set */
  sandboxContainer?: string;
  signal?: AbortSignal;
}

type Validated =
  | { ok: true; def: ActionDef; params: Record<string, unknown> }
  | { ok: false; error: string };

export class ActionRunner {
  readonly catalog: ActionCatalog;
  private readonly ssh: ActionSsh;

  constructor(deps: { ssh: ActionSsh; catalog?: ActionCatalog }) {
    this.ssh = deps.ssh;
    this.catalog = deps.catalog ?? getDefaultCatalog();
  }

  /** Look up an action and check its parameters. Never throws. */
  validate(actionId: string, rawParams: unknown): Validated {
    const def = this.catalog.get(actionId);
    if (!def) {
      return { ok: false, error: `No such action: ${String(actionId)}. Closest: ${this.catalog.closest(actionId).join(', ')}` };
    }
    const parsed = def.params.safeParse(dropNulls(rawParams));
    if (!parsed.success) return { ok: false, error: describeParamError(def, parsed.error, rawParams) };
    return { ok: true, def, params: parsed.data as Record<string, unknown> };
  }

  /** The exact command an action would run (or the SFTP path it would read). */
  preview(actionId: string, rawParams: unknown, opts: Pick<RunOptions, 'sandboxContainer'> = {}):
    { ok: true; def: ActionDef; params: Record<string, unknown>; command: string } | { ok: false; error: string } {
    const v = this.validate(actionId, rawParams);
    if (!v.ok) return v;
    try {
      return { ok: true, def: v.def, params: v.params, command: describeCommand(v.def, v.params, opts.sandboxContainer) };
    } catch (err) {
      return { ok: false, error: err instanceof ArgvError ? `${actionId}: ${err.message}` : 'could not build the command' };
    }
  }

  async run(serverId: string, actionId: string, rawParams: unknown, opts: RunOptions = {}): Promise<ActionRunResult> {
    const started = Date.now();
    const fail = (error: string, command = ''): ActionRunResult => ({
      ok: false, actionId: String(actionId), command, exitCode: null, stdout: '', stderr: '',
      truncated: false, durationMs: Date.now() - started, error,
    });

    const p = this.preview(actionId, rawParams, opts);
    if (!p.ok) return fail(p.error);
    const { def, params, command } = p;

    if (def.risk === 'change') {
      // EX9.2 adds the approval gate; until then nothing may change a server
      return fail(`${def.id} changes the server and needs the owner's approval, which is not available yet.`, command);
    }
    if (opts.signal?.aborted) return fail('Stopped before running.', command);

    try {
      if (def.run.kind === 'sftp-read') {
        return await this.readFile(serverId, def, params, started);
      }
      const res = await withGrant({ kind: 'exec', actionId: def.id, command }, () =>
        this.ssh.exec(serverId, command, def.timeoutMs),
      );
      const out = capText(res.stdout, def.maxOutputBytes, def.keep ?? 'head');
      const ok = (def.okExitCodes ?? [0]).includes(res.exitCode);
      return {
        ok,
        actionId: def.id,
        command,
        exitCode: res.exitCode,
        stdout: out.text,
        stderr: capText(res.stderr, MAX_STDERR, 'tail').text,
        truncated: out.truncated,
        ...(def.parse && ok ? tryParse(def, res.stdout) : {}),
        durationMs: Date.now() - started,
        ...(ok ? {} : { error: `exit code ${res.exitCode}` }),
      };
    } catch (err) {
      return fail(sanitizeErrorMessage(err instanceof Error ? err.message : String(err)), command);
    }
  }

  private async readFile(serverId: string, def: ActionDef, params: Record<string, unknown>, started: number): Promise<ActionRunResult> {
    if (def.run.kind !== 'sftp-read') throw new Error('not an sftp action');
    const path = def.run.path(params);
    const maxBytes = def.run.maxBytes(params);
    const tailLines = def.run.tailLines?.(params);
    const command = describeCommand(def, params);

    const sftp = await withGrant({ kind: 'sftp', actionId: def.id, path }, () => this.ssh.getSftp(serverId));
    // A symlink under an allowed root must not lead somewhere secret
    const real = await sftpCall<string>((cb) => sftp.realpath(path, cb));
    if (!isUnderRoot(real, READ_ROOTS) || isSecretPath(real)) {
      return {
        ok: false, actionId: def.id, command, exitCode: null, stdout: '', stderr: '', truncated: false,
        durationMs: Date.now() - started, error: `${path} resolves to ${real}, which agents cannot read`,
      };
    }
    const stats = await sftpCall<{ size: number; isDirectory(): boolean }>((cb) => sftp.stat(real, cb));
    if (stats.isDirectory()) {
      return {
        ok: false, actionId: def.id, command, exitCode: null, stdout: '', stderr: '', truncated: false,
        durationMs: Date.now() - started, error: `${path} is a directory; use dir_list`,
      };
    }
    const size = stats.size;
    const start = tailLines ? Math.max(0, size - maxBytes) : 0;
    const length = Math.min(size - start, maxBytes);
    let text = length > 0 ? await readRange(sftp, real, start, length) : '';
    let truncated = tailLines ? start > 0 : size > maxBytes;
    if (tailLines) {
      const lines = text.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      if (start > 0) lines.shift(); // first line is probably cut
      if (lines.length > tailLines) truncated = true;
      text = lines.slice(-tailLines).join('\n') + (lines.length ? '\n' : '');
    }
    return {
      ok: true, actionId: def.id, command, exitCode: 0, stdout: text, stderr: '', truncated,
      durationMs: Date.now() - started,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────

/** Models often send `null` for a parameter they mean to leave out; treat it as absent. */
function dropNulls(raw: unknown): unknown {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => v !== null));
}

function describeCommand(def: ActionDef, params: Record<string, unknown>, sandboxContainer?: string): string {
  if (def.run.kind === 'sftp-read') {
    const lines = def.run.tailLines?.(params);
    return lines ? `sftp: last ${lines} lines of ${def.run.path(params)}` : `sftp: read ${def.run.path(params)}`;
  }
  const inSandbox = def.category === 'cli' ? sandboxContainer : undefined;
  return toCommand(def.run.build(params), { sudo: def.run.sudo && !inSandbox, sandboxContainer: inSandbox });
}

function tryParse(def: ActionDef, stdout: string): { data?: unknown } {
  try {
    return { data: def.parse!(stdout) };
  } catch {
    return {}; // the model gets the raw text instead
  }
}

/** Keep at most `maxBytes` of text from the head or the tail. */
export function capText(text: string, maxBytes: number, keep: 'head' | 'tail'): { text: string; truncated: boolean } {
  const buf = Buffer.from(text ?? '', 'utf8');
  if (buf.length <= maxBytes) return { text: text ?? '', truncated: false };
  const slice = keep === 'head' ? buf.subarray(0, maxBytes) : buf.subarray(buf.length - maxBytes);
  return { text: slice.toString('utf8'), truncated: true };
}

function sftpCall<T>(fn: (cb: (err: Error | undefined | null, value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => fn((err, value) => (err ? reject(err) : resolve(value))));
}

function readRange(sftp: SFTPWrapper, path: string, start: number, length: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = sftp.createReadStream(path, { start, end: start + length - 1 });
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/** `service_status(unit: systemd unit, e.g. nginx; lines?: number of lines, 1–100 (default 20))` */
export function actionSignature(def: ActionDef): string {
  const shape = def.params.shape as Record<string, { isOptional(): boolean; description?: string }>;
  const fields = Object.entries(shape).map(([key, schema]) => {
    const opt = schema.isOptional() ? '?' : '';
    return schema.description ? `${key}${opt}: ${schema.description}` : `${key}${opt}`;
  });
  return `${def.id}(${fields.join('; ')})`;
}

/**
 * Short, model-facing parameter errors: at most three problems, each
 * "field: expected …, you sent …", then the action's signature.
 */
export function describeParamError(def: ActionDef, error: ZodError, raw: unknown): string {
  const problems = error.issues.slice(0, 3).map((issue) => {
    const field = issue.path.join('.') || 'params';
    if (issue.code === 'unrecognized_keys') return `unknown parameter(s) ${issue.keys.join(', ')}`;
    const sent = describeValue(valueAt(raw, issue.path));
    if (issue.code === 'invalid_type') {
      return sent === 'nothing' ? `${field}: required (${issue.expected})` : `${field}: expected ${issue.expected}, you sent ${sent}`;
    }
    const message = issue.message.startsWith('expected') ? issue.message : `expected ${lowerFirst(issue.message)}`;
    return `${field}: ${message}, you sent ${sent}`;
  });
  return `${def.id}: ${problems.join('; ')}. Parameters: ${actionSignature(def)}`;
}

function valueAt(raw: unknown, path: (string | number)[]): unknown {
  let cur: unknown = raw;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

function describeValue(value: unknown): string {
  if (value === undefined) return 'nothing';
  const text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function lowerFirst(s: string): string {
  return s ? s[0]!.toLowerCase() + s.slice(1) : s;
}
