// EX8.9: Tests for TaskManagerService Users / App history / Startup apps
// @see docs/phases/phase-ex8.md
//
// SSH is scripted per command; every command the service runs must pass the
// exact allowlist (validateCommand), so a new probe cannot slip in unlisted.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { TaskManagerService } from '../../../src/services/domain/taskmanager-service.js';
import { BaseService } from '../../../src/services/base-service.js';
import { validateCommand } from '../../../src/security/validators.js';
import { PROBE } from '../../../src/services/domain/init-system.js';
import {
  TaskManagerUsersSchema,
  AppHistorySchema,
  StartupSchema,
} from '../../../src/parsers/schemas/taskmanager.js';
import type { ExecResult } from '../../../src/ssh/connection-manager.js';

class MockConnection extends BaseService {
  exec = vi.fn<(serverId: string, command: string, timeout?: number) => Promise<ExecResult>>();
  getState = vi.fn<(id: string) => { status: string }>(() => ({ status: 'connected' }));
  getSftp = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
}
class StubOrchestrator extends BaseService { execute = vi.fn(); }
class StubPipeline extends BaseService { parse = vi.fn(); }

function res(stdout = '', exitCode = 0, stderr = ''): ExecResult {
  return { stdout, stderr, exitCode, durationMs: 0 };
}

const NOT_FOUND = res('', 127, 'sh: 1: not found');

async function boot(): Promise<{ svc: TaskManagerService; ssh: MockConnection }> {
  const container = new ServiceContainer();
  const ssh = new MockConnection('ssh');
  const svc = new TaskManagerService('taskmanager');
  container.register('ssh', ssh);
  container.register('orchestrator', new StubOrchestrator('orchestrator'));
  container.register('parser', new StubPipeline('parser'));
  container.register('taskmanager', svc);
  await container.boot();
  return { svc, ssh };
}

const notAllowlisted: string[] = [];

/** Script exec by exact command; unknown commands fail like a missing binary. */
function script(ssh: MockConnection, map: Record<string, ExecResult | Error>): void {
  ssh.exec.mockImplementation(async (_id, cmd) => {
    // execSafe swallows throws, so collect violations and assert in afterEach
    try { validateCommand(cmd); } catch { notAllowlisted.push(cmd); }
    const r = map[cmd];
    if (r instanceof Error) throw r;
    return r ?? NOT_FOUND;
  });
}

function sftpWith(content: string | Error) {
  return {
    readFile: (_p: string, cb: (err: Error | undefined, buf: Buffer) => void) =>
      content instanceof Error ? cb(content, Buffer.alloc(0)) : cb(undefined, Buffer.from(content)),
  };
}

const PROC_STAT = 'cpu  1 2 3 4\nbtime 1792459265\nprocesses 10\n';

