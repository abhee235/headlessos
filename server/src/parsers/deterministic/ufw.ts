// M7.2: Deterministic parser for ufw status output
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { FirewallStatus } from '../schemas/serveradmin.js';

/**
 * Parses `ufw status numbered` output into structured FirewallStatus.
 *
 * Expected format:
 * ```
 * Status: active
 *
 *      To                         Action      From
 *      --                         ------      ----
 * [ 1] 22/tcp                     ALLOW IN    Anywhere
 * [ 2] 80/tcp                     ALLOW IN    Anywhere
 * [ 3] 443                        ALLOW IN    Anywhere
 * [ 4] 22/tcp (v6)                ALLOW IN    Anywhere (v6)
 * ```
 *
 * Or if inactive:
 * ```
 * Status: inactive
 * ```
 *
 * Or if not installed (exit code 127, caught by route handler):
 * Returns `{ available: false, active: false, rules: [], message: "..." }`
 */
export function parseUfwStatus(raw: string): FirewallStatus {
  const trimmed = raw.trim();

  // Check for "command not found" or empty
  if (!trimmed || trimmed.includes('command not found') || trimmed.includes('not found')) {
    return {
      available: false,
      active: false,
      rules: [],
      message: 'UFW is not installed. Install with: sudo apt install ufw',
    };
  }

  // Determine status
  const statusMatch = trimmed.match(/Status:\s*(active|inactive)/i);
  const active = statusMatch ? statusMatch[1]!.toLowerCase() === 'active' : false;

  if (!active) {
    return { available: true, active: false, rules: [] };
  }

  // Parse rules
  const rules: FirewallStatus['rules'] = [];
  const lines = trimmed.split('\n');

  for (const line of lines) {
    // Match: [ 1] 22/tcp                     ALLOW IN    Anywhere
    const ruleMatch = line.match(/^\[\s*(\d+)\]\s+(.+?)\s{2,}(ALLOW|DENY|REJECT|LIMIT)\s*(IN|OUT|FWD)?\s{2,}(.+)$/);
    if (ruleMatch) {
      rules.push({
        number: parseInt(ruleMatch[1]!, 10),
        to: ruleMatch[2]!.trim(),
        action: `${ruleMatch[3]}${ruleMatch[4] ? ' ' + ruleMatch[4] : ''}`.trim(),
        from: ruleMatch[5]!.trim(),
      });
    }
  }

  return { available: true, active, rules };
}

export const ufwParser: DeterministicParser<FirewallStatus> = {
  name: 'ufw-status',
  commands: ['ufw status numbered', 'ufw status'],
  parse: parseUfwStatus,
};
