// M7.1: Deterministic parser for CPU stats
// Parses combined output: top -bn1 -1 | head -20 && cat /proc/loadavg && nproc
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { CpuStatsParsed } from '../schemas/taskmanager.js';

/**
 * Parses combined CPU stats output.
 *
 * Expected format from: top -bn1 -1 | head -20 && cat /proc/loadavg && nproc
 *
 * top line: top - 12:34:56 up 5 days,  3:22,  1 user,  load average: 0.15, 0.10, 0.05
 * Tasks line: Tasks: 123 total,   2 running, 120 sleeping,   0 stopped,   1 zombie
 * Cpu(s) line: %Cpu(s):  5.3 us,  2.1 sy,  0.0 ni, 92.1 id,  0.5 wa, ...
 * Per-core lines: %Cpu0 : ... / %Cpu1 : ...
 * /proc/loadavg: 0.15 0.10 0.05 1/234 5678
 * nproc: 4
 */
function parseCpuStats(raw: string): CpuStatsParsed {
  const lines = raw.trim().split('\n');

  let overallPercent = 0;
  let uptime = 'unknown';
  let totalProcs = 0;
  let running = 0;
  let sleeping = 0;
  let stopped = 0;
  let zombie = 0;
  const cores: { id: number; percent: number }[] = [];
  let loadOne = 0;
  let loadFive = 0;
  let loadFifteen = 0;
  let coreCount = 1;

  for (const line of lines) {
    const trimmed = line.trim();

    // top header: "top - HH:MM:SS up X days, ..."
    if (trimmed.startsWith('top -')) {
      const upMatch = trimmed.match(/up\s+(.+?),\s+\d+\s+user/);
      if (upMatch) {
        uptime = upMatch[1].replace(/,\s*$/, '').trim();
      }
    }

    // Tasks line
    if (trimmed.startsWith('Tasks:')) {
      const totalMatch = trimmed.match(/(\d+)\s+total/);
      const runMatch = trimmed.match(/(\d+)\s+running/);
      const sleepMatch = trimmed.match(/(\d+)\s+sleeping/);
      const stopMatch = trimmed.match(/(\d+)\s+stopped/);
      const zombieMatch = trimmed.match(/(\d+)\s+zombie/);
      totalProcs = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      running = runMatch ? parseInt(runMatch[1], 10) : 0;
      sleeping = sleepMatch ? parseInt(sleepMatch[1], 10) : 0;
      stopped = stopMatch ? parseInt(stopMatch[1], 10) : 0;
      zombie = zombieMatch ? parseInt(zombieMatch[1], 10) : 0;
    }

    // Overall CPU: "%Cpu(s):" or  "Cpu(s):"
    if (trimmed.match(/^%?Cpu\(s\)/)) {
      const idMatch = trimmed.match(/([\d.]+)\s*id/);
      if (idMatch) {
        const idle = parseFloat(idMatch[1]);
        overallPercent = Math.max(0, Math.min(100, 100 - idle));
      }
    }

    // Per-core: "%Cpu0  :" or "%Cpu1  :"
    const coreMatch = trimmed.match(/^%?Cpu(\d+)\s*:/);
    if (coreMatch) {
      const coreId = parseInt(coreMatch[1], 10);
      const idMatch = trimmed.match(/([\d.]+)\s*id/);
      if (idMatch) {
        const idle = parseFloat(idMatch[1]);
        cores.push({ id: coreId, percent: Math.max(0, Math.min(100, 100 - idle)) });
      }
    }

    // /proc/loadavg: "0.15 0.10 0.05 1/234 5678"
    if (trimmed.match(/^\d+\.\d+\s+\d+\.\d+\s+\d+\.\d+\s+\d+\/\d+/)) {
      const parts = trimmed.split(/\s+/);
      loadOne = parseFloat(parts[0]) || 0;
      loadFive = parseFloat(parts[1]) || 0;
      loadFifteen = parseFloat(parts[2]) || 0;
    }

    // nproc: just a number on its own line (after loadavg)
    if (/^\d+$/.test(trimmed) && parseInt(trimmed, 10) > 0 && parseInt(trimmed, 10) <= 1024) {
      coreCount = parseInt(trimmed, 10);
    }
  }

  // If we got per-core data, derive coreCount from that
  if (cores.length > 0 && cores.length > coreCount) {
    coreCount = cores.length;
  }

  // If no per-core data, generate synthetic entries
  if (cores.length === 0) {
    for (let i = 0; i < coreCount; i++) {
      cores.push({ id: i, percent: overallPercent });
    }
  }

  return {
    overallPercent: Math.round(overallPercent * 10) / 10,
    coreCount,
    cores,
    loadAverage: {
      one: loadOne,
      five: loadFive,
      fifteen: loadFifteen,
    },
    processes: {
      total: totalProcs,
      running,
      sleeping,
      stopped,
      zombie,
    },
    uptime,
  };
}

export const cpuStatsParser: DeterministicParser<CpuStatsParsed> = {
  name: 'cpu-stats',
  commands: ['top -bn1 -1 | head -20 && cat /proc/loadavg && nproc'],
  parse: parseCpuStats,
};
