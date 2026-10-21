// EX8.9: Commands and command builders shared by TaskManagerService and SystemdService
// @see docs/phases/phase-ex8.md (EX8.9)
//
// Every string here has an exact pattern in security/validators.ts
// (ALLOWED_COMMANDS). Builders take names that already passed
// validateServiceName() and shell-escape them anyway.

import { shellEscape } from '../../security/validators.js';

/** Read-only probes used by the EX8.9 pages. Fixed strings, no user input. */
export const PROBE = {
  who: 'who',
  ttyProcesses: 'ps -eo user:32=,tty=,etimes=',
  currentUser: 'id -un',
  appProcesses: 'ps -eo pid=,ppid=,cputimes=,rss=,user:32=,comm=',
  procIo: "grep -sE '^(read|write)_bytes' /proc/[0-9]*/io",
  procStat: 'cat /proc/stat',
  pid1: 'ps -o comm= -p 1',
  systemdBooted: 'test -d /run/systemd/system',
  // `@` lines, not `@reboot`: the blocklist rejects any command containing the word reboot
  cronSystemSpecial: "grep -sh '^[[:space:]]*@' /etc/crontab /etc/cron.d/*",
  cronUser: 'crontab -l',
  unitFiles: 'systemctl list-unit-files --type=service --no-legend --no-pager',
  analyzeTime: 'systemd-analyze time --no-pager',
  analyzeBlame: 'systemd-analyze blame --no-pager',
  serviceRuntime: "systemctl show --no-pager --property=Id,MainPID,UnitFileState '*.service'",
  listUnits: 'systemctl list-units --type=service --all --no-pager --no-legend',
  serviceStatusAll: 'service --status-all',
  initD: 'ls -1 /etc/init.d',
  rc2d: 'ls -1 /etc/rc2.d',
  initDescriptions: "grep -s '^# Short-Description:' /etc/init.d/*",
} as const;

/**
 * stderr from systemctl on a host whose PID 1 is not systemd, or without
 * systemctl at all. Deliberately narrow: "Unit foo.service not found." must
 * not match, or a typo would fall back to SysV on a systemd host.
 */
export const NO_SYSTEMD_RE =
  /has not been booted with systemd|Failed to connect to bus|systemctl: (?:command )?not found|command not found: systemctl/i;

/**
 * `systemctl show … <units>` for Description + ExecStart of specific units.
 * Units must match `[\w@.:-]+\.service`; others are dropped.
 */
export function buildUnitInfoCommand(units: string[]): string | null {
  const safe = units.filter((u) => /^[\w@.:-]+\.service$/.test(u)).slice(0, 500);
  if (safe.length === 0) return null;
  return `systemctl show --no-pager --property=Id,Description,ExecStart ${safe.map(shellEscape).join(' ')}`;
}

export type SysvAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable';

/** SysV control: `sudo service 'name' start|stop|restart` or `sudo update-rc.d 'name' enable|disable` */
export function buildSysvCommand(name: string, action: SysvAction): string {
  const script = name.replace(/\.service$/, '');
  if (action === 'enable' || action === 'disable') {
    return `sudo update-rc.d ${shellEscape(script)} ${action}`;
  }
  return `sudo service ${shellEscape(script)} ${action}`;
}

/** `sudo systemctl enable|disable 'unit.service'` */
export function buildSystemctlEnableCommand(unit: string, action: 'enable' | 'disable'): string {
  return `sudo systemctl ${action} ${shellEscape(unit)}`;
}
