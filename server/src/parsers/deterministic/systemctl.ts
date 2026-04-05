// M4.6: Deterministic parser for systemctl list-units output
// @see docs/phases/phase-4.md

import type { DeterministicParser } from '../pipeline.js';
import type { ServiceListParsed } from '../schemas/services.js';

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

  // Sort: active first, then failed, then alphabetical
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

export { parseSystemctlListUnits };
