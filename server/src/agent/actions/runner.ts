// EX9.1: Action runner — the only way an agent touches a server
// @see docs/phases/phase-ex9.md §4, docs/DECISIONS.md (ADR-024)
//
// look up → validate (strict Zod, short model-facing errors) → build argv → quote
// → risk gate (EX9.2: change actions wait for the owner) → run inside a grant
// (CommandPolicy lets exactly this command through) → cap output → parse.

import { z, type ZodError } from 'zod';
import type { SFTPWrapper } from 'ssh2';
import type { ConnectionManager } from '../../ssh/connection-manager.js';
import { runAsAgent, withGrant } from '../../services/policy/agent-scope.js';
import { sanitizeErrorMessage } from '../../security/validators.js';
import { ActionCatalog, getDefaultCatalog } from './catalog/index.js';
import { ArgvError, toCommand } from './quote.js';
import { callParams, isSecretPath, isUnderRoot, READ_ROOTS } from './params.js';
import { MAX_STDERR, type ActionDef, type ActionRunResult } from './types.js';
import type { ApprovalBy, ApprovalGate, ApprovalOutcome, ApprovalRequest, ApprovalTicket } from './approvals.js';
import type { ActionAudit } from './audit.js';
import { normalizeKeys } from '../loop/tool-input.js';
import { redactSecrets } from './redact.js';

export type ActionSsh = Pick<ConnectionManager, 'exec' | 'getSftp'>;

/** Who and where, for the approval card and the audit log. */
export interface ServerIdentity {
  name: string;
  host: string;
  /** the SSH login user commands run as */
  username: string;
}

export type ApprovalEvent =
  | { type: 'approval_required'; request: ApprovalRequest }
  | ({ type: 'approval_resolved' } & ApprovalOutcome);

export interface RunOptions {
  /** agent run id (audit / approvals) */
  runId?: string;
  /** EX5 sandbox container; cli_* actions run inside it when set */
  sandboxContainer?: string;
  signal?: AbortSignal;
  /** EX9.2: approval cards for change actions go out through this */
  onApproval?: (event: ApprovalEvent) => void;
  /**
   * EX9.2: this run may propose changes (each still waits for the owner). Off by
   * default, so a read-only run refuses a change action even if a model names it.
   */
  allowChange?: boolean;
}

export interface RunnerDeps {
  ssh: ActionSsh;
  catalog?: ActionCatalog;
  /** EX9.2: without a gate, change actions are refused */
  approvals?: ApprovalGate;
  audit?: ActionAudit;
  describeServer?: (serverId: string) => ServerIdentity | undefined;
}

/** What the model is told when a change does not happen. Directive on purpose. */
export function denialMessage(by: ApprovalBy): string {
  switch (by) {
    case 'owner':
      return 'The owner declined this change on the approval card. That is a deliberate decision, not an error: do not retry it or look for another way to make the same change. Tell the owner what you would have done and why, then finish.';
    case 'stop':
      return 'The owner stopped the run before answering, so the change was not made. Do not retry it.';
    case 'timeout':
      return 'Nobody answered the approval request in time, so the change was not made. Do not retry it; tell the owner what you would have done.';
  }
}

type Validated =
  | { ok: true; def: ActionDef; params: Record<string, unknown> }
  | { ok: false; error: string };

export class ActionRunner {
  readonly catalog: ActionCatalog;
  private readonly ssh: ActionSsh;
  private readonly approvals?: ApprovalGate;
  private readonly audit?: ActionAudit;
  private readonly describeServer?: RunnerDeps['describeServer'];

  constructor(deps: RunnerDeps) {
    this.ssh = deps.ssh;
    this.catalog = deps.catalog ?? getDefaultCatalog();
    this.approvals = deps.approvals;
    this.audit = deps.audit;
    this.describeServer = deps.describeServer;
  }

  /** Who and where a server is, for approval cards. */
  identify(serverId: string): ServerIdentity {
    return this.describeServer?.(serverId) ?? { name: serverId, host: '', username: '' };
  }

