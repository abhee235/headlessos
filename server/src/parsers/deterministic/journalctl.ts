// M7.2: Deterministic parser for journalctl / dmesg / syslog
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { LogEntry } from '../schemas/serveradmin.js';

/**
 * Parses `journalctl --no-pager -n N --output=short-iso` output.
 *
 * Format:
 * ```
 * 2025-01-15T10:23:45+0000 hostname sshd[12345]: Accepted publickey for user from 192.168.1.5
 * 2025-01-15T10:24:00+0000 hostname systemd[1]: Starting nginx.service...
 * ```
 *
 * Also handles `--output=json-pretty` if available, but short-iso is preferred.
 */
export function parseJournalctl(raw: string): LogEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Try JSON lines format first (journalctl --output=json)
  if (trimmed.startsWith('{')) {
    return parseJournalctlJson(trimmed);
  }

  // short-iso format
  const lines = trimmed.split('\n');
  const entries: LogEntry[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // Skip "-- Journal begins at ..." header
    if (t.startsWith('-- ')) continue;

    // ISO timestamp format: 2025-01-15T10:23:45+0000 hostname unit[pid]: message
    const isoMatch = t.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)\s+\S+\s+(\S+?)(?:\[\d+\])?:\s+(.+)$/
    );
    if (isoMatch) {
      entries.push({
        timestamp: isoMatch[1],
        unit: isoMatch[2],
        message: isoMatch[3]!,
      });
      continue;
    }

    // Traditional syslog format: Jan 15 10:23:45 hostname unit[pid]: message
    const syslogMatch = t.match(
      /^(\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+\S+\s+(\S+?)(?:\[\d+\])?:\s+(.+)$/
    );
    if (syslogMatch) {
      entries.push({
        timestamp: syslogMatch[1],
        unit: syslogMatch[2],
        message: syslogMatch[3]!,
      });
      continue;
    }

    // Fallback: just add as message
    entries.push({ message: t });
  }

  return entries;
}

/**
 * Parses journalctl --output=json lines.
 */
function parseJournalctlJson(raw: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      entries.push({
        timestamp:
          typeof obj['__REALTIME_TIMESTAMP'] === 'string'
            ? new Date(
                parseInt(obj['__REALTIME_TIMESTAMP'], 10) / 1000
              ).toISOString()
            : undefined,
        unit: (obj['_SYSTEMD_UNIT'] as string) || (obj['SYSLOG_IDENTIFIER'] as string) || undefined,
        priority: obj['PRIORITY'] !== undefined ? String(obj['PRIORITY']) : undefined,
        message: (obj['MESSAGE'] as string) || '',
      });
    } catch {
      // Skip unparseable lines
    }
  }

  return entries;
}

/**
 * Parses `dmesg` output into LogEntry[].
 *
 * Format:
 * ```
 * [    0.000000] Linux version 5.15.0-91-generic ...
 * [    1.234567] ACPI: Core revision 20210930
 * [  123.456789] EXT4-fs (sda1): mounted filesystem with ordered data mode
 * ```
 */
export function parseDmesg(raw: string): LogEntry[] {
  const lines = raw.trim().split('\n');
  const entries: LogEntry[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Kernel ring buffer format: [  timestamp] message
    const match = t.match(/^\[\s*([\d.]+)\]\s+(.+)$/);
    if (match) {
      entries.push({
        timestamp: match[1],
        message: match[2]!,
      });
    } else {
      entries.push({ message: t });
    }
  }

  return entries;
}

export const journalctlParser: DeterministicParser<LogEntry[]> = {
  name: 'journalctl',
  commands: ['journalctl --no-pager -n 100 --output=short-iso', 'journalctl --no-pager -n 100'],
  parse: parseJournalctl,
};

export const dmesgParser: DeterministicParser<LogEntry[]> = {
  name: 'dmesg',
  commands: ['dmesg --time-format=iso', 'dmesg'],
  parse: parseDmesg,
};
