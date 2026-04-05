// M7.2: Deterministic parser for crontab -l
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { CronJob } from '../schemas/serveradmin.js';

// Parses crontab -l output into CronJob[].
// Handles standard 5-field schedule entries, special time strings (@reboot etc.),
// and tracks preceding comments as descriptions.
// Also handles "no crontab for user" message.
export function parseCrontab(raw: string): CronJob[] {
  const trimmed = raw.trim();

  // Handle "no crontab for user" case
  if (trimmed.includes('no crontab for')) {
    return [];
  }

  const lines = trimmed.split('\n');
  const jobs: CronJob[] = [];
  let lastComment = '';

  for (const line of lines) {
    const t = line.trim();

    // Track comments as potential descriptions
    if (t.startsWith('#')) {
      lastComment = t.replace(/^#\s*/, '');
      continue;
    }

    if (!t) {
      lastComment = '';
      continue;
    }

    // Standard cron: minute hour dom month dow command
    const stdMatch = t.match(
      /^([\d*,\-/]+\s+[\d*,\-/]+\s+[\d*,\-/]+\s+[\d*,\-/]+\s+[\d*,\-/]+)\s+(.+)$/
    );
    if (stdMatch) {
      jobs.push({
        schedule: stdMatch[1]!,
        command: stdMatch[2]!,
        source: 'user',
        description: lastComment || undefined,
      });
      lastComment = '';
      continue;
    }

    // Special time strings: @reboot, @hourly, @daily, @weekly, @monthly, @yearly, @annually
    const specialMatch = t.match(/^(@(?:reboot|hourly|daily|weekly|monthly|yearly|annually))\s+(.+)$/);
    if (specialMatch) {
      jobs.push({
        schedule: specialMatch[1]!,
        command: specialMatch[2]!,
        source: 'user',
        description: lastComment || undefined,
      });
      lastComment = '';
      continue;
    }

    // Reset comment tracker for any unrecognized non-empty line
    lastComment = '';
  }

  return jobs;
}

// Parses system crontab (/etc/crontab or /etc/cron.d/* files).
// These have an extra user field between schedule and command.
export function parseSystemCrontab(raw: string): CronJob[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const lines = trimmed.split('\n');
  const jobs: CronJob[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;

    // Skip variable assignments (SHELL=, PATH=, MAILTO=)
    if (t.match(/^\w+=/)) continue;

    // System cron: minute hour dom month dow user command
    const match = t.match(
      /^([\d*,\-/]+\s+[\d*,\-/]+\s+[\d*,\-/]+\s+[\d*,\-/]+\s+[\d*,\-/]+)\s+(\S+)\s+(.+)$/
    );
    if (match) {
      jobs.push({
        schedule: match[1]!,
        command: match[3]!,
        source: `system (${match[2]})`,
      });
    }
  }

  return jobs;
}

export const crontabParser: DeterministicParser<CronJob[]> = {
  name: 'crontab',
  commands: ['crontab -l'],
  parse: parseCrontab,
};

export const systemCrontabParser: DeterministicParser<CronJob[]> = {
  name: 'system-crontab',
  commands: ['cat /etc/crontab'],
  parse: parseSystemCrontab,
};
