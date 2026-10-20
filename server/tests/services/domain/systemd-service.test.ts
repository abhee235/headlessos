// M12.8: Tests for SystemdService domain layer
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { SystemdService } from '../../../src/services/domain/systemd-service.js';
import { BaseService } from '../../../src/services/base-service.js';
import type { ExecResult } from '../../../src/ssh/connection-manager.js';
import { validateCommand } from '../../../src/security/validators.js';
import { PROBE } from '../../../src/services/domain/init-system.js';
import { ServiceListSchema } from '../../../src/parsers/schemas/services.js';

class MockConnection extends BaseService {
  exec = vi.fn<(serverId: string, command: string, timeout?: number) => Promise<ExecResult>>();
  getState = vi.fn<(id: string) => { status: string }>(() => ({ status: 'connected' }));
  getSftp = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
}

class StubOrchestrator extends BaseService { execute = vi.fn(); }
class StubPipeline extends BaseService { parse = vi.fn(); }

function ok(stdout: string, exitCode = 0, stderr = ''): ExecResult {
  return { stdout, stderr, exitCode, durationMs: 0 };
}

async function boot(): Promise<{ svc: SystemdService; ssh: MockConnection }> {
  const container = new ServiceContainer();
  const ssh = new MockConnection('ssh');
  const orch = new StubOrchestrator('orchestrator');
  const pipe = new StubPipeline('parser');
  const svc = new SystemdService('systemd');
  container.register('ssh', ssh);
  container.register('orchestrator', orch);
  container.register('parser', pipe);
  container.register('systemd', svc);
  await container.boot();
  return { svc, ssh };
}

describe('SystemdService', () => {
  let svc: SystemdService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await boot());
  });

  describe('listServices', () => {
    it('returns fail(400) when disconnected', async () => {
      ssh.getState.mockReturnValue({ status: 'disconnected' });
      const r = await svc.listServices('s1');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns systemdAvailable:false when systemctl missing', async () => {
      ssh.exec.mockResolvedValue(ok('', 127, 'systemctl: command not found'));
      const r = await svc.listServices('s1');
      expect(r.ok).toBe(true);
      expect(r.data!.systemdAvailable).toBe(false);
    });

    it('parses systemctl list-units output', async () => {
      const output = [
        'UNIT                   LOAD   ACTIVE SUB     DESCRIPTION',
        'nginx.service          loaded active running nginx HTTP Server',
        '',
        '1 loaded units listed',
      ].join('\n');
      ssh.exec.mockResolvedValue(ok(output));
      const r = await svc.listServices('s1');
      expect(r.ok).toBe(true);
      expect(r.data!.systemdAvailable).toBe(true);
    });
  });

  describe('controlService', () => {
    it('returns fail(400) for invalid service name', async () => {
      const r = await svc.controlService('s1', '../etc/passwd', 'start');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns fail(400) for invalid action', async () => {
      const r = await svc.controlService('s1', 'nginx', 'destroy' as never);
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('executes sudo systemctl start for valid inputs', async () => {
      ssh.exec.mockResolvedValue(ok('', 0));
      const r = await svc.controlService('s1', 'nginx', 'start');
      expect(r.ok).toBe(true);
      expect(ssh.exec).toHaveBeenCalledWith(
        's1',
        expect.stringContaining('systemctl start'),
        expect.any(Number),
      );
    });

    it('appends .service suffix if missing', async () => {
      ssh.exec.mockResolvedValue(ok('', 0));
      await svc.controlService('s1', 'nginx', 'restart');
      const cmd = ssh.exec.mock.calls[0]![1] as string;
      expect(cmd).toContain('nginx.service');
    });

    it('returns fail on non-zero exit', async () => {
      ssh.exec.mockResolvedValue(ok('', 1, 'Failed to start nginx.service'));
      const r = await svc.controlService('s1', 'nginx', 'start');
      expect(r.ok).toBe(false);
    });
  });

  describe('getServiceLogs', () => {
    it('validates lines parameter — rejects non-integer', async () => {
      const r = await svc.getServiceLogs('s1', 'nginx', '100; rm -rf /');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns logs on success', async () => {
      ssh.exec.mockResolvedValue(ok('-- Logs begin --\nMar 01 12:00 nginx started'));
      const r = await svc.getServiceLogs('s1', 'nginx', '100');
      expect(r.ok).toBe(true);
      expect(r.data!.logs).toContain('nginx started');
    });
  });

  describe('getServiceStatus', () => {
    it('returns fail(400) when disconnected', async () => {
      ssh.getState.mockReturnValue({ status: 'disconnected' });
      const r = await svc.getServiceStatus('s1', 'nginx');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns service status on success', async () => {
      ssh.exec.mockResolvedValue(ok('● nginx.service - nginx\n   Active: active (running)'));
      const r = await svc.getServiceStatus('s1', 'nginx');
      expect(r.ok).toBe(true);
      expect(r.data!.raw).toContain('nginx');
    });
  });
});

// ── EX8.9: startup + pid, SysV fallback ──────────────────

