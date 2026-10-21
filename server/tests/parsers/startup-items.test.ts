// EX8.9: Tests for Startup apps — unit files, systemctl show, cron @reboot, builders
// @see docs/phases/phase-ex8.md

import { describe, it, expect } from 'vitest';
import {
  parseListUnitFiles,
  parseSystemctlShow,
  parseExecStartArgv,
  unitFileStateToStartup,
} from '../../src/parsers/deterministic/systemctl.js';
import { parseSystemdBlame } from '../../src/parsers/deterministic/systemd-analyze.js';
import { parseRcLinks, parseShortDescriptions } from '../../src/parsers/deterministic/sysv-init.js';
import {
  parseRebootCron,
  buildCronItems,
  buildSystemdStartupItems,
  buildSysvStartupItems,
  sortStartupItems,
  isStartupUnitFile,
  CRON_ID_PREFIX,
} from '../../src/parsers/deterministic/startup-items.js';
import { StartupSchema } from '../../src/parsers/schemas/taskmanager.js';

// Ubuntu 24.04, systemd 255 (three columns: UNIT FILE, STATE, PRESET)
const UNIT_FILES = `apt-daily-upgrade.service              static          -
apt-daily.service                      static          -
autovt@.service                        alias           -
cron.service                           enabled         enabled
cryptdisks.service                     masked          enabled
docker.service                         enabled         enabled
getty@.service                         enabled         enabled
nginx.service                          disabled        enabled
ssh.service                            enabled         enabled
systemd-networkd-wait-online.service   enabled-runtime enabled
dbus-org.freedesktop.login1.service    alias           -
`;

// systemd 239 (no PRESET column)
const UNIT_FILES_OLD = `crond.service                 enabled
sshd.service                  enabled
kdump.service                 disabled
`;

const SHOW_INFO = `Id=cron.service
Description=Regular background program processing daemon
ExecStart={ path=/usr/sbin/cron ; argv[]=/usr/sbin/cron -f -P $EXTRA_OPTS ; ignore_errors=no ; start_time=[Tue 2026-10-20 09:00:01 UTC] ; stop_time=[n/a] ; pid=702 ; code=(null) ; status=0/0 }

Id=docker.service
Description=Docker Application Container Engine
ExecStart={ path=/usr/bin/dockerd ; argv[]=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }

Id=nginx.service
Description=A high performance web server and a reverse proxy server
ExecStart={ path=/usr/sbin/nginx ; argv[]=/usr/sbin/nginx -g daemon on; master_process on; ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }

Id=ssh.service
Description=OpenBSD Secure Shell server
ExecStart={ path=/usr/sbin/sshd ; argv[]=/usr/sbin/sshd -D $SSHD_OPTS ; flags= ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }

Id=systemd-networkd-wait-online.service
Description=Wait for Network to be Configured
ExecStart=
`;

const BLAME = `      6.104s systemd-networkd-wait-online.service
      2.317s docker.service
       412ms cron.service
        88ms ssh.service
`;

describe('parseListUnitFiles', () => {
  it('parses three-column output', () => {
    const files = parseListUnitFiles(UNIT_FILES);
    expect(files).toHaveLength(11);
    expect(files.find((f) => f.unit === 'nginx.service')).toEqual({ unit: 'nginx.service', state: 'disabled' });
  });

  it('parses two-column output from older systemd', () => {
    expect(parseListUnitFiles(UNIT_FILES_OLD).map((f) => f.state)).toEqual(['enabled', 'enabled', 'disabled']);
  });

  it('returns [] for errors', () => {
    expect(parseListUnitFiles('System has not been booted with systemd as init system (PID 1).')).toEqual([]);
  });
});

describe('isStartupUnitFile', () => {
  it('keeps enabled / disabled, drops static, masked, alias and templates', () => {
    const kept = parseListUnitFiles(UNIT_FILES).filter(isStartupUnitFile).map((f) => f.unit);
    expect(kept).toEqual([
      'cron.service', 'docker.service', 'nginx.service', 'ssh.service', 'systemd-networkd-wait-online.service',
    ]);
  });
});

describe('parseSystemctlShow', () => {
  it('splits blocks on blank lines and keeps = inside values', () => {
    const blocks = parseSystemctlShow(SHOW_INFO);
    expect(blocks).toHaveLength(5);
    expect(blocks[0]!.Id).toBe('cron.service');
    expect(blocks[1]!.ExecStart).toContain('--containerd=/run/containerd/containerd.sock');
    expect(blocks[4]!.ExecStart).toBe('');
  });

  it('handles CRLF and an empty string', () => {
    expect(parseSystemctlShow('Id=a.service\r\nMainPID=7\r\n\r\nId=b.service\r\n')).toEqual([
      { Id: 'a.service', MainPID: '7' },
      { Id: 'b.service' },
    ]);
    expect(parseSystemctlShow('')).toEqual([]);
  });
});

describe('parseExecStartArgv', () => {
  it('extracts argv, including argv with semicolons', () => {
    const blocks = parseSystemctlShow(SHOW_INFO);
    expect(parseExecStartArgv(blocks[0]!.ExecStart)).toBe('/usr/sbin/cron -f -P $EXTRA_OPTS');
    expect(parseExecStartArgv(blocks[2]!.ExecStart)).toBe('/usr/sbin/nginx -g daemon on; master_process on;');
    expect(parseExecStartArgv(blocks[3]!.ExecStart)).toBe('/usr/sbin/sshd -D $SSHD_OPTS');
  });

  it('null when empty', () => {
    expect(parseExecStartArgv('')).toBeNull();
    expect(parseExecStartArgv(undefined)).toBeNull();
  });
});

