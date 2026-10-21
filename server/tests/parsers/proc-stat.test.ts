// EX8.6: /proc/stat parsing and CPU usage deltas
import { describe, it, expect } from 'vitest';
import { procStatParser, computeCpuUsage } from '../../src/parsers/deterministic/proc-stat.js';

const T0 = `cpu  1000 0 500 8000 500 0 0 0 0 0
cpu0 500 0 250 4000 250 0 0 0 0 0
cpu1 500 0 250 4000 250 0 0 0 0 0
intr 12345 0 0
ctxt 999`;

// +1000 jiffies on each core: cpu0 spent 500 busy, cpu1 spent 100 busy
const T1 = `cpu  1600 0 500 9400 500 0 0 0 0 0
cpu0 1000 0 250 4500 250 0 0 0 0 0
cpu1 600 0 250 4900 250 0 0 0 0 0`;

describe('procStatParser', () => {
  it('reads the aggregate and every core, ignoring other lines', () => {
    const r = procStatParser.parse(T0);
    expect(r).toEqual([
      { id: -1, busy: 1500, total: 10000 },
      { id: 0, busy: 750, total: 5000 },
      { id: 1, busy: 750, total: 5000 },
    ]);
  });

  it('keeps odd-numbered cores (top on some systems prints only even ones)', () => {
    const many = Array.from({ length: 12 }, (_, i) => `cpu${i} 1 0 1 10 0 0 0 0 0 0`).join('\n');
    const r = procStatParser.parse(`cpu  12 0 12 120 0 0 0 0 0 0\n${many}`);
    expect(r.filter((c) => c.id >= 0).map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('treats iowait as idle and ignores guest columns', () => {
    const [agg] = procStatParser.parse('cpu  10 0 0 80 10 0 0 0 99 99');
    expect(agg).toEqual({ id: -1, busy: 10, total: 100 });
  });
});

describe('computeCpuUsage', () => {
  it('uses the delta between samples', () => {
    const u = computeCpuUsage(procStatParser.parse(T0), procStatParser.parse(T1))!;
    expect(u.overallPercent).toBe(30); // 600 busy of 2000
    expect(u.cores).toEqual([{ id: 0, percent: 50 }, { id: 1, percent: 10 }]);
  });

  it('falls back to the since-boot average without a previous sample', () => {
    expect(computeCpuUsage(undefined, procStatParser.parse(T0))!.overallPercent).toBe(15);
  });

  it('returns null when no time passed between reads', () => {
    const s = procStatParser.parse(T0);
    expect(computeCpuUsage(s, s)).toBeNull();
  });
});