  /** Look up an action and check its parameters. Never throws. */
  validate(actionId: string, rawParams: unknown): Validated {
    const def = this.catalog.get(actionId);
    if (!def) {
      return { ok: false, error: `No such action: ${String(actionId)}. Closest: ${this.catalog.closest(actionId).join(', ')}` };
    }
    const schema = callParams(def);
    const raw = dropNulls(rawParams);
    const parsed = schema.safeParse(coerceAsMeant(schema, raw));
    if (parsed.success) return { ok: true, def, params: parsed.data as Record<string, unknown> };
    // EX9.3: wrong parameter names → the right ones, then one more try
    const renamed = normalizeKeys(raw, Object.keys(schema.shape), def.aliases);
    if (renamed) {
      const again = schema.safeParse(coerceAsMeant(schema, renamed));
      if (again.success) return { ok: true, def, params: again.data as Record<string, unknown> };
      return { ok: false, error: describeParamError(def, again.error, renamed) };
    }
    return { ok: false, error: describeParamError(def, parsed.error, rawParams) };
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

    if (opts.signal?.aborted) return fail('Stopped before running.', command);
    if (def.risk === 'change') return this.runChange(serverId, def, params, command, opts, started);

    if (def.run.kind === 'sftp-read') {
      try {
        return await this.readFile(serverId, def, params, started);
      } catch (err) {
        return fail(sanitizeErrorMessage(err instanceof Error ? err.message : String(err)), command);
      }
    }
    return this.execGranted(serverId, def, command, started);
  }

  /**
   * EX9.2: run a staged view action the owner allowed. The ticket comes from
   * ApprovalGate.take() and works once; the command is the one recorded at preview.
   */
  async runApproved(ticket: ApprovalTicket): Promise<ActionRunResult> {
    const started = Date.now();
    const base = { actionId: ticket.actionId, command: ticket.command, exitCode: null, stdout: '', stderr: '', truncated: false };
    if (!this.approvals?.redeem(ticket)) {
      return { ...base, ok: false, durationMs: 0, error: 'This approval was already used or is not valid.' };
    }
    const p = this.preview(ticket.actionId, ticket.params);
    if (!p.ok || p.command !== ticket.command || p.def.risk !== 'change') {
      return { ...base, ok: false, durationMs: 0, error: 'The recorded command no longer matches the action; preview it again.' };
    }
    const def = p.def;
    const result = await runAsAgent({ runId: ticket.runId, agent: 'view-action' }, () =>
      this.execGranted(ticket.serverId, def, ticket.command, started),
    );
    this.logRan(ticket.serverId, ticket.runId, ticket.approvalId, def, ticket.command, result);
    return { ...result, approval: { approvalId: ticket.approvalId, decision: 'allow', by: 'owner' } };
  }

  /** Change action inside an agent run: park on the gate, run only on allow. */
  private async runChange(
    serverId: string, def: ActionDef, params: Record<string, unknown>, command: string,
    opts: RunOptions, started: number,
  ): Promise<ActionRunResult> {
    const fail = (error: string, approval?: ActionRunResult['approval']): ActionRunResult => ({
      ok: false, actionId: def.id, command, exitCode: null, stdout: '', stderr: '', truncated: false,
      durationMs: Date.now() - started, error, ...(approval ? { approval } : {}),
    });
    if (!opts.allowChange) {
      return fail(`${def.id} changes the server, and this run is read-only. Use read actions and suggest the change in your answer instead.`);
    }
    const gate = this.approvals;
    if (!gate) {
      return fail(`${def.id} changes the server and needs the owner's approval, which this agent cannot ask for. Use read-only actions.`);
    }
    const runId = opts.runId ?? 'no-run';
    const server = this.identify(serverId);
    const onAbort = () => gate.cancelRun(runId);
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    let outcome: ApprovalOutcome;
    try {
      outcome = await gate.request(
        {
          runId, serverId, serverName: server.name, host: server.host, loginUser: server.username,
          actionId: def.id, title: def.title, command, reason: String(params.reason ?? ''),
        },
        (request) => opts.onApproval?.({ type: 'approval_required', request }),
      );
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
    }
    opts.onApproval?.({ type: 'approval_resolved', ...outcome });
    const approval = { approvalId: outcome.approvalId, decision: outcome.decision, by: outcome.by };
    if (outcome.decision !== 'allow') return fail(denialMessage(outcome.by), approval);

    const result = await this.execGranted(serverId, def, command, started);
    this.logRan(serverId, runId, outcome.approvalId, def, command, result);
    return { ...result, approval };
  }

