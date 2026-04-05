// M7.2: Deterministic parser for who / last commands
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { LoginSession, LoginHistory } from '../schemas/serveradmin.js';

/**
 * Parses `who` output into LoginSession[].
 *
 * Format:
 * ```
 * testuser  pts/0        2025-01-15 10:23 (192.168.1.5)
 * root      pts/1        2025-01-15 11:00 (10.0.0.1)
 * ```
 */
export function parseWho(raw: string): LoginSession[] {
  const lines = raw.trim().split('\n');
  const sessions: LoginSession[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Typical who format: user  terminal  date time (host)
    const match = trimmed.match(
      /^(\S+)\s+(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})(?:\s+\(([^)]*)\))?/
    );
    if (match) {
      sessions.push({
        user: match[1]!,
        terminal: match[2]!,
        loginTime: match[3]!,
        remoteHost: match[4] || undefined,
      });
      continue;
    }

    // Alternative format: user  terminal  Mon DD HH:MM (host)
    const altMatch = trimmed.match(
      /^(\S+)\s+(\S+)\s+(\S+\s+\S+\s+\d{2}:\d{2})(?:\s+\(([^)]*)\))?/
    );
    if (altMatch) {
      sessions.push({
        user: altMatch[1]!,
        terminal: altMatch[2]!,
        loginTime: altMatch[3]!,
        remoteHost: altMatch[4] || undefined,
      });
    }
  }

  return sessions;
}

/**
 * Parses `last -n 30` output into LoginHistory[].
 *
 * Format:
 * ```
 * testuser  pts/0        192.168.1.5      Mon Jan 15 10:23   still logged in
 * root      pts/1        10.0.0.1         Mon Jan 15 09:00 - 09:30  (00:30)
 * reboot    system boot  5.15.0-91-generic Mon Jan 15 08:00   still running
 *
 * wtmp begins Mon Jan  1 00:00:00 2025
 * ```
 */
export function parseLast(raw: string): LoginHistory[] {
  const lines = raw.trim().split('\n');
  const history: LoginHistory[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('wtmp begins') || trimmed.startsWith('btmp begins')) continue;

    // Match: user  terminal  host  Day Mon DD HH:MM  - HH:MM|still logged in  (duration)
    const match = trimmed.match(
      /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+\s+\S+\s+\d+\s+\d{2}:\d{2})\s+[-–]\s+(\S+(?:\s+\S+)?)\s*(?:\(([^)]+)\))?$/
    );
    if (match) {
      history.push({
        user: match[1]!,
        terminal: match[2]!,
        remoteHost: match[3]!,
        loginTime: match[4]!,
        logoutTime: match[5]!,
        duration: match[6] || undefined,
      });
      continue;
    }

    // "still logged in" variant
    const stillMatch = trimmed.match(
      /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+\s+\S+\s+\d+\s+\d{2}:\d{2})\s+(still\s+(?:logged\s+in|running))/
    );
    if (stillMatch) {
      history.push({
        user: stillMatch[1]!,
        terminal: stillMatch[2]!,
        remoteHost: stillMatch[3]!,
        loginTime: stillMatch[4]!,
        logoutTime: stillMatch[5]!,
        duration: undefined,
      });
    }
  }

  return history;
}

export const whoParser: DeterministicParser<LoginSession[]> = {
  name: 'who',
  commands: ['who'],
  parse: parseWho,
};

export const lastParser: DeterministicParser<LoginHistory[]> = {
  name: 'last',
  commands: ['last -n 30', 'last -30'],
  parse: parseLast,
};
