// EX10.8: structured data for read actions, from the classic deterministic parsers
// @see docs/phases/phase-ex10.md §9a
//
// The model sees this data as compact JSON instead of raw stdout, and EX10.10 widgets
// read values from it. A parser that throws leaves the model the raw text.

import { freeParser } from '../../../parsers/deterministic/free.js';
import { dfParser } from '../../../parsers/deterministic/df.js';
import { psAuxParser } from '../../../parsers/deterministic/ps-aux.js';
import { ssConnectionsParser, ssListeningParser } from '../../../parsers/deterministic/ss.js';
import { ipParser } from '../../../parsers/deterministic/ip.js';
import { computeCpuUsage, procStatParser } from '../../../parsers/deterministic/proc-stat.js';
import { netDevParser } from '../../../parsers/deterministic/net-dev.js';

/** rows of a process list the model gets (ps already sorted them) */
export const PROCESS_ROWS = 25;
/** the two samples of cpu_usage and network_traffic */
export const SAMPLE_INTERVAL_MS = 1_000;

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export function memoryData(stdout: string) {
  const m = freeParser.parse(stdout);
  return { ...m, usedPercent: percent(m.usedMb, m.totalMb), swapUsedPercent: percent(m.swapUsedMb, m.swapTotalMb) };
}

export const diskData = (stdout: string) => dfParser.parse(stdout);

export const processData = (stdout: string) => psAuxParser.parse(stdout).slice(0, PROCESS_ROWS);

/** `cat /proc/loadavg`: "0.45 0.38 0.32 1/142 45321" */
export function loadData(stdout: string) {
  const [l1, l5, l15, tasks] = stdout.trim().split(/\s+/);
  const [running, total] = (tasks ?? '').split('/').map(Number);
  const load = [l1, l5, l15].map(Number);
  if (load.some((n) => !Number.isFinite(n)) || !Number.isFinite(running) || !Number.isFinite(total)) throw new Error('loadavg: unexpected format');
  return { load1: load[0]!, load5: load[1]!, load15: load[2]!, running: running!, total: total! };
}

export const portsData = (stdout: string) => ssListeningParser.parse(stdout);
export const connectionsData = (stdout: string) => ssConnectionsParser.parse(stdout);
export const interfacesData = (stdout: string) => ipParser.parse(stdout);

/** Two `/proc/stat` samples → usage over the interval; equal samples (a fake server) → since boot */
export function cpuData(stdout: string, previous?: string) {
  const cur = procStatParser.parse(stdout);
  const between = previous ? computeCpuUsage(procStatParser.parse(previous), cur) : null;
  const usage = between ?? computeCpuUsage(undefined, cur);
  if (!usage) throw new Error('proc/stat: no aggregate cpu line');
  return { ...usage, basis: between ? `${SAMPLE_INTERVAL_MS / 1000} s` : 'since boot' };
}

/** Two `/proc/net/dev` samples → bytes per second per interface (loopback left out) */
export function trafficData(stdout: string, previous?: string) {
  const cur = netDevParser.parse(stdout);
  const before = new Map((previous ? netDevParser.parse(previous) : []).map((n) => [n.interface, n]));
  const perSecond = (now: number, then: number | undefined) => (then === undefined ? 0 : Math.max(0, Math.round(((now - then) * 1000) / SAMPLE_INTERVAL_MS)));
  return cur.map((n) => ({
    interface: n.interface,
    rxBytesPerSec: perSecond(n.rxBytes, before.get(n.interface)?.rxBytes),
    txBytesPerSec: perSecond(n.txBytes, before.get(n.interface)?.txBytes),
    rxTotalBytes: n.rxBytes,
    txTotalBytes: n.txBytes,
  }));
}
