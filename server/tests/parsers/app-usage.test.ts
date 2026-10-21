// EX8.9: Tests for App history parsers (ps aggregation, /proc/<pid>/io)
// @see docs/phases/phase-ex8.md

import { describe, it, expect } from 'vitest';
import {
  parseAppProcessRows,
  parseProcIo,
  aggregateApps,
  isIoReadable,
  parseBootTime,
} from '../../src/parsers/deterministic/app-usage.js';
import { AppHistorySchema } from '../../src/parsers/schemas/taskmanager.js';

// `ps -eo pid=,ppid=,cputimes=,rss=,user:32=,comm=`
const PS = `      1       0      12  11520 root                             systemd
      2       0       0      0 root                             kthreadd
     14       2       9      0 root                             ksoftirqd/0
    812       1     340  98304 www-data                         nginx
    813     812     120  40960 www-data                         nginx
    900       1      30  20480 root                             nginx
   1200       1       5   8000 deploy                           tmux: server
   1300    1200       2   5000 deploy                           bash
   1301    1300       0   3000 deploy                           ps
   1302    1300       0   2000 deploy                           grep
   1303       1       0   2100 root                             cat
`;

// `grep -sE '^(read|write)_bytes' /proc/[0-9]*/io` as user deploy
const IO_DEPLOY = `/proc/1200/io:read_bytes: 4096
/proc/1200/io:write_bytes: 8192
/proc/1300/io:read_bytes: 1000
/proc/1300/io:write_bytes: 0
/proc/1301/io:read_bytes: 0
/proc/1301/io:write_bytes: 0
`;

const IO_ROOT = `${IO_DEPLOY}/proc/812/io:read_bytes: 1048576
/proc/812/io:write_bytes: 2048
/proc/813/io:read_bytes: 1024
/proc/813/io:write_bytes: 0
/proc/1/io:read_bytes: 99
/proc/1/io:write_bytes: 1
`;

describe('parseAppProcessRows', () => {
  it('keeps comm with spaces whole', () => {
    const rows = parseAppProcessRows(PS);
    expect(rows).toHaveLength(11);
    expect(rows.find((r) => r.pid === 1200)).toEqual({
      pid: 1200, ppid: 1, cpuSeconds: 5, rssKb: 8000, user: 'deploy', comm: 'tmux: server',
    });
  });

  it('skips malformed lines', () => {
    expect(parseAppProcessRows('garbage\n  PID PPID\n')).toEqual([]);
  });
});

describe('parseProcIo', () => {
  it('pairs read and write bytes per pid', () => {
    const m = parseProcIo(IO_ROOT);
    expect(m.get(812)).toEqual({ readBytes: 1_048_576, writeBytes: 2048 });
    expect(m.get(1200)).toEqual({ readBytes: 4096, writeBytes: 8192 });
    expect(m.has(900)).toBe(false);
  });
});

describe('aggregateApps', () => {
  it('groups by command, drops kernel threads and the SSH user\'s probes, sorts by CPU', () => {
    const apps = aggregateApps(parseAppProcessRows(PS), parseProcIo(IO_DEPLOY), 'deploy');
    AppHistorySchema.parse({ since: '2026-10-20T00:00:00.000Z', ioReadable: false, apps });
    const names = apps.map((a) => a.name);
    expect(names).not.toContain('kthreadd');
    expect(names).not.toContain('ksoftirqd/0');
    expect(names).not.toContain('ps');
    expect(names).not.toContain('grep');
    // cat run by root is not a HeadlessOS probe
    expect(names).toContain('cat');
    expect(names[0]).toBe('nginx');

    const nginx = apps[0]!;
    expect(nginx).toMatchObject({ cpuSeconds: 490, rssKb: 159_744, instances: 3, users: ['root', 'www-data'] });
    // deploy cannot read other users' /proc/<pid>/io
    expect(nginx.readBytes).toBeNull();
    expect(nginx.writeBytes).toBeNull();
    expect(apps.find((a) => a.name === 'tmux: server')).toMatchObject({ readBytes: 4096, writeBytes: 8192 });
  });

  it('sums readable instances as root', () => {
    const apps = aggregateApps(parseAppProcessRows(PS), parseProcIo(IO_ROOT), 'root');
    const nginx = apps.find((a) => a.name === 'nginx')!;
    expect(nginx.readBytes).toBe(1_048_576 + 1024);
    // root's own `cat` probe is hidden
    expect(apps.map((a) => a.name)).not.toContain('cat');
  });

  it('returns [] for empty output', () => {
    expect(aggregateApps([], new Map(), 'x')).toEqual([]);
  });
});

describe('isIoReadable', () => {
  const rows = parseAppProcessRows(PS);
  it('false when only the SSH user\'s own processes were readable', () => {
    expect(isIoReadable(rows, parseProcIo(IO_DEPLOY), 'deploy')).toBe(false);
  });
  it('true when other users\' processes were readable', () => {
    expect(isIoReadable(rows, parseProcIo(IO_ROOT), 'deploy')).toBe(true);
  });
  it('true for root', () => {
    expect(isIoReadable(rows, new Map(), 'root')).toBe(true);
  });
});

describe('parseBootTime', () => {
  it('reads btime from /proc/stat', () => {
    expect(parseBootTime('cpu  1 2 3\nbtime 1792459265\nprocesses 99\n')).toBe('2026-10-20T01:21:05.000Z');
  });
  it('null without btime', () => {
    expect(parseBootTime('')).toBeNull();
  });
});
