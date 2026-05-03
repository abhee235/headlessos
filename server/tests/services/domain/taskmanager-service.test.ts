// M12.8: Tests for TaskManagerService domain layer
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { TaskManagerService } from '../../../src/services/domain/taskmanager-service.js';
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

function execOk(stdout = '', exitCode = 0, stderr = ''): ExecResult {
  return { stdout, stderr, exitCode, durationMs: 0 };
}

async function boot(): Promise<{ svc: TaskManagerService; ssh: MockConnection; orch: MockOrchestrator }> {
  const container = new ServiceContainer();
  const ssh = new MockConnection('ssh');
  const orch = new MockOrchestrator('orchestrator');
  const pipe = new StubPipeline('parser');
  const svc = new TaskManagerService('taskmanager');
  container.register('ssh', ssh);
  container.register('orchestrator', orch);
  container.register('parser', pipe);
  container.register('taskmanager', svc);
  await container.boot();
  return { svc, ssh, orch };
}

describe('TaskManagerService', () => {
  let svc: TaskManagerService;
  let ssh: MockConnection;
  let orch: MockOrchestrator;

  beforeEach(async () => {
    ({ svc, ssh, orch } = await boot());
  });

  describe('getSnapshot', () => {
    it('returns fail(400) when disconnected', async () => {
      ssh.getState.mockReturnValue({ status: 'disconnected' });
      const r = await svc.getSnapshot('s1');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('delegates to orchestrator and returns structured data', async () => {
      ssh.getState.mockReturnValue({ status: 'connected' });
      orch.execute.mockResolvedValue({
        data: {
          processes: [],
          cpuUsage: { userPercent: 10, systemPercent: 5, idlePercent: 85, totalPercent: 15 },
          memory: { totalMb: 2000, usedMb: 500, freeMb: 1500, availableMb: 1500, swapTotalMb: 0, swapUsedMb: 0 },
          networkIo: { rx: 0, tx: 0 },
          diskIo: { read: 0, write: 0 },
        },
        steps: [{ stepId: 'processes', parsedBy: 'llm', latencyMs: 50, success: true }],
        totalLatencyMs: 50,
      });
      const r = await svc.getSnapshot('s1');
      expect(r.ok).toBe(true);
      expect(r.data!.data.processes).toEqual([]);
      expect(r.data!.totalLatencyMs).toBe(50);
    });

    it('wraps orchestrator errors', async () => {
      ssh.getState.mockReturnValue({ status: 'connected' });
      orch.execute.mockRejectedValue(new Error('connection lost'));
      const r = await svc.getSnapshot('s1');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('connection lost');
    });
  });

  describe('killProcess', () => {
    it('returns fail(400) for non-integer PID', async () => {
      const r = await svc.killProcess('s1', 'abc', 15);
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns fail(400) for PID 0', async () => {
      const r = await svc.killProcess('s1', '0', 15);
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns fail(400) for invalid signal', async () => {
      const r = await svc.killProcess('s1', '1234', 3);
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('sends SIGTERM (15) for valid PID', async () => {
      ssh.exec.mockResolvedValue(execOk('', 0));
      const r = await svc.killProcess('s1', '1234', 15);
      expect(r.ok).toBe(true);
      expect(ssh.exec).toHaveBeenCalledWith(
        's1',
        expect.stringContaining('kill -15 1234'),
        expect.any(Number),
      );
    });

    it('sends SIGKILL (9) for valid PID', async () => {
      ssh.exec.mockResolvedValue(execOk('', 0));
      const r = await svc.killProcess('s1', '5678', 9);
      expect(r.ok).toBe(true);
      expect(ssh.exec).toHaveBeenCalledWith(
        's1',
        expect.stringContaining('kill -9 5678'),
        expect.any(Number),
      );
    });

    it('returns fail when kill exits non-zero', async () => {
      ssh.exec.mockResolvedValue(execOk('', 1, 'Operation not permitted'));
      const r = await svc.killProcess('s1', '1234', 15);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Operation not permitted');
    });
  });
});
