// M2.1: Deterministic Parser Registry
// @see docs/phases/phase-2.md

import type { DeterministicParser } from '../pipeline.js';
import { dfParser } from './df.js';
import { freeParser } from './free.js';
import { ipParser } from './ip.js';
import { systemInfoParser } from './system-info.js';
import { psAuxParser } from './ps-aux.js';
import { cpuStatsParser } from './cpu-stats.js';
import { netDevParser } from './net-dev.js';
import { diskStatsParser } from './disk-stats.js';

/** All available deterministic parsers. */
export const allParsers: DeterministicParser[] = [
  dfParser,
  freeParser,
  ipParser,
  systemInfoParser,
  psAuxParser,
  cpuStatsParser,
  netDevParser,
  diskStatsParser,
];
