// EX8.9: Deterministic parsers for the Task Manager "Users" page
// @see docs/phases/phase-ex8.md (EX8.9 — Users)
//
// Accounts come from `getent passwd` (parsed by etc-passwd.ts), sessions from
// `who` (who.ts). Containers and minimal hosts often keep no utmp, so `who`
// prints nothing; then a session is any terminal that has processes on it.

import type { SystemUser, LoginSession } from '../schemas/serveradmin.js';
import type { TaskManagerAccount, TaskManagerSession } from '../schemas/taskmanager.js';

export interface TtyProcessRow {
  user: string;
  tty: string;
  /** seconds since the process started */
  etimes: number;
}

/** Shells that mean "cannot log in" */
const NO_LOGIN_SHELL = /(?:^|\/)(?:nologin|false|sync|shutdown|halt)$/;

/**
 * `kind` per the EX8.9 contract: uid 0 → admin; uid ≥ 1000 (not 65534,
 * nobody) with a login shell → standard; everything else → service.
 */
export function classifyAccount(uid: number, shell: string): TaskManagerAccount['kind'] {
  if (uid === 0) return 'admin';
  const loginShell = shell.trim() !== '' && !NO_LOGIN_SHELL.test(shell.trim());
  if (uid >= 1000 && uid !== 65534 && loginShell) return 'standard';
  return 'service';
}

export function toAccounts(users: SystemUser[]): TaskManagerAccount[] {
  const seen = new Set<string>();
  return users
    .filter((u) => (seen.has(u.username) ? false : (seen.add(u.username), true)))
    .map((u) => ({ name: u.username, uid: u.uid, shell: u.shell, kind: classifyAccount(u.uid, u.shell) }))
    .sort((a, b) => a.uid - b.uid || a.name.localeCompare(b.name));
}

/**
 * Parses `ps -eo user:32=,tty=,etimes=`, keeping processes that have a
 * terminal (`pts/0`, `tty1`, …; `?` means none).
 */
export function parseTtyProcessRows(raw: string): TtyProcessRow[] {
  const rows: TtyProcessRow[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(\S+)\s+(\S+)\s+(\d+)\s*$/);
    if (!m || m[2] === '?' || m[2] === '-') continue;
    rows.push({ user: m[1]!, tty: m[2]!, etimes: Number(m[3]) });
  }
  return rows;
}

/** Oldest process per terminal — its start is the login time, its owner the session user */
function oldestPerTty(rows: TtyProcessRow[]): Map<string, TtyProcessRow> {
  const out = new Map<string, TtyProcessRow>();
  for (const r of rows) {
    const cur = out.get(r.tty);
    if (!cur || r.etimes > cur.etimes) out.set(r.tty, r);
  }
  return out;
}

function isoSecondsAgo(nowMs: number, seconds: number): string {
  return new Date(Math.floor(nowMs / 1000) * 1000 - seconds * 1000).toISOString();
}

/**
 * Sessions from `who` when it lists any, else one per terminal with processes.
 * `loginAt` is now − the age of the oldest process on that terminal (who
 * prints wall-clock time without a zone, so it is not used); null when no
 * process is on it.
 */
export function buildSessions(who: LoginSession[], ttyRows: TtyProcessRow[], nowMs: number): TaskManagerSession[] {
  const oldest = oldestPerTty(ttyRows);
  const loginAt = (tty: string): string | null => {
    const r = oldest.get(tty);
    return r ? isoSecondsAgo(nowMs, r.etimes) : null;
  };

  if (who.length > 0) {
    return who.map((s) => ({
      user: s.user,
      tty: s.terminal,
      from: s.remoteHost ? s.remoteHost : null,
      loginAt: loginAt(s.terminal),
    }));
  }

  return [...oldest.values()]
    .sort((a, b) => b.etimes - a.etimes || a.tty.localeCompare(b.tty, undefined, { numeric: true }))
    .map((r) => ({ user: r.user, tty: r.tty, from: null, loginAt: isoSecondsAgo(nowMs, r.etimes) }));
}
