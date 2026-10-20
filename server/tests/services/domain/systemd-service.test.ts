// M12.8: Tests for SystemdService domain layer
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { SystemdService } from '../../../src/services/domain/systemd-service.js';
import { BaseService } from '../../../src/services/base-service.js';
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
