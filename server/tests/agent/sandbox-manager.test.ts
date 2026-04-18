// EX5-B.1: SandboxManager tests
// @see docs/phases/phase-ex5.md — EX5-B.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SandboxManager,
  detectBaseImage,
  type SandboxInfo,
} from '../../src/agent/sandbox-manager.js';
import { ServiceContainer } from '../../src/services/container.js';
import type { ConnectionManager, ExecResult } from '../../src/ssh/connection-manager.js';

// ── Mock SSH Factory ───────────────────────────────────

interface ExecCall {
  serverId: string;
  command: string;
  timeout?: number;
}

function createMockSSH(
  handler?: (serverId: string, command: string) => ExecResult,
): { ssh: ConnectionManager; execLog: ExecCall[] } {
  const execLog: ExecCall[] = [];
  const defaultResult: ExecResult = { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };

  const ssh = {
    name: 'ssh',
    construct: vi.fn(),
    init: vi.fn(),
    destroy: vi.fn(),
    exec: vi.fn().mockImplementation(
      async (serverId: string, command: string, timeout?: number): Promise<ExecResult> => {
        execLog.push({ serverId, command, timeout });
        return handler ? handler(serverId, command) : defaultResult;
      },
    ),
    getSftp: vi.fn(),
  } as unknown as ConnectionManager;

  return { ssh, execLog };
}

// ── Helper: boot a SandboxManager with mocked SSH ──────

async function bootSandboxManager(
  handler?: (serverId: string, command: string) => ExecResult,
): Promise<{ manager: SandboxManager; ssh: ConnectionManager; execLog: ExecCall[]; container: ServiceContainer }> {
  const { ssh, execLog } = createMockSSH(handler);
  const manager = new SandboxManager();
  const container = new ServiceContainer();

  container.register('ssh', ssh as unknown as import('../../src/services/base-service.js').BaseService);
  container.register('sandbox-manager', manager);
  await container.boot();

  return { manager, ssh, execLog, container };
}

// ── Tests ──────────────────────────────────────────────

describe('detectBaseImage', () => {
  it('detects Ubuntu 22.04', () => {
    expect(detectBaseImage('Ubuntu 22.04.3 LTS')).toBe('ubuntu:22.04');
  });

  it('detects Ubuntu 24.04', () => {
    expect(detectBaseImage('Ubuntu 24.04 LTS')).toBe('ubuntu:24.04');
  });

  it('detects Debian 12', () => {
    expect(detectBaseImage('Debian GNU/Linux 12 (bookworm)')).toBe('debian:12');
  });

  it('detects CentOS/Rocky', () => {
    expect(detectBaseImage('CentOS Stream release 9')).toBe('rockylinux:9');
  });

  it('detects Alpine', () => {
    expect(detectBaseImage('Alpine Linux v3.19')).toBe('alpine:3.19');
  });

  it('detects Fedora', () => {
    expect(detectBaseImage('Fedora release 40 (Forty)')).toBe('fedora:40');
  });

  it('detects Arch', () => {
    expect(detectBaseImage('Arch Linux')).toBe('archlinux:latest');
  });

  it('falls back to ubuntu:22.04 for unknown', () => {
    expect(detectBaseImage('NixOS 24.05')).toBe('ubuntu:22.04');
  });
});