describe('SystemdService (EX8.9)', () => {
  let svc: SystemdService;
  let ssh: MockConnection;

  function script(map: Record<string, ExecResult>): void {
    ssh.exec.mockImplementation(async (_id, cmd) => {
      // execSafe swallows throws, so collect violations and assert in afterEach
      try { validateCommand(cmd); } catch { notAllowlisted.push(cmd); }
      return map[cmd] ?? ok('', 127, 'sh: 1: not found');
    });
  }
  const notAllowlisted: string[] = [];

  beforeEach(async () => {
    notAllowlisted.length = 0;
    ({ svc, ssh } = await boot());
  });

  afterEach(() => {
    expect(notAllowlisted).toEqual([]);
  });

  it('merges MainPID and UnitFileState from systemctl show', async () => {
    script({
      [PROBE.listUnits]: ok([
        '  ssh.service      loaded active   running OpenBSD Secure Shell server',
        '  nginx.service    loaded inactive dead    A high performance web server',
        '  apt-daily.service loaded inactive dead   Daily apt download activities',
        '  cryptdisks.service masked inactive dead  cryptdisks.service',
      ].join('\n')),
      [PROBE.serviceRuntime]: ok([
        'Id=ssh.service', 'MainPID=812', 'UnitFileState=enabled', '',
        'Id=nginx.service', 'MainPID=0', 'UnitFileState=disabled', '',
        'Id=apt-daily.service', 'MainPID=0', 'UnitFileState=static', '',
        'Id=cryptdisks.service', 'MainPID=0', 'UnitFileState=masked', '',
      ].join('\n')),
    });
    const r = await svc.listServices('s1');
    expect(r.ok).toBe(true);
    expect(r.data!.init).toBe('systemd');
    expect(r.data!.systemdAvailable).toBe(true);
    const list = ServiceListSchema.parse(r.data!.services);
    const by = Object.fromEntries(list.map((s) => [s.name, s]));
    expect(by.ssh).toMatchObject({ pid: 812, startup: 'automatic', activeState: 'active' });
    expect(by.nginx).toMatchObject({ pid: null, startup: 'manual' });
    expect(by['apt-daily']).toMatchObject({ startup: 'manual' });
    expect(by.cryptdisks).toMatchObject({ startup: 'disabled' });
  });

  it('keeps the list when systemctl show fails (startup/pid null)', async () => {
    script({ [PROBE.listUnits]: ok('  ssh.service loaded active running OpenBSD Secure Shell server') });
    const r = await svc.listServices('s1');
    expect(r.ok).toBe(true);
    expect(r.data!.services[0]).toMatchObject({ name: 'ssh', startup: null, pid: null });
  });

  it('falls back to SysV when PID 1 is not systemd', async () => {
    script({
      [PROBE.listUnits]: ok('', 1, "System has not been booted with systemd as init system (PID 1). Can't operate.\nFailed to connect to bus: Host is down"),
      [PROBE.serviceStatusAll]: ok(' [ - ]  dbus\n [ - ]  nginx\n [ + ]  ssh\n', 0, ' [ ? ]  hwclock.sh\n'),
      [PROBE.rc2d]: ok('S01dbus\nS01nginx\nS01ssh\n'),
      [PROBE.initDescriptions]: ok('/etc/init.d/ssh:# Short-Description:\tOpenBSD Secure Shell server\n'),
    });
    const r = await svc.listServices('s1');
    expect(r.ok).toBe(true);
    expect(r.data!.init).toBe('sysv');
    expect(r.data!.systemdAvailable).toBe(false);
    const list = ServiceListSchema.parse(r.data!.services);
    expect(list.map((s) => s.name)).toEqual(['ssh', 'dbus', 'hwclock.sh', 'nginx']);
    expect(list[0]).toMatchObject({ activeState: 'active', startup: 'automatic', description: 'OpenBSD Secure Shell server', pid: null });
    expect(list.find((s) => s.name === 'hwclock.sh')).toMatchObject({ subState: 'unknown', startup: 'manual' });
  });

  it("init 'none' when neither systemctl nor service exist", async () => {
    script({});
    const r = await svc.listServices('s1');
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ services: [], systemdAvailable: false, init: 'none' });
  });

  it('still fails on other systemctl errors', async () => {
    script({ [PROBE.listUnits]: ok('', 1, 'Failed to list units: Access denied') });
    const r = await svc.listServices('s1');
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(500);
  });

  it('controlService uses sudo service on SysV hosts', async () => {
    script({
      "sudo systemctl restart 'nginx.service'": ok('', 1, 'System has not been booted with systemd as init system (PID 1). Can\'t operate.'),
      "sudo service 'nginx' restart": ok(' * Restarting nginx nginx   [ OK ]'),
    });
    const r = await svc.controlService('s1', 'nginx', 'restart');
    expect(r.ok).toBe(true);
    expect(ssh.exec).toHaveBeenLastCalledWith('s1', "sudo service 'nginx' restart", expect.any(Number));
  });

  it('controlService uses update-rc.d for enable/disable on SysV hosts', async () => {
    script({
      "sudo systemctl disable 'nginx.service'": ok('', 1, 'sudo: systemctl: command not found'),
      "sudo update-rc.d 'nginx' disable": ok(),
    });
    const r2 = await svc.controlService('s1', 'nginx', 'disable');
    expect(r2.ok).toBe(true);
    expect(ssh.exec).toHaveBeenLastCalledWith('s1', "sudo update-rc.d 'nginx' disable", expect.any(Number));
  });

  it('does not fall back to SysV for a missing unit on a systemd host', async () => {
    script({
      "sudo systemctl start 'nope.service'": ok('', 5, 'Failed to start nope.service: Unit nope.service not found.'),
    });
    const r = await svc.controlService('s1', 'nope', 'start');
    expect(r.ok).toBe(false);
    expect(ssh.exec).toHaveBeenCalledTimes(1);
  });
});
