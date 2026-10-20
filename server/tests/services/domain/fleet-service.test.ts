// M12.8: Tests for FleetService domain layer
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { FleetService } from '../../../src/services/domain/fleet-service.js';
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

class MockConfigStore extends BaseService {
  getServers = vi.fn();
  getServer = vi.fn();
  updateServer = vi.fn();
}

class StubPipeline extends BaseService { parse = vi.fn(); }

function execOk(stdout = '', exitCode = 0): ExecResult {
  return { stdout, stderr: '', exitCode, durationMs: 0 };
}

const baseServer = {
  id: 's1',
  name: 'Test Server',
  host: '127.0.0.1',
  port: 22,
  username: 'testuser',
  authMethod: 'password' as const,
  tags: [],
};

async function boot(): Promise<{ svc: FleetService; ssh: MockConnection; orch: MockOrchestrator; cfg: MockConfigStore }> {
  const container = new ServiceContainer();
  const ssh = new MockConnection('ssh');
  const orch = new MockOrchestrator('orchestrator');
  const pipe = new StubPipeline('parser');
  const cfg = new MockConfigStore('config');
  const svc = new FleetService('fleet');
  container.register('ssh', ssh);
  container.register('orchestrator', orch);
  container.register('parser', pipe);
  container.register('config', cfg);
  container.register('fleet', svc);
  await container.boot();
  return { svc, ssh, orch, cfg };
}

describe('FleetService', () => {
  let svc: FleetService;
  let ssh: MockConnection;
  let orch: MockOrchestrator;
  let cfg: MockConfigStore;

  beforeEach(async () => {
    ({ svc, ssh, orch, cfg } = await boot());
  });

  describe('getOverview', () => {
    it('returns empty overview when no servers', async () => {
      cfg.getServers.mockResolvedValue([]);
      const r = await svc.getOverview();
      expect(r.ok).toBe(true);
      expect(r.data!.servers).toHaveLength(0);
      expect(r.data!.totals.total).toBe(0);
    });

    it('marks server as disconnected when not connected', async () => {
      cfg.getServers.mockResolvedValue([baseServer]);
      ssh.getState.mockReturnValue({ status: 'disconnected' });
      const r = await svc.getOverview();
      expect(r.ok).toBe(true);
      expect(r.data!.servers[0]!.status).toBe('disconnected');
      expect(r.data!.totals.connected).toBe(0);
    });

    it('fetches metrics for connected servers', async () => {
      cfg.getServers.mockResolvedValue([baseServer]);
      ssh.getState.mockReturnValue({ status: 'connected' });
      orch.execute.mockResolvedValue({
        data: {
          disks: [{ filesystem: '/dev/sda1', size: '50G', used: '10G', available: '40G', usePercent: 20, mountPoint: '/' }],
          memory: { totalMb: 2000, usedMb: 500, freeMb: 1500, availableMb: 1500, swapTotalMb: 0, swapUsedMb: 0 },
        },
        steps: [],
        totalLatencyMs: 5,
      });
      const r = await svc.getOverview();
      expect(r.ok).toBe(true);
      expect(r.data!.totals.connected).toBe(1);
      expect(r.data!.servers[0]!.status).toBe('connected');
    });

    it('marks server as error when orchestrator throws', async () => {
      cfg.getServers.mockResolvedValue([baseServer]);
      ssh.getState.mockReturnValue({ status: 'connected' });
      orch.execute.mockRejectedValue(new Error('timeout'));
      const r = await svc.getOverview();
      expect(r.ok).toBe(true);
      expect(r.data!.servers[0]!.status).toBe('error');
    });
  });

  describe('setTags', () => {
    it('returns fail(400) when tags is not an array', async () => {
      const r = await svc.setTags('s1', 'not-an-array' as unknown as string[]);
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns fail(400) when tags contains non-strings', async () => {
      const r = await svc.setTags('s1', [123] as unknown as string[]);
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns fail(404) when server not found', async () => {
      cfg.getServer.mockResolvedValue(null);
      const r = await svc.setTags('s1', ['prod']);
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(404);
    });

    it('updates tags successfully', async () => {
      cfg.getServer.mockResolvedValue(baseServer);
      cfg.updateServer.mockResolvedValue({ ...baseServer, tags: ['prod'] });
      const r = await svc.setTags('s1', ['prod']);
      expect(r.ok).toBe(true);
      expect(cfg.updateServer).toHaveBeenCalledWith('s1', { tags: ['prod'] });
    });
  });
});
