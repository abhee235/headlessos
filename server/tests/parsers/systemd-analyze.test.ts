// EX8.9: Tests for systemd-analyze time / blame parsers
// @see docs/phases/phase-ex8.md

import { describe, it, expect } from 'vitest';
import {
  parseSystemdDuration,
  parseSystemdAnalyzeTime,
  parseSystemdBlame,
  startupImpact,
} from '../../src/parsers/deterministic/systemd-analyze.js';
import { BootTimesSchema } from '../../src/parsers/schemas/taskmanager.js';

const TIME_BARE_METAL = `Startup finished in 1.402s (firmware) + 712ms (loader) + 2.103s (kernel) + 3.215s (userspace) = 7.432s
graphical.target reached after 3.180s in userspace
`;

const TIME_VM = `Startup finished in 2.354s (kernel) + 14.620s (userspace) = 16.975s
multi-user.target reached after 14.591s in userspace
`;

const TIME_INITRD_MINUTES = `Startup finished in 5.112s (kernel) + 1.890s (initrd) + 1min 2.500s (userspace) = 1min 9.502s
`;

const TIME_NOT_FINISHED = `Bootup is not yet finished (org.freedesktop.systemd1.Manager.FinishTimestampMonotonic=0).
Please try again later.
Hint: Use 'systemctl list-jobs' to see active jobs`;

const BLAME = ` 1min 30.003s NetworkManager-wait-online.service
      5.217s snapd.service
      1.032s cloud-init.service
       812ms docker.service
       512ms ssh.service
       299ms systemd-journald.service
       850us systemd-random-seed.service
`;

describe('parseSystemdDuration', () => {
  it('converts every unit systemd prints', () => {
    expect(parseSystemdDuration('7.432s')).toBe(7432);
    expect(parseSystemdDuration('712ms')).toBe(712);
    expect(parseSystemdDuration('1min 2.5s')).toBe(62_500);
    expect(parseSystemdDuration('1h 2min')).toBe(3_720_000);
    expect(parseSystemdDuration('850us')).toBe(0.85);
    expect(parseSystemdDuration('850µs')).toBe(0.85);
  });

  it('returns null for anything that is not a duration', () => {
    expect(parseSystemdDuration('')).toBeNull();
    expect(parseSystemdDuration('fast')).toBeNull();
    expect(parseSystemdDuration('3.2s (kernel)')).toBeNull();
  });
});

describe('parseSystemdAnalyzeTime', () => {
  it('parses all four segments on bare metal', () => {
    const r = BootTimesSchema.parse(parseSystemdAnalyzeTime(TIME_BARE_METAL));
    expect(r).toEqual({ totalMs: 7432, firmwareMs: 1402, loaderMs: 712, kernelMs: 2103, userspaceMs: 3215 });
  });

  it('leaves firmware/loader null on a VM', () => {
    const r = parseSystemdAnalyzeTime(TIME_VM)!;
    expect(r.firmwareMs).toBeNull();
    expect(r.loaderMs).toBeNull();
    expect(r.kernelMs).toBe(2354);
    expect(r.userspaceMs).toBe(14_620);
    expect(r.totalMs).toBe(16_975);
  });

  it('folds initrd into kernel and handles minutes', () => {
    const r = parseSystemdAnalyzeTime(TIME_INITRD_MINUTES)!;
    expect(r.kernelMs).toBe(5112 + 1890);
    expect(r.userspaceMs).toBe(62_500);
    expect(r.totalMs).toBe(69_502);
  });

  it('returns null while boot is not finished or for empty/error output', () => {
    expect(parseSystemdAnalyzeTime(TIME_NOT_FINISHED)).toBeNull();
    expect(parseSystemdAnalyzeTime('')).toBeNull();
    expect(parseSystemdAnalyzeTime('System has not been booted with systemd as init system (PID 1). Can\'t operate.')).toBeNull();
  });
});

describe('parseSystemdBlame', () => {
  it('maps units to milliseconds', () => {
    const m = parseSystemdBlame(BLAME);
    expect(m.size).toBe(7);
    expect(m.get('NetworkManager-wait-online.service')).toBe(90_003);
    expect(m.get('snapd.service')).toBe(5217);
    expect(m.get('ssh.service')).toBe(512);
    expect(m.get('systemd-random-seed.service')).toBe(0.85);
  });

  it('ignores junk lines and CRLF', () => {
    const m = parseSystemdBlame('Failed to connect to bus\r\n   1.5s a.service\r\n');
    expect([...m.entries()]).toEqual([['a.service', 1500]]);
  });
});

describe('startupImpact', () => {
  it('uses the 1 s / 300 ms thresholds', () => {
    expect(startupImpact(1000)).toBe('high');
    expect(startupImpact(999)).toBe('medium');
    expect(startupImpact(300)).toBe('medium');
    expect(startupImpact(299)).toBe('low');
    expect(startupImpact(null)).toBeNull();
  });
});
