// M12.6: Tests for DockerService domain layer
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { DockerService } from '../../../src/services/domain/docker-service.js';
import { BaseService } from '../../../src/services/base-service.js';
import type { ExecResult } from '../../../src/ssh/connection-manager.js';
import { ServiceError } from '../../../src/services/domain/base.js';

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

async function bootDocker(): Promise<{ svc: DockerService; ssh: MockConnection }> {
  const container = new ServiceContainer();
  const ssh = new MockConnection('ssh');
  const orch = new StubOrchestrator('orchestrator');
  const pipe = new StubPipeline('parser');
  const svc = new DockerService('docker');
  container.register('ssh', ssh);
  container.register('orchestrator', orch);
  container.register('parser', pipe);
  container.register('docker', svc);
  await container.boot();
  return { svc, ssh };
}

describe('DockerService', () => {
  let svc: DockerService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await bootDocker());
  });

  it('listContainers returns dockerAvailable:false when docker missing', async () => {
    ssh.exec.mockResolvedValue(ok('', 127, 'docker: command not found'));
    const r = await svc.listContainers('s1');
    expect(r.ok).toBe(true);
    expect(r.data!.dockerAvailable).toBe(false);
    expect(r.data!.containers).toEqual([]);
  });

  it('listContainers parses docker ps JSON output', async () => {
    const json = JSON.stringify({
      ID: 'abc123',
      Names: 'web',
      Image: 'nginx:latest',
      Status: 'Up 2 hours',
      State: 'running',
      Ports: '0.0.0.0:80->80/tcp',
      CreatedAt: '2024-01-01 10:00:00 +0000 UTC',
    });
    ssh.exec.mockResolvedValue(ok(json));
    const r = await svc.listContainers('s1');
    expect(r.ok).toBe(true);
    expect(r.data!.dockerAvailable).toBe(true);
    expect(r.data!.containers).toHaveLength(1);
    expect(r.data!.containers[0]!.name).toBe('web');
  });

  it('containerAction validates container ID', async () => {
    const r = await svc.containerAction('s1', '../bad', 'start');
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(400);
  });

  it('containerAction rejects invalid action', async () => {
    const r = await svc.containerAction('s1', 'abc123def456', 'destroy' as never);
    expect(r.ok).toBe(false);
  });

  it('containerAction runs docker start with valid input', async () => {
    ssh.exec.mockResolvedValue(ok(''));
    const r = await svc.containerAction('s1', 'abc123def456', 'start');
    expect(r.ok).toBe(true);
    expect(ssh.exec.mock.calls[0]![1]).toBe('docker start abc123def456');
  });

  it('throws ServiceError when not connected', async () => {
    ssh.getState.mockReturnValue({ status: 'disconnected' });
    await expect(svc.listContainers('s1')).rejects.toBeInstanceOf(ServiceError);
  });
});
