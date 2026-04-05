// M2.1: Deterministic parser for system info (uname + uptime + os-release)
// @see docs/phases/phase-2.md

import type { DeterministicParser } from '../pipeline.js';
import type { SystemInfoParsed } from '../schemas/system.js';

/**
 * Parses combined system info output from a compound command:
 * `uname -a && uptime -p && cat /etc/os-release`
 *
 * uname -a example:
 * Linux hostname 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux
 *
 * uptime -p example:
 * up 3 days, 4 hours, 12 minutes
 *
 * /etc/os-release example:
 * PRETTY_NAME="Ubuntu 22.04.3 LTS"
 * NAME="Ubuntu"
 * ...
 */
function parseSystemInfo(raw: string): SystemInfoParsed {
  const lines = raw.trim().split('\n');

  let hostname = 'unknown';
  let uptime = 'unknown';
  let os = 'Linux';
  let kernel = 'unknown';
  let architecture = 'unknown';

  for (const line of lines) {
    const trimmed = line.trim();

    // uname -a: "Linux hostname 5.15.0-91-generic ... x86_64 GNU/Linux"
    if (trimmed.startsWith('Linux ') && trimmed.includes('GNU/Linux')) {
      const parts = trimmed.split(/\s+/);
      hostname = parts[1] ?? hostname;
      kernel = parts[2] ?? kernel;
      // Architecture is usually second-to-last
      const archIdx = parts.indexOf('GNU/Linux') - 1;
      if (archIdx >= 0 && parts[archIdx]) {
        architecture = parts[archIdx]!;
      }
      continue;
    }

    // uptime -p: "up X days, Y hours, Z minutes"
    if (trimmed.startsWith('up ')) {
      uptime = trimmed;
      continue;
    }

    // /etc/os-release: PRETTY_NAME="Ubuntu 22.04.3 LTS"
    if (trimmed.startsWith('PRETTY_NAME=')) {
      os = trimmed.replace('PRETTY_NAME=', '').replace(/"/g, '');
      continue;
    }
  }

  // Fallback: if uname line didn't match "Linux ... GNU/Linux" pattern,
  // try to parse it as just "Linux hostname kernel-version" 
  if (hostname === 'unknown') {
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'Linux' && parts.length >= 3) {
        hostname = parts[1] ?? hostname;
        kernel = parts[2] ?? kernel;
        break;
      }
    }
  }

  return { hostname, uptime, os, kernel, architecture };
}

export const systemInfoParser: DeterministicParser<SystemInfoParsed> = {
  name: 'system-info',
  commands: ['uname -a && uptime -p && cat /etc/os-release'],
  parse: parseSystemInfo,
};
