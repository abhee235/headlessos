// EX5-B.1: Sandbox Manager — Ephemeral Docker containers for CLI discovery
// @see docs/phases/phase-ex5.md — EX5-B.1

import { randomUUID } from 'node:crypto';
import { BaseService } from '../services/base-service.js';
import type { ConnectionManager, ExecResult } from '../ssh/connection-manager.js';

// ── Types ───────────────────────────────────────────────

export type SandboxStatus = 'creating' | 'ready' | 'installing' | 'destroying' | 'destroyed';

export interface SandboxInfo {
  /** Unique sandbox ID */
  id: string;
  /** Server where this sandbox container runs */
  serverId: string;
  /** Docker container ID (short hash) */
  containerId: string;
  /** Docker container name */
  containerName: string;
  /** Base Docker image used */
  baseImage: string;
  /** CLI tool being inspected */
  toolName: string;
  /** Current status */
  status: SandboxStatus;
  /** When the sandbox was created */
  createdAt: Date;
  /** Time-to-live in milliseconds */
  ttlMs: number;
}

export interface SandboxOptions {
  /** Base Docker image override (default: auto-detect from server OS) */
  baseImage?: string;
  /** Time-to-live in milliseconds (default: 300000 = 5 min) */
  ttlMs?: number;
  /** Memory limit (default: '256m') */
  memoryLimit?: string;
  /** CPU limit (default: '0.5') */
  cpuLimit?: string;
  /** PID limit (default: 100) */
  pidLimit?: number;
}

// ── Constants ───────────────────────────────────────────

const DEFAULT_TTL_MS = 300_000; // 5 minutes
const DEFAULT_MEMORY = '256m';
const DEFAULT_CPUS = '0.5';
const DEFAULT_PID_LIMIT = 100;
const SANDBOX_NAME_PREFIX = 'headlessos-sandbox-';
const EXEC_TIMEOUT = 30_000; // 30s for sandbox commands
const INSTALL_TIMEOUT = 120_000; // 2min for package installs

// ── OS → Base Image Mapping ─────────────────────────────

const OS_IMAGE_MAP: Record<string, string> = {
  'ubuntu 24': 'ubuntu:24.04',
  'ubuntu 22': 'ubuntu:22.04',
  'ubuntu 20': 'ubuntu:20.04',
  'ubuntu': 'ubuntu:22.04',
  'debian 12': 'debian:12',
  'debian 11': 'debian:11',
  'debian': 'debian:12',
  'centos': 'rockylinux:9',
  'rocky': 'rockylinux:9',
  'alma': 'almalinux:9',
  'rhel': 'rockylinux:9',
  'fedora': 'fedora:40',
  'alpine': 'alpine:3.19',
  'arch': 'archlinux:latest',
};
const DEFAULT_IMAGE = 'ubuntu:22.04';

/**
 * Detects the best Docker base image for a server by inspecting its OS info.
 * Falls back to ubuntu:22.04 if detection fails.
 */
export function detectBaseImage(osRelease: string): string {
  const lower = osRelease.toLowerCase();
  for (const [pattern, image] of Object.entries(OS_IMAGE_MAP)) {
    if (lower.includes(pattern)) return image;
  }
  return DEFAULT_IMAGE;
}

// ── SandboxManager ──────────────────────────────────────

export class SandboxManager extends BaseService {
  private sandboxes = new Map<string, SandboxInfo>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private ssh!: ConnectionManager;

  constructor() {
    super('sandbox-manager');
  }

  protected override async _init(): Promise<void> {
    this.ssh = this.services.get('ssh') as ConnectionManager;
  }

