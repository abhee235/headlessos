// M7.1: Deterministic parser for /proc/net/dev (network I/O stats)
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { NetworkIoParsed } from '../schemas/taskmanager.js';

/**
 * Parses `cat /proc/net/dev` output.
 *
 * Expected format:
 * Inter-|   Receive                                                |  Transmit
 *  face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
 *    lo: 1234567  12345    0    0    0     0          0         0  1234567  12345    0    0    0     0       0          0
 *  eth0: 9876543  54321    0    0    0     0          0         0  1234567  12345    0    0    0     0       0          0
 */
function parseNetDev(raw: string): NetworkIoParsed {
  const lines = raw.trim().split('\n');
  const result: NetworkIoParsed = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip header lines
    if (trimmed.startsWith('Inter-') || trimmed.startsWith('face')) continue;
    if (!trimmed.includes(':')) continue;

    const [iface, rest] = trimmed.split(':');
    if (!iface || !rest) continue;

    const parts = rest.trim().split(/\s+/);
    if (parts.length < 10) continue;

    const name = iface.trim();
    // Skip loopback
    if (name === 'lo') continue;

    result.push({
      interface: name,
      rxBytes: parseInt(parts[0], 10) || 0,
      txBytes: parseInt(parts[8], 10) || 0,
      rxPackets: parseInt(parts[1], 10) || 0,
      txPackets: parseInt(parts[9], 10) || 0,
    });
  }

  return result;
}

export const netDevParser: DeterministicParser<NetworkIoParsed> = {
  name: 'net-dev',
  commands: ['cat /proc/net/dev'],
  parse: parseNetDev,
};
