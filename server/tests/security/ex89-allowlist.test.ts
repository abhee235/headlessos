// EX8.9: Allowlist coverage for Task Manager Users / App history / Startup / Services
// @see docs/phases/phase-ex8.md, docs/SECURITY.md

import { describe, it, expect } from 'vitest';
import { validateCommand, isBlockedCommand, matchAllowedCommand } from '../../src/security/validators.js';
import {
  PROBE,
  buildUnitInfoCommand,
  buildSysvCommand,
  buildSystemctlEnableCommand,
} from '../../src/services/domain/init-system.js';

describe('EX8.9 probes', () => {
  it.each(Object.entries(PROBE))('%s is allowlisted and not blocked', (_name, cmd) => {
    expect(isBlockedCommand(cmd)).toBe(false);
    expect(() => validateCommand(cmd)).not.toThrow();
  });

  it('commands with passwd / reboot stay blocked (why accounts use SFTP and cron greps ^@)', () => {
    expect(isBlockedCommand('getent passwd')).toBe(true);
    expect(isBlockedCommand('cat /etc/passwd')).toBe(true);
    expect(isBlockedCommand("grep -sh '^@reboot' /etc/crontab")).toBe(true);
  });
});

describe('EX8.9 builders', () => {
  it('produce allowlisted commands', () => {
    const cmds = [
      buildUnitInfoCommand(['ssh.service', 'getty@tty1.service', 'systemd-fsck@dev-sda1.service'])!,
      buildSysvCommand('nginx', 'start'),
      buildSysvCommand('nginx.service', 'stop'),
      buildSysvCommand('hwclock.sh', 'restart'),
      buildSysvCommand('nginx', 'enable'),
      buildSysvCommand('nginx', 'disable'),
      buildSystemctlEnableCommand('nginx.service', 'enable'),
      buildSystemctlEnableCommand('nginx.service', 'disable'),
    ];
    for (const c of cmds) expect(() => validateCommand(c), c).not.toThrow();
    expect(buildSysvCommand('nginx.service', 'stop')).toBe("sudo service 'nginx' stop");
    expect(buildSysvCommand('nginx', 'enable')).toBe("sudo update-rc.d 'nginx' enable");
  });

  it('buildUnitInfoCommand drops unsafe unit names and returns null for none', () => {
    const cmd = buildUnitInfoCommand(['ssh.service', "x'; id; '.service", 'foo bar.service', 'notaunit'])!;
    expect(cmd).toBe("systemctl show --no-pager --property=Id,Description,ExecStart 'ssh.service'");
    expect(buildUnitInfoCommand([])).toBeNull();
    expect(buildUnitInfoCommand(['$(id).service'])).toBeNull();
  });
});

describe('EX8.9 near-miss rejections', () => {
  const rejected = [
    // probes with extra arguments, chaining or different paths
    'ps -eo user:32=,tty=,etimes=,args=',
    'ps -eo pid=,ppid=,cputimes=,rss=,user:32=,comm= ; id',
    'ps -o comm= -p 12',
    'ps -o comm= -p 1 | sh',
    "grep -sE '^(read|write)_bytes' /proc/[0-9]*/environ",
    "grep -sE '^(read|write)_bytes' /proc/[0-9]*/io /etc/shadow",
    "grep -sh '^[[:space:]]*@' /etc/crontab /etc/cron.d/* /etc/shadow",
    "grep -s '^# Short-Description:' /etc/init.d/* /root/.ssh/id_rsa",
    'ls -1 /etc/init.d /root',
    'ls -1 /root',
    'test -d /run/systemd/system && id',
    'id -un; id',
    'systemd-analyze plot --no-pager',
    'systemd-analyze blame --no-pager > /tmp/x',
    "systemctl show --no-pager --property=Id,MainPID,UnitFileState '*.service' ; id",
    "systemctl show --no-pager --property=Id,Description,ExecStart 'ssh.service' $(id)",
    'service --status-all | sh',
    'systemctl list-unit-files --type=service --no-legend --no-pager --root=/tmp',
    // control commands
    "sudo service 'nginx' reload",
    "sudo service 'nginx; id' start",
    "sudo service 'nginx' start && id",
    "sudo service nginx' start",
    "sudo update-rc.d 'nginx' remove",
    "sudo update-rc.d 'nginx' defaults",
    "sudo update-rc.d -f 'nginx' remove",
    "sudo systemctl enable 'nginx.service' --now",
    "sudo systemctl enable 'nginx.service; id'",
    "sudo systemctl mask 'nginx.service'",
  ];

  it.each(rejected)('rejects %s', (cmd) => {
    expect(() => validateCommand(cmd)).toThrow();
  });

  it('quoted and bare systemctl forms are both accepted', () => {
    expect(matchAllowedCommand("sudo systemctl restart 'nginx.service'")).not.toBeNull();
    expect(matchAllowedCommand('sudo systemctl restart nginx')).not.toBeNull();
    expect(matchAllowedCommand("sudo systemctl restart 'nginx")).toBeNull();
  });
});
