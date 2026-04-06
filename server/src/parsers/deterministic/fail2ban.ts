// M8.1: Fail2ban deterministic parser
// Parses `sudo fail2ban-client status <jail>` output
// @see docs/phases/phase-8.md

import type { Fail2banJailDetail } from '../schemas/serveradmin.js';

/**
 * Parse `fail2ban-client status <jail>` output.
 *
 * Example output:
 * ```
 * Status for the jail: sshd
 * |- Filter
 * |  |- Currently failed: 2
 * |  |- Total failed:     15
 * |  `- File list:        /var/log/auth.log
 * `- Actions
 *    |- Currently banned: 1
 *    |- Total banned:     3
 *    `- Banned IP list:   192.168.1.100 10.0.0.5
 * ```
 */
export function parseFail2banJailStatus(raw: string): Fail2banJailDetail {
  const lines = raw.trim().split('\n');

  // Jail name
  const jailMatch = lines[0]?.match(/Status for the jail:\s*(.+)/);
  const jail = jailMatch?.[1]?.trim() ?? 'unknown';

  // Filter section
  const currentlyFailed = extractNumber(raw, /Currently failed:\s*(\d+)/);
  const totalFailed = extractNumber(raw, /Total failed:\s*(\d+)/);
  const fileListMatch = raw.match(/File list:\s*(.*)/);
  const fileList = fileListMatch?.[1]?.trim()
    ? fileListMatch[1].trim().split(/\s+/).filter(Boolean)
    : [];

  // Extract filter name (may not always be present)
  const filterMatch = raw.match(/Filter:\s*(.*)/);
  const filter = filterMatch?.[1]?.trim() ?? '';

  // Actions section
  const currentlyBanned = extractNumber(raw, /Currently banned:\s*(\d+)/);
  const totalBanned = extractNumber(raw, /Total banned:\s*(\d+)/);
  const bannedMatch = raw.match(/Banned IP list:\s*(.*)/);
  const bannedIps = bannedMatch?.[1]?.trim()
    ? bannedMatch[1].trim().split(/\s+/).filter(Boolean)
    : [];

  return {
    jail,
    currentlyFailed,
    totalFailed,
    currentlyBanned,
    totalBanned,
    bannedIps,
    fileList,
    filter,
  };
}

function extractNumber(text: string, regex: RegExp): number {
  const match = text.match(regex);
  return match ? parseInt(match[1]!, 10) : 0;
}
