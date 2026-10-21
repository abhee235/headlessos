// EX9.2: Append-only audit log for change actions
// @see docs/phases/phase-ex9.md §7
//
// ~/.headlessos/audit/actions.jsonl — one JSON object per line, written with
// appendFile only. An entry is never rewritten: a decision is a new line that
// refers to the approval it answers. Past 10 MB the file is renamed to
// actions-<iso>.jsonl and a new one starts.

import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type AuditEvent = 'asked' | 'answered' | 'ran' | 'refused';

export interface AuditEntry {
  ts: string;
  event: AuditEvent;
  runId: string;
  approvalId?: string;
  serverId: string;
  loginUser?: string;
  actionId: string;
  risk: 'read' | 'change';
  command: string;
  reason?: string;
  decision?: 'allow' | 'deny';
  by?: 'owner' | 'stop' | 'timeout';
  exitCode?: number | null;
  durationMs?: number;
  error?: string;
}

export const DEFAULT_AUDIT_DIR = join(homedir(), '.headlessos', 'audit');
const FILE = 'actions.jsonl';

export class ActionAudit {
  private readonly dir: string;
  private readonly maxBytes: number;
  /** Writes are chained so lines land in the order they were logged. */
  private tail: Promise<void> = Promise.resolve();

  constructor(opts: { dir?: string; maxBytes?: number } = {}) {
    this.dir = opts.dir ?? DEFAULT_AUDIT_DIR;
    this.maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  }

  get path(): string {
    return join(this.dir, FILE);
  }

  /** Queue one entry. Never throws: a full disk must not break an agent run. */
  log(entry: Omit<AuditEntry, 'ts'>): Promise<void> {
    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;
    this.tail = this.tail.then(() => this.write(line)).catch((err) => {
      console.warn(`[ActionAudit] could not write the audit log: ${(err as Error).message}`);
    });
    return this.tail;
  }

  /** The newest `limit` entries of the current file, oldest first. */
  async recent(limit = 100): Promise<AuditEntry[]> {
    await this.tail;
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch {
      return [];
    }
    return text.split('\n').filter(Boolean).slice(-limit).flatMap((line) => {
      try { return [JSON.parse(line) as AuditEntry]; } catch { return []; }
    });
  }

  private async write(line: string): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    try {
      const { size } = await stat(this.path);
      if (size + Buffer.byteLength(line) > this.maxBytes) {
        await rename(this.path, join(this.dir, `actions-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`));
      }
    } catch {
      // no file yet
    }
    await appendFile(this.path, line, { encoding: 'utf8', mode: 0o600, flag: 'a' });
  }
}
