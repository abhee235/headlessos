// M2.1: Deterministic parser for df -h output
// @see docs/phases/phase-2.md

import type { DeterministicParser } from '../pipeline.js';
import type { DiskUsageParsed } from '../schemas/system.js';

/**
 * Parses `df -h` output into structured DiskUsage array.
 *
 * Expected format:
 * ```
 * Filesystem      Size  Used Avail Use% Mounted on
 * /dev/sda1        50G   12G   35G  26% /
 * tmpfs           3.9G     0  3.9G   0% /dev/shm
 * ```
 */
function parseDfOutput(raw: string): DiskUsageParsed {
  const lines = raw.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('df: no data rows found');
  }

  const results: DiskUsageParsed = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    // Handle lines where filesystem name wraps to next line
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;

    // df -h columns: Filesystem Size Used Avail Use% Mounted on
    const filesystem = parts[0]!;
    const size = parts[1]!;
    const used = parts[2]!;
    const available = parts[3]!;
    const usePercentStr = parts[4]!;
    const mountPoint = parts.slice(5).join(' ');

    const usePercent = parseInt(usePercentStr.replace('%', ''), 10);
    if (isNaN(usePercent)) continue;

    results.push({
      filesystem,
      size,
      used,
      available,
      usePercent,
      mountPoint,
    });
  }

  if (results.length === 0) {
    throw new Error('df: failed to parse any filesystem entries');
  }

  return results;
}

export const dfParser: DeterministicParser<DiskUsageParsed> = {
  name: 'df-h',
  commands: ['df -h', 'df'],
  parse: parseDfOutput,
};
