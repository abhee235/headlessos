// M7.2: Deterministic parser for du -sh output
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { DirSize } from '../schemas/serveradmin.js';

/**
 * Parses `du -sh /path1 /path2 ...` output into DirSize[].
 *
 * Format:
 * ```
 * 4.0K    /tmp
 * 120M    /var/log
 * 2.5G    /home
 * 45G     /var/lib/docker
 * ```
 *
 * Tab-separated: size\tpath
 * May include error lines like "du: cannot read directory..."
 */
export function parseDu(raw: string): DirSize[] {
  const lines = raw.trim().split('\n');
  const dirs: DirSize[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip error lines
    if (trimmed.startsWith('du:')) continue;

    // Tab or whitespace separated: size  path
    const match = trimmed.match(/^(\S+)\s+(.+)$/);
    if (match) {
      dirs.push({
        size: match[1]!,
        path: match[2]!.trim(),
      });
    }
  }

  return dirs;
}

export const duParser: DeterministicParser<DirSize[]> = {
  name: 'du',
  commands: ['du -sh'],
  parse: parseDu,
};
