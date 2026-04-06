// M7.2: Deterministic parser for findmnt / swapon output
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { MountPoint, SwapInfo } from '../schemas/serveradmin.js';

/**
 * Parses `findmnt --json` output into MountPoint[].
 *
 * JSON format:
 * ```json
 * {
 *   "filesystems": [
 *     {"target": "/", "source": "/dev/sda1", "fstype": "ext4", "options": "rw,relatime"},
 *     {"target": "/home", "source": "/dev/sda2", "fstype": "ext4", "options": "rw,relatime"}
 *   ]
 * }
 * ```
 *
 * Falls back to line-by-line parsing if JSON is not available.
 */
export function parseFindmnt(raw: string): MountPoint[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Try JSON parse first (findmnt --json)
  try {
    const data = JSON.parse(trimmed) as {
      filesystems?: Array<{
        target?: string;
        source?: string;
        fstype?: string;
        options?: string;
        children?: Array<{
          target?: string;
          source?: string;
          fstype?: string;
          options?: string;
        }>;
      }>;
    };

    if (data.filesystems) {
      const mounts: MountPoint[] = [];
      const flatten = (items: typeof data.filesystems) => {
        for (const item of items || []) {
          mounts.push({
            target: item.target || '',
            source: item.source || '',
            fstype: item.fstype || '',
            options: item.options || undefined,
          });
          if (item.children) {
            flatten(item.children);
          }
        }
      };
      flatten(data.filesystems);
      return mounts;
    }
  } catch {
    // Not JSON, try tabular format
  }

  // Fallback: tabular format from `findmnt -l`
  // TARGET        SOURCE      FSTYPE OPTIONS
  const lines = trimmed.split('\n');
  const mounts: MountPoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    // Skip header line
    if (line.startsWith('TARGET') || line.startsWith('---')) continue;

    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      mounts.push({
        target: parts[0]!,
        source: parts[1]!,
        fstype: parts[2]!,
        options: parts.slice(3).join(' ') || undefined,
      });
    }
  }

  return mounts;
}

/**
 * Parses `swapon --show` output into SwapInfo[].
 *
 * Format:
 * ```
 * NAME      TYPE      SIZE   USED   PRIO
 * /swapfile file      2G     512M   -2
 * /dev/sda3 partition 4G     0B     -3
 * ```
 */
export function parseSwapon(raw: string): SwapInfo[] {
  const lines = raw.trim().split('\n');
  const swaps: SwapInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    // Skip header
    if (line.startsWith('NAME') || line.startsWith('---')) continue;

    const parts = line.split(/\s+/);
    if (parts.length >= 5) {
      const priority = parseInt(parts[4]!, 10);
      swaps.push({
        name: parts[0]!,
        type: parts[1]!,
        size: parts[2]!,
        used: parts[3]!,
        priority: isNaN(priority) ? 0 : priority,
      });
    }
  }

  return swaps;
}

export const findmntParser: DeterministicParser<MountPoint[]> = {
  name: 'findmnt',
  commands: ['findmnt --json', 'findmnt -l'],
  parse: parseFindmnt,
};

export const swaponParser: DeterministicParser<SwapInfo[]> = {
  name: 'swapon',
  commands: ['swapon --show'],
  parse: parseSwapon,
};
