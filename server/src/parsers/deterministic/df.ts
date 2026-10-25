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
  // EX10.8: `df -hT` adds a Type column after Filesystem
  const typed = /^\S+\s+Type\s/i.test(lines[0]!.trim());
  const shift = typed ? 1 : 0;

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    // Handle lines where filesystem name wraps to next line
    const parts = line.split(/\s+/);
    if (parts.length < 6 + shift) continue;

    // df -h columns: Filesystem [Type] Size Used Avail Use% Mounted on
    const filesystem = parts[0]!;
    const size = parts[1 + shift]!;
    const used = parts[2 + shift]!;
    const available = parts[3 + shift]!;
    const usePercentStr = parts[4 + shift]!;
    const mountPoint = parts.slice(5 + shift).join(' ');

    if (!/^\d+%$/.test(usePercentStr) && usePercentStr !== '-') continue;
    const usePercent = parseInt(usePercentStr.replace('%', ''), 10);
    if (isNaN(usePercent)) continue;

    results.push({
      filesystem,
      ...(typed ? { type: parts[1]! } : {}),
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
