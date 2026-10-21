// EX8.6: Deterministic parser for `cat /proc/stat` CPU counters.
// The Task Manager computes CPU usage from the change between two samples
// (see computeCpuUsage). `top -bn1` is not used for percentages: its single
// frame averages since boot, and some procps builds print only even cores.
// @see docs/phases/phase-ex8.md

import type { DeterministicParser } from '../pipeline.js';
import type { ProcStatParsed } from '../schemas/taskmanager.js';

/**
 * Lines look like:
 *   cpu  4705 356 584 3699 23 23 0 0 0 0      ← aggregate (id -1)
 *   cpu0 1393 280 290 3220 10 3 0 0 0 0
 * Fields: user nice system idle iowait irq softirq steal [guest guest_nice].
 * guest time is already counted in user, so only the first 8 are summed.
 */
function parseProcStat(raw: string): ProcStatParsed {
  const out: ProcStatParsed = [];
  for (const line of raw.split('\n')) {
    const m = /^cpu(\d*)\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    const f = m[2]!.trim().split(/\s+/).slice(0, 8).map((n) => Number.parseInt(n, 10) || 0);
    while (f.length < 8) f.push(0);
    const idle = f[3]! + f[4]!; // idle + iowait
    const total = f.reduce((a, b) => a + b, 0);
    out.push({ id: m[1] === '' ? -1 : Number(m[1]), busy: total - idle, total });
  }
  return out;
}

export const procStatParser: DeterministicParser<ProcStatParsed> = {
  name: 'proc-stat',
  commands: ['cat /proc/stat'],
  parse: parseProcStat,
};

export interface CpuUsage {
  overallPercent: number;
  cores: Array<{ id: number; percent: number }>;
}

const pct = (busy: number, total: number) =>
  total > 0 ? Math.min(100, Math.max(0, Math.round((busy / total) * 1000) / 10)) : 0;

/**
 * CPU usage between two /proc/stat samples. With no previous sample the
 * since-boot average is returned. Returns null when no time has passed
 * (two reads inside the same clock tick), so callers keep their last value.
 */
export function computeCpuUsage(prev: ProcStatParsed | undefined, cur: ProcStatParsed): CpuUsage | null {
  const byId = new Map((prev ?? []).map((c) => [c.id, c]));
  const agg = cur.find((c) => c.id === -1);
  if (!agg) return null;
  const pAgg = byId.get(-1);
  const dTotal = pAgg ? agg.total - pAgg.total : agg.total;
  if (dTotal <= 0) return null;
  const dBusy = pAgg ? agg.busy - pAgg.busy : agg.busy;
  const cores = cur
    .filter((c) => c.id >= 0)
    .sort((a, b) => a.id - b.id)
    .map((c) => {
      const p = byId.get(c.id);
      return {
        id: c.id,
        percent: p ? pct(c.busy - p.busy, c.total - p.total) : pct(c.busy, c.total),
      };
    });
  return { overallPercent: pct(dBusy, dTotal), cores };
}