describe('unitFileStateToStartup', () => {
  it('maps per the contract', () => {
    expect(unitFileStateToStartup('enabled')).toBe('automatic');
    expect(unitFileStateToStartup('enabled-runtime')).toBe('automatic');
    expect(unitFileStateToStartup('disabled')).toBe('manual');
    expect(unitFileStateToStartup('static')).toBe('manual');
    expect(unitFileStateToStartup('indirect')).toBe('manual');
    expect(unitFileStateToStartup('masked')).toBe('disabled');
    expect(unitFileStateToStartup('masked-runtime')).toBe('disabled');
    expect(unitFileStateToStartup('generated')).toBeNull();
    expect(unitFileStateToStartup('')).toBeNull();
    expect(unitFileStateToStartup(undefined)).toBeNull();
  });
});

describe('buildSystemdStartupItems', () => {
  const items = buildSystemdStartupItems(
    parseListUnitFiles(UNIT_FILES),
    parseSystemdBlame(BLAME),
    parseSystemctlShow(SHOW_INFO),
  );

  it('builds one item per enabled/disabled unit with description, command, delay and impact', () => {
    expect(items).toHaveLength(5);
    expect(items.find((i) => i.id === 'docker.service')).toEqual({
      id: 'docker.service',
      name: 'Docker Application Container Engine',
      command: '/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock',
      source: 'systemd',
      enabled: true,
      delayMs: 2317,
      impact: 'high',
      toggleable: true,
    });
    expect(items.find((i) => i.id === 'cron.service')).toMatchObject({ delayMs: 412, impact: 'medium' });
    expect(items.find((i) => i.id === 'ssh.service')).toMatchObject({ delayMs: 88, impact: 'low' });
  });

  it('disabled units have no delay; enabled-runtime is not toggleable', () => {
    expect(items.find((i) => i.id === 'nginx.service')).toMatchObject({ enabled: false, delayMs: null, impact: null, toggleable: true });
    expect(items.find((i) => i.id === 'systemd-networkd-wait-online.service')).toMatchObject({
      enabled: true, toggleable: false, command: null, impact: 'high',
    });
  });

  it('falls back to the unit name when systemctl show failed', () => {
    const bare = buildSystemdStartupItems(parseListUnitFiles(UNIT_FILES_OLD), new Map(), []);
    expect(bare.map((i) => i.name)).toEqual(['crond', 'sshd', 'kdump']);
    expect(bare.every((i) => i.command === null && i.delayMs === null)).toBe(true);
  });
});

describe('parseRebootCron', () => {
  it('strips the user field from system crontab lines', () => {
    const raw = `@reboot root /usr/local/bin/warm-cache.sh --all
  @reboot   www-data  /srv/app/bin/start
@daily root /usr/bin/backup
`;
    expect(parseRebootCron(raw, true)).toEqual(['/usr/local/bin/warm-cache.sh --all', '/srv/app/bin/start']);
  });

  it('reads user crontab lines without a user field, skips comments', () => {
    const raw = `# m h dom mon dow command
#@reboot /old/thing
@reboot sleep 30 && /home/deploy/run.sh
*/5 * * * * /home/deploy/poll.sh
`;
    expect(parseRebootCron(raw, false)).toEqual(['sleep 30 && /home/deploy/run.sh']);
  });

  it('no crontab / not installed → []', () => {
    expect(parseRebootCron('no crontab for testuser', false)).toEqual([]);
    expect(parseRebootCron('', true)).toEqual([]);
  });
});

describe('buildCronItems', () => {
  it('builds read-only items with @reboot# ids', () => {
    const items = buildCronItems(['/usr/local/bin/warm-cache.sh --all', 'sleep 30 && /home/deploy/run.sh']);
    expect(items[0]).toEqual({
      id: `${CRON_ID_PREFIX}1`, name: 'warm-cache.sh', command: '/usr/local/bin/warm-cache.sh --all',
      source: 'cron', enabled: true, delayMs: null, impact: null, toggleable: false,
    });
    expect(items[1]!.name).toBe('sleep');
  });
});

describe('buildSysvStartupItems', () => {
  it('lists runlevel-2 scripts only, named by Short-Description', () => {
    const items = buildSysvStartupItems(
      parseRcLinks('S01dbus\nS01nginx\nS01ssh\nK01apache2\nK02gone\n'),
      parseShortDescriptions('/etc/init.d/ssh:# Short-Description:\tOpenBSD Secure Shell server\n'),
      ['apache2', 'dbus', 'hwclock.sh', 'nginx', 'procps', 'ssh'],
    );
    expect(items.map((i) => i.id)).toEqual(['dbus', 'nginx', 'ssh', 'apache2']);
    expect(items.find((i) => i.id === 'ssh')).toEqual({
      id: 'ssh', name: 'OpenBSD Secure Shell server', command: '/etc/init.d/ssh',
      source: 'sysv', enabled: true, delayMs: null, impact: null, toggleable: true,
    });
    expect(items.find((i) => i.id === 'apache2')!.enabled).toBe(false);
  });
});

describe('sortStartupItems', () => {
  it('enabled first, then slowest, then name — and the whole payload is schema-valid', () => {
    const items = sortStartupItems([
      ...buildSystemdStartupItems(parseListUnitFiles(UNIT_FILES), parseSystemdBlame(BLAME), parseSystemctlShow(SHOW_INFO)),
      ...buildCronItems(['/usr/local/bin/warm-cache.sh']),
    ]);
    expect(items.map((i) => i.id)).toEqual([
      'systemd-networkd-wait-online.service', 'docker.service', 'cron.service', 'ssh.service', '@reboot#1', 'nginx.service',
    ]);
    StartupSchema.parse({ init: 'systemd', pid1: 'systemd', bootedAt: '2026-10-20T09:00:00.000Z', boot: null, items });
  });
});