  protected override async _destroy(): Promise<void> {
    // Destroy all active sandboxes
    const active = [...this.sandboxes.values()].filter(
      s => s.status !== 'destroyed' && s.status !== 'destroying',
    );
    await Promise.allSettled(active.map(s => this.destroySandbox(s.id)));

    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Create a new ephemeral sandbox container on the target server.
   * The container runs with resource limits and no network.
   */
  async create(serverId: string, toolName: string, opts?: SandboxOptions): Promise<SandboxInfo> {
    const id = randomUUID().slice(0, 12);
    const containerName = `${SANDBOX_NAME_PREFIX}${id}`;
    const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
    const memoryLimit = opts?.memoryLimit ?? DEFAULT_MEMORY;
    const cpuLimit = opts?.cpuLimit ?? DEFAULT_CPUS;
    const pidLimit = opts?.pidLimit ?? DEFAULT_PID_LIMIT;

    // Detect base image from server OS if not specified
    let baseImage = opts?.baseImage ?? DEFAULT_IMAGE;
    if (!opts?.baseImage) {
      try {
        const osResult = await this.ssh.exec(serverId, 'cat /etc/os-release', 5_000);
        if (osResult.exitCode === 0) {
          baseImage = detectBaseImage(osResult.stdout);
        }
      } catch {
        // Fall back to default image
      }
    }

    const info: SandboxInfo = {
      id,
      serverId,
      containerId: '', // Set after docker run
      containerName,
      baseImage,
      toolName,
      status: 'creating',
      createdAt: new Date(),
      ttlMs,
    };
    this.sandboxes.set(id, info);

    try {
      // Start container with resource limits, no network
      const runCmd = [
        'docker run --rm -d',
        `--name ${containerName}`,
        `--memory=${memoryLimit}`,
        `--cpus=${cpuLimit}`,
        `--pids-limit=${pidLimit}`,
        '--network=none',
        baseImage,
        `sleep ${Math.ceil(ttlMs / 1000)}`,
      ].join(' ');

      const result = await this.ssh.exec(serverId, runCmd, EXEC_TIMEOUT);

      if (result.exitCode !== 0) {
        info.status = 'destroyed';
        this.sandboxes.delete(id);
        throw new Error(`Failed to create sandbox: ${result.stderr || result.stdout}`);
      }

      info.containerId = result.stdout.trim().slice(0, 12);
      info.status = 'ready';

      // Set auto-destroy timer
      const timer = setTimeout(() => {
        void this.destroySandbox(id).catch(() => {/* ignore cleanup errors */});
      }, ttlMs);
      this.timers.set(id, timer);

      return info;
    } catch (err) {
      info.status = 'destroyed';
      this.sandboxes.delete(id);
      throw err;
    }
  }

  /**
   * Execute a command inside the sandbox container.
   * Returns stdout. Throws on container not found or exec failure.
   */
  async exec(sandboxId: string, command: string, timeout = EXEC_TIMEOUT): Promise<string> {
    const info = this.requireSandbox(sandboxId);

    const dockerExec = `docker exec ${info.containerName} sh -c ${this.shellQuote(command)}`;
    const result = await this.ssh.exec(info.serverId, dockerExec, timeout);

    if (result.exitCode !== 0 && !result.stdout) {
      throw new Error(`Sandbox exec failed (exit ${result.exitCode}): ${result.stderr || 'no output'}`);
    }

    return result.stdout;
  }

  /**
   * Install packages inside the sandbox container.
   * Temporarily connects to network bridge for apt/yum, then disconnects.
   */
  async install(sandboxId: string, packages: string[]): Promise<string> {
    const info = this.requireSandbox(sandboxId);
    const prevStatus = info.status;
    info.status = 'installing';

    try {
      // Connect to bridge network for download
      await this.ssh.exec(
        info.serverId,
        `docker network connect bridge ${info.containerName}`,
        EXEC_TIMEOUT,
      );

      // Detect package manager and install
      const installCmd = this.buildInstallCommand(info.baseImage, packages);
      const result = await this.ssh.exec(
        info.serverId,
        `docker exec ${info.containerName} sh -c ${this.shellQuote(installCmd)}`,
        INSTALL_TIMEOUT,
      );

      // Disconnect from network (restore isolation)
      await this.ssh.exec(
        info.serverId,
        `docker network disconnect bridge ${info.containerName}`,
        EXEC_TIMEOUT,
      ).catch(() => {/* ignore: container may already be gone */});

      info.status = 'ready';

      if (result.exitCode !== 0) {
        throw new Error(`Package install failed: ${result.stderr || result.stdout}`);
      }

      return result.stdout;
    } catch (err) {
      info.status = prevStatus === 'installing' ? 'ready' : prevStatus;
      // Try to disconnect from network even on error
      await this.ssh.exec(
        info.serverId,
        `docker network disconnect bridge ${info.containerName}`,
        EXEC_TIMEOUT,
      ).catch(() => {});
      throw err;
    }
  }

  /**
   * Destroy a sandbox container and clean up resources.
   */
  async destroySandbox(sandboxId: string): Promise<void> {
    const info = this.sandboxes.get(sandboxId);
    if (!info || info.status === 'destroyed' || info.status === 'destroying') return;

    info.status = 'destroying';

    // Clear the auto-destroy timer
    const timer = this.timers.get(sandboxId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sandboxId);
    }

    try {
      await this.ssh.exec(
        info.serverId,
        `docker rm -f ${info.containerName}`,
        EXEC_TIMEOUT,
      );
    } catch {
      // Container may already be gone — that's fine
    }

    info.status = 'destroyed';
    this.sandboxes.delete(sandboxId);
  }

