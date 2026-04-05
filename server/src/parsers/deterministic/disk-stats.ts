// M7.1: Deterministic parser for /proc/diskstats (disk I/O stats)
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { DiskIoParsed } from '../schemas/taskmanager.js';

/**
 * Parses `cat /proc/diskstats` output.
 *
 * Each line:
 *  major minor devname reads_completed reads_merged sectors_read ms_reading writes_completed writes_merged sectors_written ms_writing ...
 *
 * We extract sectors_read (field 5, 0-indexed) and sectors_written (field 9).
 * 1 sector = 512 bytes.
 *
 * Example:
 *   8       0 sda 12345 6789 234567 12000 45678 1234 567890 23000 0 15000 35000
 */
function parseDiskStats(raw: string): DiskIoParsed {
  const lines = raw.trim().split('\n');
  const result: DiskIoParsed = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 14) continue;

    const devname = parts[2];
    // Only include actual block devices (sda, vda, nvme0n1, etc.)
    // Skip partitions and loop/ram devices
    if (!devname) continue;
    if (/^(loop|ram|dm-)\d*$/.test(devname)) continue;
    // Skip partitions: sda1, vda2, etc. (keep sda, vda, nvme0n1)
    if (/^(sd|vd|hd)[a-z]\d+$/.test(devname)) continue;
    if (/^nvme\d+n\d+p\d+$/.test(devname)) continue;

    const sectorsRead = parseInt(parts[5], 10) || 0;
    const sectorsWritten = parseInt(parts[9], 10) || 0;

    result.push({
      device: devname,
      readBytes: sectorsRead * 512,
      writeBytes: sectorsWritten * 512,
    });
  }

  return result;
}

export const diskStatsParser: DeterministicParser<DiskIoParsed> = {
  name: 'disk-stats',
  commands: ['cat /proc/diskstats'],
  parse: parseDiskStats,
};