describe('SandboxManager', () => {
  let manager: SandboxManager;
  let execLog: ExecCall[];
  let container: ServiceContainer;

  beforeEach(async () => {
    vi.useFakeTimers();
    const booted = await bootSandboxManager((serverId, command) => {
      // Default responses for common commands
      if (command.includes('cat /etc/os-release')) {
        return { stdout: 'PRETTY_NAME="Ubuntu 22.04.3 LTS"', stderr: '', exitCode: 0, durationMs: 5 };
      }
      if (command.startsWith('docker run')) {
        return { stdout: 'abc123def456\n', stderr: '', exitCode: 0, durationMs: 100 };
      }
      if (command.startsWith('docker exec')) {
        return { stdout: 'exec output\n', stderr: '', exitCode: 0, durationMs: 50 };
      }
      if (command.startsWith('docker rm')) {
        return { stdout: '', stderr: '', exitCode: 0, durationMs: 20 };
      }
      if (command.startsWith('docker network')) {
        return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
      }
      if (command.startsWith('docker ps')) {
        return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
      }
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
    });
    manager = booted.manager;
    execLog = booted.execLog;
    container = booted.container;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await container.shutdown();
  });

  // ── create() ──────────────────────────────────────────

  describe('create()', () => {
    it('creates a sandbox container with correct docker run flags', async () => {
      const info = await manager.create('srv1', 'nginx');

      expect(info.serverId).toBe('srv1');
      expect(info.toolName).toBe('nginx');
      expect(info.status).toBe('ready');
      expect(info.baseImage).toBe('ubuntu:22.04');
      expect(info.containerId).toBe('abc123def456');
      expect(info.containerName).toMatch(/^headlessos-sandbox-/);

      // Should have called: cat /etc/os-release, then docker run
      const runCall = execLog.find(c => c.command.startsWith('docker run'));
      expect(runCall).toBeDefined();
      expect(runCall!.command).toContain('--memory=256m');
      expect(runCall!.command).toContain('--cpus=0.5');
      expect(runCall!.command).toContain('--network=none');
      expect(runCall!.command).toContain('--pids-limit=100');
      expect(runCall!.command).toContain('ubuntu:22.04');
      expect(runCall!.command).toContain('sleep 300');
    });

    it('uses custom base image when specified', async () => {
      const info = await manager.create('srv1', 'htop', { baseImage: 'alpine:3.19' });

      expect(info.baseImage).toBe('alpine:3.19');
      // Should NOT call cat /etc/os-release since image was specified
      const osCall = execLog.find(c => c.command.includes('cat /etc/os-release'));
      expect(osCall).toBeUndefined();
    });

    it('uses custom TTL', async () => {
      const info = await manager.create('srv1', 'htop', { ttlMs: 60_000 });

      expect(info.ttlMs).toBe(60_000);
      const runCall = execLog.find(c => c.command.startsWith('docker run'));
      expect(runCall!.command).toContain('sleep 60');
    });

    it('throws on docker run failure', async () => {
      // Rebuild with failing docker run
      await container.shutdown();
      const booted = await bootSandboxManager((_sid, cmd) => {
        if (cmd.includes('cat /etc/os-release')) {
          return { stdout: 'Ubuntu', stderr: '', exitCode: 0, durationMs: 5 };
        }
        if (cmd.startsWith('docker run')) {
          return { stdout: '', stderr: 'docker not found', exitCode: 127, durationMs: 10 };
        }
        return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
      });
      manager = booted.manager;
      container = booted.container;

      await expect(manager.create('srv1', 'nginx')).rejects.toThrow('Failed to create sandbox');
    });

    it('cleans up on failure — sandbox is not tracked', async () => {
      await container.shutdown();
      const booted = await bootSandboxManager((_sid, cmd) => {
        if (cmd.startsWith('docker run')) {
          return { stdout: '', stderr: 'error', exitCode: 1, durationMs: 10 };
        }
        return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
      });
      manager = booted.manager;
      container = booted.container;

      await expect(manager.create('srv1', 'nginx')).rejects.toThrow();
      expect(manager.listActive()).toHaveLength(0);
    });
  });

  // ── exec() ──────────────────────────────────────────

  describe('exec()', () => {
    it('executes a command inside the sandbox', async () => {
      const info = await manager.create('srv1', 'nginx');
      const output = await manager.exec(info.id, 'nginx --help');

      expect(output).toBe('exec output\n');
      const execCall = execLog.find(c =>
        c.command.includes('docker exec') && c.command.includes('nginx --help'),
      );
      expect(execCall).toBeDefined();
      expect(execCall!.command).toContain(info.containerName);
    });

    it('throws on unknown sandbox ID', async () => {
      await expect(manager.exec('nonexistent', 'ls')).rejects.toThrow('Sandbox not found');
    });

    it('throws on destroyed sandbox', async () => {
      const info = await manager.create('srv1', 'nginx');
      await manager.destroySandbox(info.id);

      await expect(manager.exec(info.id, 'ls')).rejects.toThrow('Sandbox not found');
    });
  });

  // ── install() ──────────────────────────────────────

  describe('install()', () => {
    it('connects to bridge network, installs, then disconnects', async () => {
      const info = await manager.create('srv1', 'nginx');
      execLog.length = 0; // Reset log

      await manager.install(info.id, ['nginx']);

      // Should have: network connect → docker exec (apt install) → network disconnect
      expect(execLog.length).toBe(3);
      expect(execLog[0].command).toContain('docker network connect bridge');
      expect(execLog[1].command).toContain('docker exec');
      expect(execLog[1].command).toContain('apt-get');
      expect(execLog[1].command).toContain('nginx');
      expect(execLog[2].command).toContain('docker network disconnect bridge');
    });

    it('uses apk for Alpine images', async () => {
      const info = await manager.create('srv1', 'curl', { baseImage: 'alpine:3.19' });
      execLog.length = 0;

      await manager.install(info.id, ['curl']);

      const installCall = execLog.find(c => c.command.includes('docker exec'));
      expect(installCall!.command).toContain('apk');
    });

    it('uses dnf for Fedora images', async () => {
      const info = await manager.create('srv1', 'htop', { baseImage: 'fedora:40' });
      execLog.length = 0;

      await manager.install(info.id, ['htop']);

      const installCall = execLog.find(c => c.command.includes('docker exec'));
      expect(installCall!.command).toContain('dnf');
    });

    it('restores ready status after install', async () => {
      const info = await manager.create('srv1', 'nginx');
      await manager.install(info.id, ['nginx']);

      const current = manager.getSandbox(info.id);
      expect(current?.status).toBe('ready');
    });

    it('disconnects network on install failure', async () => {
      await container.shutdown();
      let callCount = 0;
      const booted = await bootSandboxManager((_sid, cmd) => {
        if (cmd.includes('cat /etc/os-release')) {
          return { stdout: 'Ubuntu', stderr: '', exitCode: 0, durationMs: 5 };
        }
        if (cmd.startsWith('docker run')) {
          return { stdout: 'abc123def456\n', stderr: '', exitCode: 0, durationMs: 10 };
        }
        if (cmd.includes('docker network connect')) {
          return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
        }
        if (cmd.startsWith('docker exec')) {
          // Fail the install
          return { stdout: '', stderr: 'E: Unable to locate package', exitCode: 100, durationMs: 10 };
        }
        if (cmd.includes('docker network disconnect')) {
          callCount++;
          return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
        }
        return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
      });
      manager = booted.manager;
      container = booted.container;

      const info = await manager.create('srv1', 'nginx');
      await expect(manager.install(info.id, ['badpkg'])).rejects.toThrow('Package install failed');

      // Network disconnect should still have been called (cleanup)
      expect(callCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── destroySandbox() ──────────────────────────────

  describe('destroySandbox()', () => {
    it('removes the container via docker rm -f', async () => {
      const info = await manager.create('srv1', 'nginx');
      await manager.destroySandbox(info.id);

      const rmCall = execLog.find(c => c.command.startsWith('docker rm -f'));
      expect(rmCall).toBeDefined();
      expect(rmCall!.command).toContain(info.containerName);
    });

    it('removes sandbox from active list', async () => {
      const info = await manager.create('srv1', 'nginx');
      expect(manager.listActive()).toHaveLength(1);

      await manager.destroySandbox(info.id);
      expect(manager.listActive()).toHaveLength(0);
    });

    it('is idempotent — double destroy does not throw', async () => {
      const info = await manager.create('srv1', 'nginx');
      await manager.destroySandbox(info.id);
      await manager.destroySandbox(info.id); // No-op
    });

    it('ignores docker rm failure (container already gone)', async () => {
      await container.shutdown();
      const booted = await bootSandboxManager((_sid, cmd) => {
        if (cmd.startsWith('docker rm')) {
          throw new Error('container not found');
        }
        if (cmd.startsWith('docker run')) {
          return { stdout: 'abc123\n', stderr: '', exitCode: 0, durationMs: 10 };
        }
        return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
      });
      manager = booted.manager;
      container = booted.container;

      const info = await manager.create('srv1', 'nginx');
      // Should not throw even if docker rm fails
      await expect(manager.destroySandbox(info.id)).resolves.toBeUndefined();
    });
  });

  // ── destroyAll() ──────────────────────────────────

  describe('destroyAll()', () => {
    it('destroys all sandboxes for a specific server', async () => {
      await manager.create('srv1', 'nginx');
      await manager.create('srv1', 'htop');
      await manager.create('srv2', 'curl'); // different server

      const cleaned = await manager.destroyAll('srv1');
      expect(cleaned).toBeGreaterThanOrEqual(2);
      expect(manager.listActive()).toHaveLength(1); // only srv2 remains
    });

    it('also reaps orphan containers by name pattern', async () => {
      await container.shutdown();
      const booted = await bootSandboxManager((_sid, cmd) => {
        if (cmd.includes('docker ps -aq')) {
          return { stdout: 'orphan1\norphan2\n', stderr: '', exitCode: 0, durationMs: 10 };
        }
        return { stdout: '', stderr: '', exitCode: 0, durationMs: 10 };
      });
      manager = booted.manager;
      container = booted.container;

      const cleaned = await manager.destroyAll('srv1');
      // Should have tried to rm both orphan containers
      expect(cleaned).toBeGreaterThanOrEqual(2);
    });
  });

  // ── getSandbox() / listActive() ────────────────────

  describe('getSandbox() / listActive()', () => {
    it('returns sandbox info by ID', async () => {
      const info = await manager.create('srv1', 'nginx');
      const retrieved = manager.getSandbox(info.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(info.id);
      expect(retrieved!.toolName).toBe('nginx');
    });

    it('returns undefined for unknown ID', () => {
      expect(manager.getSandbox('unknown')).toBeUndefined();
    });

    it('lists all active sandboxes', async () => {
      await manager.create('srv1', 'nginx');
      await manager.create('srv1', 'htop');

      const active = manager.listActive();
      expect(active).toHaveLength(2);
      expect(active.every(s => s.status === 'ready')).toBe(true);
    });
  });

  // ── Auto-destroy Timer ──────────────────────────────

  describe('auto-destroy timer', () => {
    it('destroys sandbox after TTL expires', async () => {
      const info = await manager.create('srv1', 'nginx', { ttlMs: 10_000 });
      expect(manager.listActive()).toHaveLength(1);

      // Advance past TTL
      vi.advanceTimersByTime(11_000);
      // Allow async cleanup to run
      await vi.runAllTimersAsync();

      expect(manager.listActive()).toHaveLength(0);
    });

    it('clears timer on manual destroy', async () => {
      const info = await manager.create('srv1', 'nginx', { ttlMs: 60_000 });
      await manager.destroySandbox(info.id);

      // Advancing timers should not cause errors
      vi.advanceTimersByTime(70_000);
      expect(manager.listActive()).toHaveLength(0);
    });
  });

  // ── Service lifecycle ──────────────────────────────

  describe('service lifecycle', () => {
    it('destroys all sandboxes on service shutdown', async () => {
      await manager.create('srv1', 'nginx');
      await manager.create('srv1', 'htop');
      expect(manager.listActive()).toHaveLength(2);

      await container.shutdown();
      expect(manager.listActive()).toHaveLength(0);
    });
  });
});
