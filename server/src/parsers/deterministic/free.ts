// M2.1: Deterministic parser for free -m output
// @see docs/phases/phase-2.md

import type { DeterministicParser } from '../pipeline.js';
import type { MemoryInfoParsed } from '../schemas/system.js';

/**
 * Parses `free -m` output into structured MemoryInfo.
 *
 * Expected format:
 * ```
 *               total        used        free      shared  buff/cache   available
 * Mem:           7963        2134        3245         120        2583        5407
 * Swap:          2048         512        1536
 * ```
 */
function parseFreeOutput(raw: string): MemoryInfoParsed {
  const lines = raw.trim().split('\n');

  let memLine: string | undefined;
  let swapLine: string | undefined;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('mem:')) memLine = line;
    if (lower.startsWith('swap:')) swapLine = line;
  }

  if (!memLine) {
    throw new Error('free: could not find Mem: line');
  }

  const memParts = memLine.split(/\s+/);
  // Mem: total used free shared buff/cache available
  const totalMb = parseInt(memParts[1] ?? '0', 10);
  const usedMb = parseInt(memParts[2] ?? '0', 10);
  const freeMb = parseInt(memParts[3] ?? '0', 10);
  // available is the last column (index 6 for regular format)
  const availableMb = parseInt(memParts[6] ?? memParts[3] ?? '0', 10);

  let swapTotalMb = 0;
  let swapUsedMb = 0;

  if (swapLine) {
    const swapParts = swapLine.split(/\s+/);
    swapTotalMb = parseInt(swapParts[1] ?? '0', 10);
    swapUsedMb = parseInt(swapParts[2] ?? '0', 10);
  }

  return {
    totalMb: isNaN(totalMb) ? 0 : totalMb,
    usedMb: isNaN(usedMb) ? 0 : usedMb,
    freeMb: isNaN(freeMb) ? 0 : freeMb,
    availableMb: isNaN(availableMb) ? 0 : availableMb,
    swapTotalMb: isNaN(swapTotalMb) ? 0 : swapTotalMb,
    swapUsedMb: isNaN(swapUsedMb) ? 0 : swapUsedMb,
  };
}

export const freeParser: DeterministicParser<MemoryInfoParsed> = {
  name: 'free-m',
  commands: ['free -m', 'free'],
  parse: parseFreeOutput,
};
