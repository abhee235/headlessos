// M2.1: Deterministic parser for ip -brief addr output
// @see docs/phases/phase-2.md

import type { DeterministicParser } from '../pipeline.js';
import type { NetworkInterfacesParsed } from '../schemas/system.js';

/**
 * Parses `ip -brief addr` output into structured NetworkInterfaces.
 *
 * Expected format:
 * ```
 * lo               UNKNOWN        127.0.0.1/8 ::1/128
 * eth0             UP             192.168.1.10/24 fe80::1/64
 * docker0          DOWN
 * ```
 */
function parseIpBriefAddr(raw: string): NetworkInterfacesParsed {
  const lines = raw.trim().split('\n');
  const results: NetworkInterfacesParsed = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Split on whitespace — first col is name, second is status, rest are IPs
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const name = parts[0]!;
    const statusRaw = parts[1]!.toUpperCase();
    const status: 'UP' | 'DOWN' | 'UNKNOWN' =
      statusRaw === 'UP' ? 'UP' : statusRaw === 'DOWN' ? 'DOWN' : 'UNKNOWN';

    // Remaining parts are IP addresses (e.g., "192.168.1.10/24")
    const ipAddresses = parts.slice(2).filter(p => p.includes('.') || p.includes(':'));

    results.push({ name, status, ipAddresses });
  }

  return results;
}

export const ipParser: DeterministicParser<NetworkInterfacesParsed> = {
  name: 'ip-brief-addr',
  commands: ['ip -brief addr', 'ip -br addr'],
  parse: parseIpBriefAddr,
};