describe('TaskManagerService — EX8.9 pages', () => {
  let svc: TaskManagerService;
  let ssh: MockConnection;

  beforeEach(async () => {
    notAllowlisted.length = 0;
    ({ svc, ssh } = await boot());
  });

  afterEach(() => {
    expect(notAllowlisted).toEqual([]);
  });

  it('every page returns 400 when disconnected', async () => {
    ssh.getState.mockReturnValue({ status: 'disconnected' });
    for (const r of [
      await svc.getUsers('s1'),
      await svc.getAppHistory('s1'),
      await svc.getStartup('s1'),
      await svc.setStartupItem('s1', 'ssh.service', 'enable'),
    ]) {
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    }
    expect(ssh.exec).not.toHaveBeenCalled();
  });

  // ── Users ──

  describe('getUsers', () => {
    it('reads /etc/passwd over SFTP and builds sessions from who', async () => {
      ssh.getSftp.mockResolvedValue(sftpWith('root:x:0:0:root:/root:/bin/bash\ntestuser:x:1000:1000::/home/testuser:/bin/bash\n'));
      script(ssh, {
        [PROBE.who]: res('testuser pts/0        2026-10-20 14:02 (192.168.1.5)\n'),
        [PROBE.ttyProcesses]: res('testuser                         pts/0       60\n'),
        [PROBE.currentUser]: res('testuser\n'),
      });
      const r = await svc.getUsers('s1');
      expect(r.ok).toBe(true);
      const d = TaskManagerUsersSchema.parse(r.data);
      expect(d.accounts.map((a) => [a.name, a.kind])).toEqual([['root', 'admin'], ['testuser', 'standard']]);
      expect(d.sessions).toHaveLength(1);
      expect(d.sessions[0]).toMatchObject({ user: 'testuser', tty: 'pts/0', from: '192.168.1.5' });
      expect(d.sessions[0]!.loginAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(d.currentUser).toBe('testuser');
    });

    it('degrades to empty lists when SFTP and every command fail', async () => {
      ssh.getSftp.mockRejectedValue(new Error('no sftp'));
      script(ssh, { [PROBE.currentUser]: new Error('Command timed out') });
      const r = await svc.getUsers('s1');
      expect(r.ok).toBe(true);
      expect(r.data).toEqual({ accounts: [], sessions: [], currentUser: '' });
    });
  });

  // ── App history ──

  describe('getAppHistory', () => {
    it('aggregates running processes and reports boot time', async () => {
      script(ssh, {
        [PROBE.appProcesses]: res([
          '      1       0      12  11520 root                             systemd',
          '    812       1     340  98304 www-data                         nginx',
          '    813     812     120  40960 www-data                         nginx',
          '   1300       1       2   5000 testuser                         bash',
          '   1301    1300       0   3000 testuser                         ps',
        ].join('\n')),
        // grep exits 2 on unreadable files — output still used
        [PROBE.procIo]: res('/proc/1300/io:read_bytes: 10\n/proc/1300/io:write_bytes: 20\n', 2),
        [PROBE.procStat]: res(PROC_STAT),
        [PROBE.currentUser]: res('testuser\n'),
      });
      const r = await svc.getAppHistory('s1');
      expect(r.ok).toBe(true);
      const d = AppHistorySchema.parse(r.data);
      expect(d.since).toBe('2026-10-20T01:21:05.000Z');
      expect(d.ioReadable).toBe(false);
      expect(d.apps.map((a) => a.name)).toEqual(['nginx', 'systemd', 'bash']);
      expect(d.apps[0]).toMatchObject({ cpuSeconds: 460, instances: 2, readBytes: null });
      expect(d.apps[2]).toMatchObject({ readBytes: 10, writeBytes: 20, users: ['testuser'] });
    });

    it('returns an empty list (not a 500) when ps fails', async () => {
      script(ssh, {});
      const r = await svc.getAppHistory('s1');
      expect(r.ok).toBe(true);
      expect(r.data!.apps).toEqual([]);
      expect(r.data!.ioReadable).toBe(false);
    });
  });

  // ── Startup apps ──

  describe('getStartup', () => {
    it('systemd host: unit files + blame + boot times + cron @reboot', async () => {
      script(ssh, {
        [PROBE.pid1]: res('systemd\n'),
        [PROBE.systemdBooted]: res(),
        [PROBE.procStat]: res(PROC_STAT),
        [PROBE.cronSystemSpecial]: res('@reboot root /usr/local/bin/warm.sh\n@daily root /usr/bin/backup\n'),
        [PROBE.cronUser]: res('', 1, 'no crontab for deploy'),
        [PROBE.unitFiles]: res('ssh.service enabled enabled\nnginx.service disabled enabled\ngetty@.service enabled enabled\napt-daily.service static -\n'),
        [PROBE.analyzeTime]: res('Startup finished in 2.354s (kernel) + 14.620s (userspace) = 16.975s\n'),
        [PROBE.analyzeBlame]: res('  1.204s ssh.service\n'),
        "systemctl show --no-pager --property=Id,Description,ExecStart 'ssh.service' 'nginx.service'": res(
          'Id=ssh.service\nDescription=OpenBSD Secure Shell server\nExecStart={ path=/usr/sbin/sshd ; argv[]=/usr/sbin/sshd -D ; ignore_errors=no ; pid=0 }\n\n' +
          'Id=nginx.service\nDescription=nginx web server\nExecStart=\n',
        ),
      });
      const r = await svc.getStartup('s1');
      expect(r.ok).toBe(true);
      const d = StartupSchema.parse(r.data);
      expect(d.init).toBe('systemd');
      expect(d.pid1).toBe('systemd');
      expect(d.bootedAt).toBe('2026-10-20T01:21:05.000Z');
      expect(d.boot).toEqual({ totalMs: 16_975, firmwareMs: null, loaderMs: null, kernelMs: 2354, userspaceMs: 14_620 });
      expect(d.items.map((i) => [i.id, i.source, i.enabled])).toEqual([
        ['ssh.service', 'systemd', true],
        ['@reboot#1', 'cron', true],
        ['nginx.service', 'systemd', false],
      ]);
      expect(d.items[0]).toMatchObject({ name: 'OpenBSD Secure Shell server', command: '/usr/sbin/sshd -D', impact: 'high', delayMs: 1204 });
    });

    it('SysV container (dev box): rc2.d links, no boot breakdown', async () => {
      script(ssh, {
        [PROBE.pid1]: res('sshd\n'),
        [PROBE.systemdBooted]: res('', 1),
        [PROBE.procStat]: res(PROC_STAT),
        [PROBE.cronSystemSpecial]: res('', 2),
        [PROBE.initD]: res('README\ndbus\nhwclock.sh\nnginx\nprocps\nssh\n'),
        [PROBE.rc2d]: res('README\nS01dbus\nS01nginx\nS01ssh\n'),
        [PROBE.initDescriptions]: res('/etc/init.d/ssh:# Short-Description:\tOpenBSD Secure Shell server\n'),
      });
      const r = await svc.getStartup('s1');
      expect(r.ok).toBe(true);
      const d = StartupSchema.parse(r.data);
      expect(d.init).toBe('sysv');
      expect(d.pid1).toBe('sshd');
      expect(d.boot).toBeNull();
      expect(d.items.map((i) => i.id)).toEqual(['dbus', 'nginx', 'ssh']);
      expect(d.items.find((i) => i.id === 'ssh')!.name).toBe('OpenBSD Secure Shell server');
      // systemd commands are never tried on a SysV host
      const cmds = ssh.exec.mock.calls.map((c) => c[1]);
      expect(cmds).not.toContain(PROBE.unitFiles);
    });

    it("init 'none' when neither systemd nor /etc/init.d exists", async () => {
      script(ssh, {
        [PROBE.pid1]: res('tini\n'),
        [PROBE.systemdBooted]: res('', 1),
        [PROBE.procStat]: res(PROC_STAT),
        [PROBE.initD]: res('', 2, "ls: cannot access '/etc/init.d': No such file or directory"),
      });
      const r = await svc.getStartup('s1');
      expect(r.ok).toBe(true);
      expect(r.data).toMatchObject({ init: 'none', pid1: 'tini', boot: null, items: [] });
    });
  });

  // ── Startup toggle ──

  describe('setStartupItem', () => {
    it('systemd unit → sudo systemctl enable', async () => {
      script(ssh, { "sudo systemctl enable 'nginx.service'": res() });
      const r = await svc.setStartupItem('s1', 'nginx.service', 'enable');
      expect(r.ok).toBe(true);
      expect(ssh.exec).toHaveBeenCalledWith('s1', "sudo systemctl enable 'nginx.service'", expect.any(Number));
    });

    it('SysV script → sudo update-rc.d', async () => {
      script(ssh, { "sudo update-rc.d 'nginx' disable": res() });
      const r = await svc.setStartupItem('s1', 'nginx', 'disable');
      expect(r.ok).toBe(true);
      expect(ssh.exec).toHaveBeenCalledWith('s1', "sudo update-rc.d 'nginx' disable", expect.any(Number));
    });

    it('surfaces stderr on failure', async () => {
      script(ssh, { "sudo systemctl disable 'ssh.service'": res('', 1, 'sudo: a password is required') });
      const r = await svc.setStartupItem('s1', 'ssh.service', 'disable');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(500);
      expect(r.error).toContain('password');
    });

    it('rejects cron items, bad actions and injected names without running anything', async () => {
      const cases: Array<[string, string]> = [
        ['@reboot#1', 'disable'],
        ['ssh.service', 'start'],
        ['ssh.service', 'mask'],
        ["ssh'; id; '", 'enable'],
        ['ssh.service enable x', 'enable'],
        ['$(id)', 'enable'],
        ['', 'enable'],
      ];
      for (const [item, action] of cases) {
        const r = await svc.setStartupItem('s1', item, action);
        expect(r.ok, `${item} ${action}`).toBe(false);
        expect(r.statusCode).toBe(400);
      }
      expect(ssh.exec).not.toHaveBeenCalled();
    });
  });
});