  /**
   * Destroy all sandbox containers on a specific server.
   * Used as orphan reaper on service init and server disconnect.
   */
  async destroyAll(serverId: string): Promise<number> {
    let cleaned = 0;

    // Destroy tracked sandboxes for this server
    const serverSandboxes = [...this.sandboxes.values()].filter(
      s => s.serverId === serverId && s.status !== 'destroyed',
    );
    await Promise.allSettled(serverSandboxes.map(s => this.destroySandbox(s.id)));
    cleaned += serverSandboxes.length;

    // Also reap any orphan containers matching our naming pattern
    try {
      const result = await this.ssh.exec(
        serverId,
        `docker ps -aq --filter "name=${SANDBOX_NAME_PREFIX}"`,
        EXEC_TIMEOUT,
      );
      if (result.exitCode === 0 && result.stdout.trim()) {
        const containerIds = result.stdout.trim().split('\n').filter(Boolean);
        for (const containerId of containerIds) {
          await this.ssh.exec(serverId, `docker rm -f ${containerId}`, EXEC_TIMEOUT)
            .catch(() => {});
          cleaned++;
        }
      }
    } catch {
      // Docker may not be available — ignore
    }

    return cleaned;
  }

  /**
   * Get sandbox info by ID. Returns undefined if not found.
   */
  getSandbox(sandboxId: string): SandboxInfo | undefined {
    return this.sandboxes.get(sandboxId);
  }

  /**
   * List all active (non-destroyed) sandboxes.
   */
  listActive(): SandboxInfo[] {
    return [...this.sandboxes.values()].filter(s => s.status !== 'destroyed');
  }

  // ── Helpers ─────────────────────────────────────────────

  private requireSandbox(sandboxId: string): SandboxInfo {
    const info = this.sandboxes.get(sandboxId);
    if (!info) throw new Error(`Sandbox not found: ${sandboxId}`);
    if (info.status === 'destroyed' || info.status === 'destroying') {
      throw new Error(`Sandbox ${sandboxId} is ${info.status}`);
    }
    return info;
  }

  private buildInstallCommand(baseImage: string, packages: string[]): string {
    const pkgList = packages.join(' ');
    if (baseImage.startsWith('alpine')) {
      return `apk update && apk add --no-cache ${pkgList}`;
    }
    if (baseImage.startsWith('fedora') || baseImage.startsWith('rocky') || baseImage.startsWith('alma')) {
      return `dnf install -y -q ${pkgList}`;
    }
    if (baseImage.startsWith('centos') || baseImage.startsWith('rhel')) {
      return `yum install -y -q ${pkgList}`;
    }
    if (baseImage.startsWith('arch')) {
      return `pacman -Sy --noconfirm ${pkgList}`;
    }
    // Default: Debian/Ubuntu
    return `apt-get update -qq && apt-get install -y -qq ${pkgList}`;
  }

  private shellQuote(str: string): string {
    // Use single quotes, escaping any single quotes in the string
    return `'${str.replace(/'/g, "'\\''")}'`;
  }
}