  /** Run one built command inside its grant, then cap and parse. Never throws. */
  private async execGranted(serverId: string, def: ActionDef, command: string, started: number): Promise<ActionRunResult> {
    try {
      const res = await withGrant({ kind: 'exec', actionId: def.id, command }, () =>
        this.ssh.exec(serverId, command, def.timeoutMs, { maxBytes: channelCap(def) }),
      );
      const out = capText(res.stdout, def.maxOutputBytes, def.keep ?? 'head');
      const ok = (def.okExitCodes ?? [0]).includes(res.exitCode);
      // EX9.5: no secret leaves the runner
      const stdout = redactSecrets(out.text);
      const stderr = redactSecrets(capText(res.stderr, MAX_STDERR, 'tail').text);
      const redacted = stdout.count + stderr.count;
      return {
        ok,
        actionId: def.id,
        command,
        exitCode: res.exitCode,
        stdout: stdout.text,
        stderr: stderr.text,
        ...(redacted ? { redacted } : {}),
        truncated: out.truncated || !!res.truncated,
        ...(def.parse && ok && !res.truncated ? tryParse(def, res.stdout) : {}),
        durationMs: Date.now() - started,
        ...(ok ? {} : { error: `exit code ${res.exitCode}` }),
      };
    } catch (err) {
      return {
        ok: false, actionId: def.id, command, exitCode: null, stdout: '', stderr: '', truncated: false,
        durationMs: Date.now() - started, error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
      };
    }
  }

  private logRan(serverId: string, runId: string, approvalId: string, def: ActionDef, command: string, result: ActionRunResult): void {
    void this.audit?.log({
      event: 'ran', runId, approvalId, serverId, loginUser: this.identify(serverId).username, actionId: def.id,
      risk: def.risk, command, exitCode: result.exitCode, durationMs: result.durationMs,
      ...(result.ok ? {} : { error: result.error }),
    });
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
    const clean = redactSecrets(text); // EX9.5
    return {
      ok: true, actionId: def.id, command, exitCode: 0, stdout: clean.text, stderr: '', truncated,
      ...(clean.count ? { redacted: clean.count } : {}),
      durationMs: Date.now() - started,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────

/**
 * EX9.4: bytes collected from the SSH channel before it is closed. Actions that
 * keep the tail (logs) bound their own output by lines, so they get more room.
 */
export function channelCap(def: ActionDef): number {
  return def.keep === 'tail' ? 4 * 1024 * 1024 : Math.max(4 * def.maxOutputBytes, 256 * 1024);
}

/** The schema under optional/default/nullable/effects wrappers. */
function baseType(schema: z.ZodTypeAny): z.ZodTypeAny {
  let cur = schema;
  for (;;) {
    if (cur instanceof z.ZodOptional || cur instanceof z.ZodNullable) cur = cur.unwrap();
    else if (cur instanceof z.ZodDefault) cur = cur._def.innerType;
    else if (cur instanceof z.ZodEffects) cur = cur._def.schema;
    else return cur;
  }
}

/**
 * Strings that plainly mean a number or a boolean become one: generated view
 * buttons fill params from table cells (always text), and models write "10".
 */
function coerceAsMeant(schema: z.AnyZodObject, raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string' || !shape[key]) continue;
    const type = baseType(shape[key]!);
    const text = value.trim();
    if (type instanceof z.ZodNumber && /^-?\d+(\.\d+)?$/.test(text)) out[key] = Number(text);
    else if (type instanceof z.ZodBoolean && /^(true|false)$/i.test(text)) out[key] = text.toLowerCase() === 'true';
    else if (type instanceof z.ZodArray) {
      // EX9.3: '["backup"]' or 'backup snapshots' for a list of words
      if (text.startsWith('[')) {
        try { out[key] = JSON.parse(text); } catch { /* leave it for the error message */ }
      } else if (text) {
        out[key] = text.split(/\s+/);
      }
    } else if (type instanceof z.ZodObject && text.startsWith('{')) {
      try { out[key] = JSON.parse(text); } catch { /* leave it */ }
    }
  }
  return out;
}

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
  const shape = callParams(def).shape as Record<string, { isOptional(): boolean; description?: string }>;
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
