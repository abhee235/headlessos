// M12.8: Tests for TaskManagerService domain layer
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { TaskManagerService, parseProcessDetail } from '../../../src/services/domain/taskmanager-service.js';
import { validateCommand } from '../../../src/security/validators.js';
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

  // ── EX8.6: suspend / resume + process detail ──
  describe('CPU from /proc/stat deltas (EX8.6)', () => {
    const topCpu = {
      overallPercent: 0, coreCount: 4, cores: [{ id: 0, percent: 0 }, { id: 2, percent: 0 }],
      loadAverage: { one: 1, five: 1, fifteen: 1 },
      processes: { total: 1, running: 1, sleeping: 0, stopped: 0, zombie: 0 }, uptime: '1h',
    };
    const stat = (busy: number, total: number) => [
      { id: -1, busy: busy * 2, total: total * 2 },
      { id: 0, busy, total },
      { id: 1, busy, total },
    ];
    function runWith(procStat: unknown) {
      orch.execute.mockImplementation(async (_s: string, _plan: unknown, merge: (m: Map<string, unknown>) => unknown) => ({
        data: merge(new Map<string, unknown>([['cpu', topCpu], ['proc-stat', procStat]])),
        steps: [],
        totalLatencyMs: 1,
      }));
      return svc.getSnapshot('s1');
    }

    it('replaces top percentages with deltas since the previous poll, all cores', async () => {
      await runWith(stat(100, 1000));               // first sample: since boot
      const r = await runWith(stat(400, 2000));      // +300 busy of +1000
      const cpu = r.data!.data.cpu;
      expect(cpu.overallPercent).toBe(30);
      expect(cpu.cores).toEqual([{ id: 0, percent: 30 }, { id: 1, percent: 30 }]);
      expect(cpu.coreCount).toBe(4);                 // nproc from top still wins when larger
      expect(cpu.loadAverage.one).toBe(1);           // other top fields untouched
    });

    it('keeps top numbers when /proc/stat is unavailable', async () => {
      const r = await runWith(undefined);
      expect(r.data!.data.cpu.cores).toEqual(topCpu.cores);
    });
  });

  describe('killProcess suspend/resume (EX8.6)', () => {
    it('sends SIGSTOP (19) and SIGCONT (18)', async () => {
      ssh.exec.mockResolvedValue(execOk('', 0));
      expect((await svc.killProcess('s1', '42', 19)).ok).toBe(true);
      expect(ssh.exec).toHaveBeenLastCalledWith('s1', 'kill -19 42', expect.any(Number));
      expect((await svc.killProcess('s1', '42', 18)).ok).toBe(true);
      expect(ssh.exec).toHaveBeenLastCalledWith('s1', 'kill -18 42', expect.any(Number));
    });

    it('still rejects other signals', async () => {
      for (const sig of [1, 2, 17, 20]) {
        const r = await svc.killProcess('s1', '42', sig);
        expect(r.ok).toBe(false);
        expect(r.statusCode).toBe(400);
      }
    });
  });

  describe('getProcessDetail (EX8.6)', () => {
    it('runs the allowlisted ps query and parses threads, nice and start time', async () => {
      ssh.exec.mockResolvedValue(execOk('    2  10 Tue Oct 20 16:28:01 2026\n'));
      const r = await svc.getProcessDetail('s1', '4205');
      expect(ssh.exec).toHaveBeenCalledWith('s1', 'ps -o nlwp=,ni=,lstart= -p 4205', expect.any(Number));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toEqual({ pid: 4205, threads: 2, nice: 10, startedAt: 'Tue Oct 20 16:28:01 2026' });
      expect(() => validateCommand('ps -o nlwp=,ni=,lstart= -p 4205')).not.toThrow();
    });

    it('returns 404 when the process is gone (ps exits 1)', async () => {
      ssh.exec.mockResolvedValue(execOk('', 1));
      const r = await svc.getProcessDetail('s1', '999');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(404);
    });

    it('rejects non-numeric or injected PIDs without running anything', async () => {
      for (const pid of ['abc', '0', '-1', '12;id', '12 13']) {
        const r = await svc.getProcessDetail('s1', pid);
        expect(r.ok).toBe(false);
        expect(r.statusCode).toBe(400);
      }
      expect(ssh.exec).not.toHaveBeenCalled();
    });
  });

  describe('parseProcessDetail', () => {
    it('handles "-" nice for kernel threads and empty output', () => {
      expect(parseProcessDetail(2, '   1   - Mon Oct 19 01:00:00 2026')).toEqual({ pid: 2, threads: 1, nice: null, startedAt: 'Mon Oct 19 01:00:00 2026' });
      expect(parseProcessDetail(3, '')).toBeNull();
    });
  });

  it('allowlist only accepts the exact detail query', () => {
    expect(() => validateCommand('ps -o nlwp=,ni=,lstart= -p 12 | sh')).toThrow();
    expect(() => validateCommand('ps -o comm= -p 12')).toThrow();
  });
});
