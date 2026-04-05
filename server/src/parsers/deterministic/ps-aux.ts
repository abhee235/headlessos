// M7.1: Deterministic parser for ps aux output
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { ProcessListParsed } from '../schemas/taskmanager.js';

/**
 * Parses `ps aux --no-headers` output into structured process list.
 *
 * Expected format (header not present with --no-headers):
 * USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
 * root         1  0.0  0.1  22356  8444 ?        Ss   Mar15   0:02 /sbin/init
 */
function parsePsAux(raw: string): ProcessListParsed {
  const lines = raw.trim().split('\n');
  const processes: ProcessListParsed = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // Skip header line if present
    if (line.trim().startsWith('USER') && line.includes('PID')) continue;

    // ps aux columns are space-separated, but COMMAND can contain spaces
    // USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND...
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) continue;

    const user = parts[0];
    const pid = parseInt(parts[1], 10);
    const cpu = parseFloat(parts[2]);
    const memory = parseFloat(parts[3]);
    const vsz = parseInt(parts[4], 10);
    const rss = parseInt(parts[5], 10);
    // parts[6] = TTY (skip)
    const stat = parts[7];
    const started = parts[8];
    const time = parts[9];
    // COMMAND is everything from parts[10] onward
    const command = parts.slice(10).join(' ');

    if (isNaN(pid)) continue;

    processes.push({
      pid,
      user,
      cpu: isNaN(cpu) ? 0 : cpu,
      memory: isNaN(memory) ? 0 : memory,
      vsz: isNaN(vsz) ? 0 : vsz,
      rss: isNaN(rss) ? 0 : rss,
      stat: stat ?? '?',
      started: started ?? '',
      time: time ?? '0:00',
      command,
    });
  }

  return processes;
}

export const psAuxParser: DeterministicParser<ProcessListParsed> = {
  name: 'ps-aux',
  commands: ['ps aux', 'ps aux --no-headers'],
  parse: parsePsAux,
};
