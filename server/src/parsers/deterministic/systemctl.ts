// M4.6: Deterministic parser for systemctl list-units output
// @see docs/phases/phase-4.md

import type { DeterministicParser } from '../pipeline.js';
import type { ServiceListParsed, ServiceStartup } from '../schemas/services.js';

/**
 * Parses `systemctl list-units --type=service --all --no-pager --no-legend` output.
 *
 * Expected format (no header with --no-legend):
 * UNIT                        LOAD      ACTIVE   SUB     DESCRIPTION
 *   ssh.service               loaded    active   running OpenBSD Secure Shell server
 * ● nginx.service             loaded    failed   failed  A high performance web server
 *   cron.service              loaded    active   running Regular background program processing
 *
 * Notes:
 * - Lines may start with ● or ○ for failed/inactive services
 * - DESCRIPTION can contain spaces (everything after SUB)
 * - Only .service units are included
 */
function parseSystemctlListUnits(raw: string): ServiceListParsed {
  const lines = raw.trim().split('\n').filter(Boolean);
  const services: ServiceListParsed = [];

  const validLoadStates = ['loaded', 'not-found', 'masked'];
  const validActiveStates = ['active', 'inactive', 'failed', 'activating', 'deactivating'];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header lines if present (shouldn't be with --no-legend, but defensive)
    if (trimmed.startsWith('UNIT') && trimmed.includes('LOAD') && trimmed.includes('ACTIVE')) continue;

    // Some lines start with ● or ○ for failed/inactive services
    const cleaned = trimmed.replace(/^[●○]\s*/, '');

    const parts = cleaned.split(/\s+/);
    if (parts.length < 4) continue;

    const unitName = parts[0];
    const loadState = parts[1];
    const activeState = parts[2];
    const subState = parts[3];
    const description = parts.slice(4).join(' ');

    // Only include .service units
    if (!unitName.endsWith('.service')) continue;

    // Strip .service suffix for display name
    const name = unitName.replace(/\.service$/, '');

    services.push({
      name,
      loadState: (validLoadStates.includes(loadState)
        ? loadState
        : 'loaded') as 'loaded' | 'not-found' | 'masked',
      activeState: (validActiveStates.includes(activeState)
        ? activeState
        : 'inactive') as 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating',
      subState,
      description,
    });
  }

  return sortServices(services);
}

/** Sort in place: active first, then failed, then alphabetical. Shared with the SysV list (EX8.9). */
function sortServices(services: ServiceListParsed): ServiceListParsed {
  services.sort((a, b) => {
    if (a.activeState === 'active' && b.activeState !== 'active') return -1;
    if (a.activeState !== 'active' && b.activeState === 'active') return 1;
    if (a.activeState === 'failed' && b.activeState !== 'failed') return -1;
    if (a.activeState !== 'failed' && b.activeState === 'failed') return 1;
    return a.name.localeCompare(b.name);
  });
  return services;
}

export const systemctlParser: DeterministicParser<ServiceListParsed> = {
  name: 'systemctl-list-units',
  commands: [
    'systemctl list-units',
    'systemctl list-units --type=service',
    'systemctl list-units --type=service --all',
    'systemctl list-units --type=service --all --no-pager --no-legend',
  ],
  parse: parseSystemctlListUnits,
};

export { parseSystemctlListUnits, sortServices };

// ── EX8.9: unit files, `systemctl show` blocks, startup mapping ──

export interface UnitFileEntry {
  /** full unit name, e.g. `ssh.service` */
  unit: string;
  /** enabled | enabled-runtime | disabled | static | masked | alias | indirect | generated | … */
  state: string;
}

/**
 * Parses `systemctl list-unit-files --type=service --no-legend --no-pager`.
 *
 * ```
 * ssh.service                  enabled  enabled
 * getty@.service               enabled  enabled
 * apt-daily.service            static   -
 * cryptdisks.service           masked   enabled
 * ```
 * The third (vendor preset) column only exists on systemd ≥ 245 and is ignored.
 */
export function parseListUnitFiles(raw: string): UnitFileEntry[] {
  const out: UnitFileEntry[] = [];
  for (const line of raw.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [unit, state] = parts as [string, string];
    if (!unit.endsWith('.service') || unit === 'UNIT') continue;
    out.push({ unit, state });
  }
  return out;
}

/**
 * Parses `systemctl show --property=A,B,C <units|'*.service'>` output: one
 * `Key=Value` per line, units separated by a blank line. Values keep any `=`.
 */
export function parseSystemctlShow(raw: string): Array<Record<string, string>> {
  const blocks: Array<Record<string, string>> = [];
  let cur: Record<string, string> = {};
  const flush = (): void => {
    if (Object.keys(cur).length > 0) blocks.push(cur);
    cur = {};
  };
  for (const line of raw.split('\n')) {
    const t = line.replace(/\r$/, '');
    if (!t.trim()) { flush(); continue; }
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    cur[t.slice(0, eq)] = t.slice(eq + 1);
  }
  flush();
  return blocks;
}

/**
 * `ExecStart={ path=/usr/sbin/sshd ; argv[]=/usr/sbin/sshd -D $SSHD_OPTS ; ignore_errors=no ; … }`
 * → `/usr/sbin/sshd -D $SSHD_OPTS`. Several ExecStart lines → the first. Empty → null.
 */
export function parseExecStartArgv(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/argv\[\]=(.*?)\s;\s(?:ignore_errors|flags)=/) ?? value.match(/argv\[\]=([^;}]*)/);
  const argv = m?.[1]?.trim();
  if (argv) return argv;
  const path = value.match(/path=([^\s;]+)/)?.[1];
  return path ?? null;
}

/**
 * systemd unit file state → Services "Startup" column:
 * `enabled*` → automatic; `disabled` / `static` / `indirect` → manual;
 * `masked*` → disabled; anything else (generated, transient, alias, …) → null.
 */
export function unitFileStateToStartup(state: string | undefined): ServiceStartup | null {
  if (!state) return null;
  if (state.startsWith('enabled')) return 'automatic';
  if (state === 'disabled' || state === 'static' || state === 'indirect') return 'manual';
  if (state.startsWith('masked')) return 'disabled';
  return null;
}
