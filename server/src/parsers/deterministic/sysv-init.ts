// EX8.9: Deterministic parsers for SysV init (hosts and containers without systemd)
// @see docs/phases/phase-ex8.md (EX8.9 — Services, Startup apps)

import type { ServiceListParsed } from '../schemas/services.js';
import { sortServices } from './systemctl.js';

/** Entries in /etc/init.d that are not services */
const NOT_SERVICES = new Set(['README', 'skeleton', 'rc', 'rcS', 'functions']);

export interface ServiceStatusEntry {
  name: string;
  /** `[ + ]` running, `[ - ]` stopped, `[ ? ]` the script has no status command */
  status: 'running' | 'stopped' | 'unknown';
}

/**
 * Parses `service --status-all` (Debian/Ubuntu sysvinit-utils). The `[ ? ]`
 * lines go to stderr on some versions, so callers pass stdout + stderr.
 * ```
 *  [ - ]  dbus
 *  [ ? ]  hwclock.sh
 *  [ + ]  ssh
 * ```
 */
export function parseServiceStatusAll(raw: string): ServiceStatusEntry[] {
  const out: ServiceStatusEntry[] = [];
  const seen = new Set<string>();
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*\[\s*([+?-])\s*\]\s+(\S+)\s*$/);
    if (!m) continue;
    const name = m[2]!;
    if (seen.has(name) || NOT_SERVICES.has(name)) continue;
    seen.add(name);
    out.push({ name, status: m[1] === '+' ? 'running' : m[1] === '-' ? 'stopped' : 'unknown' });
  }
  return out;
}

/**
 * Parses `ls -1 /etc/rc2.d` into script name → start link present.
 * `S01ssh` → ssh: true (starts in runlevel 2); `K01nginx` → nginx: false.
 * A script with both keeps `true`. README and other files are ignored.
 */
export function parseRcLinks(raw: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^([SK])\d{2}(.+)$/);
    if (!m) continue;
    const start = m[1] === 'S';
    out.set(m[2]!, (out.get(m[2]!) ?? false) || start);
  }
  return out;
}

/** Parses `ls -1 /etc/init.d` into the script names that look like services. */
export function parseInitDList(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((n) => n && !n.startsWith('.') && !NOT_SERVICES.has(n) && /^[\w@.-]+$/.test(n));
}

/**
 * Parses `grep -s '^# Short-Description:' /etc/init.d/*`:
 * ```
 * /etc/init.d/nginx:# Short-Description: starts the nginx web server
 * /etc/init.d/ssh:# Short-Description:	OpenBSD Secure Shell server
 * ```
 */
export function parseShortDescriptions(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of raw.split('\n')) {
    const m = line.match(/^\/etc\/init\.d\/([^:/]+):#\s*Short-Description:\s*(.*?)\s*$/);
    if (m && !out.has(m[1]!) && m[2]) out.set(m[1]!, m[2]);
  }
  return out;
}

/**
 * Builds the Services list for a SysV host: `[ + ]` → active/running,
 * `[ - ]` → inactive/dead, `[ ? ]` → inactive/unknown. Startup is
 * automatic with an `S??name` link in /etc/rc2.d, else manual. SysV
 * reports no main PID.
 */
export function buildSysvServices(
  statuses: ServiceStatusEntry[],
  rcLinks: Map<string, boolean>,
  descriptions: Map<string, string>,
): ServiceListParsed {
  const services: ServiceListParsed = statuses.map((s) => ({
    name: s.name,
    loadState: 'loaded' as const,
    activeState: s.status === 'running' ? ('active' as const) : ('inactive' as const),
    subState: s.status === 'running' ? 'running' : s.status === 'stopped' ? 'dead' : 'unknown',
    description: descriptions.get(s.name) ?? '',
    startup: rcLinks.get(s.name) ? ('automatic' as const) : ('manual' as const),
    pid: null,
  }));
  return sortServices(services);
}
