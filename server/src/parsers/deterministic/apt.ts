// M7.2: Deterministic parser for apt/dpkg package commands
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { UpgradablePackage } from '../schemas/serveradmin.js';

/**
 * Parses `apt list --upgradable` output into UpgradablePackage[].
 *
 * Format:
 * ```
 * Listing... Done
 * libssl3/jammy-updates 3.0.2-0ubuntu1.16 amd64 [upgradable from: 3.0.2-0ubuntu1.15]
 * nginx/jammy-updates 1.18.0-6ubuntu14.5 amd64 [upgradable from: 1.18.0-6ubuntu14.4]
 * ```
 */
export function parseAptUpgradable(raw: string): UpgradablePackage[] {
  const lines = raw.trim().split('\n');
  const packages: UpgradablePackage[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip "Listing..." header and empty lines
    if (!trimmed || trimmed.startsWith('Listing')) continue;

    // Format: name/source version arch [upgradable from: oldversion]
    const match = trimmed.match(
      /^(\S+?)\/\S+\s+(\S+)\s+(\S+)\s+\[upgradable from:\s+(\S+?)\]$/
    );
    if (match) {
      packages.push({
        name: match[1]!,
        newVersion: match[2]!,
        architecture: match[3],
        currentVersion: match[4]!,
      });
    }
  }

  return packages;
}

/**
 * Parses `dpkg -l | wc -l` output to get total installed package count.
 * Returns the count as a number.
 *
 * Note: dpkg -l includes 5 header lines, so subtract 5 for actual count.
 */
export function parseDpkgCount(raw: string): number {
  const trimmed = raw.trim();
  const num = parseInt(trimmed, 10);
  if (isNaN(num)) return 0;
  // dpkg -l output has 5 header lines
  return Math.max(0, num - 5);
}

export const aptUpgradableParser: DeterministicParser<UpgradablePackage[]> = {
  name: 'apt-upgradable',
  commands: ['apt list --upgradable', 'apt list --upgradeable'],
  parse: parseAptUpgradable,
};

export const dpkgCountParser: DeterministicParser<number> = {
  name: 'dpkg-count',
  commands: ['dpkg -l | wc -l'],
  parse: parseDpkgCount,
};
