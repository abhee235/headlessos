// EX8.9: Builds the Task Manager "Startup apps" list
// @see docs/phases/phase-ex8.md (EX8.9 — Startup apps)
//
// Three sources: systemd unit files (enabled/disabled .service), SysV start
// links in /etc/rc2.d, and `@reboot` cron lines (read-only).

import type { StartupItem } from '../schemas/taskmanager.js';
import { parseExecStartArgv, type UnitFileEntry } from './systemctl.js';
import { startupImpact } from './systemd-analyze.js';

/** Startup ids that are cron lines start with this; they cannot be toggled */
export const CRON_ID_PREFIX = '@reboot#';

/**
 * `@reboot` commands from cron output. System crontabs (/etc/crontab,
 * /etc/cron.d/*) carry a user field before the command; `crontab -l` does not.
 */
export function parseRebootCron(raw: string, hasUserField: boolean): string[] {
  const out: string[] = [];
  if (/no crontab for/i.test(raw)) return out;
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*@reboot\s+(.+?)\s*$/);
    if (!m) continue;
    let cmd = m[1]!;
    if (hasUserField) {
      const u = cmd.match(/^\S+\s+(.+)$/);
      if (!u) continue;
      cmd = u[1]!;
    }
    out.push(cmd);
  }
  return out;
}

function commandName(cmd: string): string {
  const first = cmd.trim().split(/\s+/)[0] ?? cmd;
  return first.split('/').pop() || first;
}

export function buildCronItems(commands: string[]): StartupItem[] {
  return commands.map((command, i) => ({
    id: `${CRON_ID_PREFIX}${i + 1}`,
    name: commandName(command),
    command,
    source: 'cron' as const,
    enabled: true,
    delayMs: null,
    impact: null,
    toggleable: false,
  }));
}

/** enabled (incl. enabled-runtime) or disabled, and not a template (`foo@.service`) */
export function isStartupUnitFile(u: UnitFileEntry): boolean {
  return (u.state.startsWith('enabled') || u.state === 'disabled') && !/@\.service$/.test(u.unit);
}

/**
 * systemd items: `.service` unit files that are enabled (incl. enabled-runtime)
 * or disabled. Static, masked, alias, generated and template (`foo@.service`)
 * units are left out. Name is the unit's Description; delay and impact come
 * from `systemd-analyze blame` (null when the unit did not start this boot).
 */
export function buildSystemdStartupItems(
  unitFiles: UnitFileEntry[],
  blame: Map<string, number>,
  show: Array<Record<string, string>>,
): StartupItem[] {
  const byId = new Map(show.filter((b) => b.Id).map((b) => [b.Id!, b]));
  return unitFiles
    .filter(isStartupUnitFile)
    .map((u) => {
      const info = byId.get(u.unit);
      const base = u.unit.replace(/\.service$/, '');
      const desc = info?.Description?.trim();
      const delayMs = blame.get(u.unit) ?? null;
      return {
        id: u.unit,
        name: desc && desc !== u.unit ? desc : base,
        command: parseExecStartArgv(info?.ExecStart),
        source: 'systemd' as const,
        enabled: u.state.startsWith('enabled'),
        delayMs,
        impact: startupImpact(delayMs),
        // enabled-runtime lives in /run and is undone on reboot; only toggle persistent states
        toggleable: u.state === 'enabled' || u.state === 'disabled',
      };
    });
}

/**
 * SysV items: scripts linked into runlevel 2 (`S??name` → enabled,
 * `K??name` only → disabled). Scripts that never run in runlevel 2 (rcS-only
 * ones like procps) are not startup apps and are left out. When the
 * /etc/init.d listing is known, links without a script are dropped.
 */
export function buildSysvStartupItems(
  rcLinks: Map<string, boolean>,
  descriptions: Map<string, string>,
  initScripts: string[],
): StartupItem[] {
  const scripts = new Set(initScripts);
  return [...rcLinks.entries()]
    .filter(([name]) => scripts.size === 0 || scripts.has(name))
    .map(([name, start]) => ({
      id: name,
      name: descriptions.get(name) ?? name,
      command: `/etc/init.d/${name}`,
      source: 'sysv' as const,
      enabled: start,
      delayMs: null,
      impact: null,
      toggleable: true,
    }));
}

/** Enabled first, then the slowest, then by name */
export function sortStartupItems(items: StartupItem[]): StartupItem[] {
  return [...items].sort(
    (a, b) =>
      Number(b.enabled) - Number(a.enabled) ||
      (b.delayMs ?? -1) - (a.delayMs ?? -1) ||
      a.name.localeCompare(b.name),
  );
}
