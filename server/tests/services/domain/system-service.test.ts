// M12.8: Tests for SystemService domain layer
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { SystemService } from '../../../src/services/domain/system-service.js';
import { BaseService } from '../../../src/services/base-service.js';
import type { ExecResult } from '../../../src/ssh/connection-manager.js';

class MockConnection extends BaseService {
  exec = vi.fn<(serverId: string, command: string, timeout?: number) => Promise<ExecResult>>();
  getState = vi.fn<(id: string) => { status: string }>(() => ({ status: 'connected' }));
  getSftp = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockOrchestrator extends BaseService {
  execute = vi.fn();
}

class StubPipeline extends BaseService { parse = vi.fn(); }

function execOk(stdout: string, exitCode = 0): ExecResult {
  return { stdout, stderr: '', exitCode, durationMs: 0 };
}

async function boot(): Promise<{ svc: SystemService; ssh: MockConnection; orch: MockOrchestrator }> {
  const container = new ServiceContainer();
  const ssh = new MockConnection('ssh');
  const orch = new MockOrchestrator('orchestrator');
  const pipe = new StubPipeline('parser');
  const svc = new SystemService('system');
  container.register('ssh', ssh);
  container.register('orchestrator', orch);
  container.register('parser', pipe);
  container.register('system', svc);
  await container.boot();
  return { svc, ssh, orch };
}

describe('SystemService', () => {
  let svc: SystemService;
  let ssh: MockConnection;
  let orch: MockOrchestrator;

  beforeEach(async () => {
    ({ svc, ssh, orch } = await boot());
  });

  describe('getDashboard', () => {
    it('returns fail(400) when server not connected', async () => {
      ssh.getState.mockReturnValue({ status: 'disconnected' });
      const r = await svc.getDashboard('s1');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('delegates to orchestrator and maps steps', async () => {
      ssh.getState.mockReturnValue({ status: 'connected' });
      orch.execute.mockResolvedValue({
        data: {
          system: { hostname: 'box', uptime: '1d', os: 'Ubuntu', kernel: '5.x', architecture: 'x86_64' },
          disks: [],
          memory: { totalMb: 1000, usedMb: 200, freeMb: 800, availableMb: 800, swapTotalMb: 0, swapUsedMb: 0 },
          network: [],
        },
        steps: [{ stepId: 'system-info', parsedBy: 'deterministic', latencyMs: 5, success: true }],
        totalLatencyMs: 10,
      });
      const r = await svc.getDashboard('s1');
      expect(r.ok).toBe(true);
      expect(orch.execute).toHaveBeenCalledWith('s1', expect.anything(), expect.any(Function));
      expect(r.data!.steps).toHaveLength(1);
      expect(r.data!.totalLatencyMs).toBe(10);
    });

    it('wraps orchestrator errors into fail result', async () => {
      ssh.getState.mockReturnValue({ status: 'connected' });
      orch.execute.mockRejectedValue(new Error('SSH timeout'));
      const r = await svc.getDashboard('s1');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('SSH timeout');
    });
  });

  describe('getDisk', () => {
    it('returns fail(400) when server not connected', async () => {
      ssh.getState.mockReturnValue({ status: 'disconnected' });
      const r = await svc.getDisk('s1');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns disk data on success', async () => {
      ssh.getState.mockReturnValue({ status: 'connected' });
      ssh.exec.mockResolvedValue(execOk('Filesystem      Size  Used\n/dev/sda1       50G   10G\n'));
      orch.execute.mockResolvedValue({
        data: [{ filesystem: '/dev/sda1', size: '50G', used: '10G', available: '40G', usePercent: 20, mountPoint: '/' }],
        steps: [{ stepId: 'disk', parsedBy: 'deterministic', latencyMs: 3, success: true }],
        totalLatencyMs: 3,
      });
      const r = await svc.getDisk('s1');
      expect(r.ok).toBe(true);
      expect(r.data!.data).toBeDefined();
    });
  });

  describe('getMemory', () => {
    it('returns fail(400) when server not connected', async () => {
      ssh.getState.mockReturnValue({ status: 'disconnected' });
      const r = await svc.getMemory('s1');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });
  });
});
