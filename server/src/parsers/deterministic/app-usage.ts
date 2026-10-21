// EX8.9: Deterministic parsers for the Task Manager "App history" page
// @see docs/phases/phase-ex8.md (EX8.9 — App history)
//
// Linux keeps no history of exited programs, so "App history" is per-command
// totals for the processes running now: CPU seconds since each started,
// resident memory, instance count and storage I/O from /proc/<pid>/io.

import type { AppUsage } from '../schemas/taskmanager.js';

export interface AppProcessRow {
  pid: number;
  ppid: number;
  cpuSeconds: number;
  rssKb: number;
  user: string;
  comm: string;
}

export interface ProcIo {
  readBytes: number;
  writeBytes: number;
}

/** Commands HeadlessOS itself runs to fill its pages; hidden when run by the SSH user */
export const PROBE_COMMANDS = new Set(['ps', 'grep', 'cat', 'id']);

/**
 * Parses `ps -eo pid=,ppid=,cputimes=,rss=,user:32=,comm=`. comm is last so a
 * name with spaces (`tmux: server`) stays whole.
 * ```
 *       1       0      12  11520 root                             systemd
 *     812       1     340  98304 www-data                         nginx
 * ```
 */
export function parseAppProcessRows(raw: string): AppProcessRow[] {
  const rows: AppProcessRow[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);
    if (!m) continue;
    rows.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      cpuSeconds: Number(m[3]),
      rssKb: Number(m[4]),
      user: m[5]!,
      comm: m[6]!,
    });
  }
  return rows;
}

/**
 * Parses `grep -sE '^(read|write)_bytes' /proc/[0-9]*\/io` into pid → bytes.
 * Only processes the SSH user may read appear (its own, or all as root).
 * ```
 * /proc/812/io:read_bytes: 4096
 * /proc/812/io:write_bytes: 0
 * ```
 */
export function parseProcIo(raw: string): Map<number, ProcIo> {
  const out = new Map<number, ProcIo>();
  for (const line of raw.split('\n')) {
    const m = line.match(/^\/proc\/(\d+)\/io:(read|write)_bytes:\s*(\d+)\s*$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const cur = out.get(pid) ?? { readBytes: 0, writeBytes: 0 };
    if (m[2] === 'read') cur.readBytes = Number(m[3]);
    else cur.writeBytes = Number(m[3]);
    out.set(pid, cur);
  }
  return out;
}

/** Kernel threads are kthreadd (pid 2) and its children */
function isKernelThread(r: AppProcessRow): boolean {
  return r.pid === 2 || r.ppid === 2;
}

function isProbe(r: AppProcessRow, sshUser: string): boolean {
  return r.user === sshUser && PROBE_COMMANDS.has(r.comm);
}

/**
 * True when the I/O figures cover other users' processes as well — the SSH
 * user is root, or /proc/<pid>/io was readable for at least one process it
 * does not own (CAP_SYS_PTRACE). False means only the SSH user's own
 * processes have Disk numbers.
 */
export function isIoReadable(rows: AppProcessRow[], io: Map<number, ProcIo>, sshUser: string): boolean {
  if (sshUser === 'root') return true;
  return rows.some((r) => r.user !== sshUser && io.has(r.pid));
}

/**
 * Groups processes by command name, sorted by CPU seconds (then memory).
 * Kernel threads and HeadlessOS's own probes are left out. Disk bytes are
 * the sum over the instances whose /proc/<pid>/io was readable, or null
 * when none was.
 */
export function aggregateApps(rows: AppProcessRow[], io: Map<number, ProcIo>, sshUser: string): AppUsage[] {
  interface Acc { cpu: number; rss: number; n: number; read: number | null; write: number | null; users: Set<string> }
  const apps = new Map<string, Acc>();
  for (const r of rows) {
    if (isKernelThread(r) || isProbe(r, sshUser)) continue;
    const a = apps.get(r.comm) ?? { cpu: 0, rss: 0, n: 0, read: null, write: null, users: new Set<string>() };
    a.cpu += r.cpuSeconds;
    a.rss += r.rssKb;
    a.n += 1;
    a.users.add(r.user);
    const pio = io.get(r.pid);
    if (pio) {
      a.read = (a.read ?? 0) + pio.readBytes;
      a.write = (a.write ?? 0) + pio.writeBytes;
    }
    apps.set(r.comm, a);
  }
  return [...apps.entries()]
    .map(([name, a]) => ({
      name,
      cpuSeconds: a.cpu,
      rssKb: a.rss,
      instances: a.n,
      readBytes: a.read,
      writeBytes: a.write,
      users: [...a.users].sort(),
    }))
    .sort((x, y) => y.cpuSeconds - x.cpuSeconds || y.rssKb - x.rssKb || x.name.localeCompare(y.name));
}

/** `btime 1792459265` line of /proc/stat → ISO boot time, or null */
export function parseBootTime(procStat: string): string | null {
  const m = procStat.match(/^btime\s+(\d+)\s*$/m);
  if (!m) return null;
  return new Date(Number(m[1]) * 1000).toISOString();
}
