// M2.1: Deterministic Parser Registry
// @see docs/phases/phase-2.md

import type { DeterministicParser } from '../pipeline.js';
import { dfParser } from './df.js';
import { freeParser } from './free.js';
import { ipParser } from './ip.js';
import { systemInfoParser } from './system-info.js';
import { psAuxParser } from './ps-aux.js';
import { cpuStatsParser } from './cpu-stats.js';
import { procStatParser } from './proc-stat.js';
import { netDevParser } from './net-dev.js';
import { diskStatsParser } from './disk-stats.js';

// M7.2: Server Admin parsers
import { ssListeningParser, ssConnectionsParser } from './ss.js';
import { ufwParser } from './ufw.js';
import { etcPasswdParser } from './etc-passwd.js';
import { whoParser, lastParser } from './who.js';
import { sshdConfigParser } from './sshd-config.js';
import { nginxSitesParser, nginxConfigTestParser, certbotParser } from './nginx.js';
import { aptUpgradableParser, dpkgCountParser } from './apt.js';
import { crontabParser, systemCrontabParser } from './crontab.js';
import { duParser } from './du.js';
import { findmntParser, swaponParser } from './findmnt.js';
import { ipRouteParser, resolvConfParser } from './ip-route.js';
import { journalctlParser, dmesgParser } from './journalctl.js';
import { systemctlParser } from './systemctl.js';

/** All available deterministic parsers. */
export const allParsers: DeterministicParser[] = [
  // System (Phase 2)
  dfParser,
  freeParser,
  ipParser,
  systemInfoParser,
  psAuxParser,
  cpuStatsParser,
  procStatParser,
  netDevParser,
  diskStatsParser,
  // Server Admin (M7.2)
  ssListeningParser,
  ssConnectionsParser,
  ufwParser,
  etcPasswdParser,
  whoParser,
  lastParser,
  sshdConfigParser,
  nginxSitesParser,
  nginxConfigTestParser,
  certbotParser,
  aptUpgradableParser,
  dpkgCountParser,
  crontabParser,
  systemCrontabParser,
  duParser,
  findmntParser,
  swaponParser,
  ipRouteParser,
  resolvConfParser,
  journalctlParser,
  dmesgParser,
  // Services (M4.6)
  systemctlParser,
];
