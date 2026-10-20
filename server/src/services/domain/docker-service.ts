// M12.2: DockerService — domain layer for Docker container/image operations
// @see docs/phases/phase-12.md
//
// Owns: command building, exec orchestration, JSON parsing, validation.
// Routes (routes/docker.ts) only translate HTTP ↔ ServiceResult.

import { DomainService, ok, fail, type ServiceResult } from './base.js';
import {
  validateDockerImageRef,
  validateISODate,
  shellEscape,
} from '../../security/validators.js';
import type { DockerContainer, DockerImage } from 'headlessos-shared';

interface DockerPsJson {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
  Ports: string;
  CreatedAt: string;
}

interface DockerImageJson {
  ID: string;
  Repository: string;
  Tag: string;
  Size: string;
  CreatedAt: string;
}

const VALID_ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause'] as const;
type ContainerAction = (typeof VALID_ACTIONS)[number];

export class DockerService extends DomainService {
  // ── Read operations ─────────────────────────────────────

  async listContainers(
    serverId: string,
  ): Promise<
    ServiceResult<{ containers: DockerContainer[]; dockerAvailable: boolean }>
  > {
    this.requireConnected(serverId);
    const result = await this.exec(
      serverId,
      "docker ps -a --format '{{json .}}'",
      10_000,
    );
    if (result.exitCode !== 0) {
      const errMsg = result.stderr.trim();
      if (
        errMsg.includes('not found') ||
        errMsg.includes('command not found')
      ) {
        return ok({ containers: [], dockerAvailable: false });
      }
      return fail(errMsg || 'Failed to list containers');
    }
    return ok({
      containers: parseContainers(result.stdout),
      dockerAvailable: true,
    });
  }

  async listImages(
    serverId: string,
  ): Promise<
    ServiceResult<{ images: DockerImage[]; dockerAvailable: boolean }>
  > {
    this.requireConnected(serverId);
    const result = await this.exec(
      serverId,
      "docker images --format '{{json .}}'",
      10_000,
    );
    if (result.exitCode !== 0) {
      const errMsg = result.stderr.trim();
      if (
        errMsg.includes('not found') ||
        errMsg.includes('command not found')
      ) {
        return ok({ images: [], dockerAvailable: false });
      }
      return fail(errMsg || 'Failed to list images');
    }
    return ok({ images: parseImages(result.stdout), dockerAvailable: true });
  }

  async inspectContainer(
    serverId: string,
    containerId: string,
  ): Promise<ServiceResult<unknown>> {
    this.requireConnected(serverId);
    if (!isValidContainerId(containerId))
      return fail('Invalid container ID', 400);

    const result = await this.exec(
      serverId,
      `docker inspect ${containerId}`,
      10_000,
    );
    if (result.exitCode !== 0) {
      return fail(result.stderr.trim() || 'Failed to inspect container');
    }
    try {
      const parsed = JSON.parse(result.stdout);
      return ok(parsed[0] ?? parsed);
    } catch {
      return fail('Failed to parse docker inspect output');
    }
  }

  async getLogs(
    serverId: string,
    containerId: string,
    opts: { tail?: string; since?: string } = {},
  ): Promise<ServiceResult<string>> {
    this.requireConnected(serverId);
    if (!isValidContainerId(containerId))
      return fail('Invalid container ID', 400);

    const tail = opts.tail ?? '200';
    if (!/^\d+$/.test(tail)) return fail('Invalid tail count', 400);

    let cmd = `docker logs --tail ${tail} --timestamps ${containerId}`;
    if (opts.since) {
      if (!validateISODate(opts.since)) {
        return fail(
          'Invalid since format. Use YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS',
          400,
        );
      }
      cmd = `docker logs --since ${shellEscape(opts.since)} --timestamps ${containerId}`;
    }

    const result = await this.exec(serverId, cmd, 15_000);
    return ok((result.stdout + result.stderr).trim());
  }

  // ── State-change operations ─────────────────────────────

  async containerAction(
    serverId: string,
    containerId: string,
    action: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!isValidContainerId(containerId))
      return fail('Invalid container ID', 400);
    if (!VALID_ACTIONS.includes(action as ContainerAction)) {
      return fail(
        `Invalid action: ${action}. Must be one of: ${VALID_ACTIONS.join(', ')}`,
        400,
      );
    }
    return this.execAction(
      serverId,
      `docker ${action} ${containerId}`,
      `Container ${action} succeeded`,
      30_000,
    );
  }

  async removeContainer(
    serverId: string,
    containerId: string,
    force = false,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!isValidContainerId(containerId))
      return fail('Invalid container ID', 400);

    const cmd = force
      ? `docker rm -f ${containerId}`
      : `docker rm ${containerId}`;
    const r = await this.exec(serverId, cmd, 15_000);
    if (r.exitCode !== 0) {
      return fail(r.stderr.trim() || 'Failed to remove container', 500);
    }
    return ok({ message: 'Container removed' });
  }

  async removeImage(
    serverId: string,
    imageId: string,
    force = false,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!isValidContainerId(imageId)) return fail('Invalid image ID', 400);

    const cmd = force ? `docker rmi -f ${imageId}` : `docker rmi ${imageId}`;
    const r = await this.exec(serverId, cmd, 15_000);
    if (r.exitCode !== 0) {
      return fail(r.stderr.trim() || 'Failed to remove image', 500);
    }
    return ok({ message: 'Image removed' });
  }

  async runContainer(
    serverId: string,
    spec: {
      image: string;
      name?: string;
      ports?: string[];
      env?: string[];
      volumes?: string[];
      detach?: boolean;
      command?: string;
    },
  ): Promise<ServiceResult<{ containerId: string }>> {
    this.requireConnected(serverId);

    if (!spec.image || !validateDockerImageRef(spec.image)) {
      return fail('Invalid or missing image name', 400);
    }

    const args: string[] = ['docker', 'run'];
    if (spec.detach !== false) args.push('-d');

    if (spec.name) {
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$/.test(spec.name) ||
        spec.name.length > 128
      ) {
        return fail('Invalid container name', 400);
      }
      args.push('--name', spec.name);
    }

    if (spec.ports) {
      for (const p of spec.ports) {
        if (
          !/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:)?\d+:\d+(\/tcp|\/udp)?$/.test(
            p,
          )
        ) {
          return fail(`Invalid port mapping: ${p}`, 400);
        }
        args.push('-p', p);
      }
    }

    if (spec.env) {
      for (const e of spec.env) {
        if (!e.includes('=') || /[;&|`$(){}]/.test(e)) {
          return fail(`Invalid environment variable: ${e}`, 400);
        }
        args.push('-e', shellEscape(e));
      }
    }

    if (spec.volumes) {
      for (const v of spec.volumes) {
        if (!v.includes(':') || /[;&|`$(){}]/.test(v)) {
          return fail(`Invalid volume mapping: ${v}`, 400);
        }
        args.push('-v', shellEscape(v));
      }
    }

    args.push(spec.image);

    if (spec.command) {
      if (/[;&|`$(){}]/.test(spec.command)) {
        return fail(
          'Invalid command — shell metacharacters not allowed',
          400,
        );
      }
      args.push(...spec.command.split(/\s+/).map((arg) => shellEscape(arg)));
    }

    const cmd = args.join(' ');
    const r = await this.exec(serverId, cmd, 60_000);
    if (r.exitCode !== 0) {
      return fail(
        r.stderr.trim() || `docker run failed (exit ${r.exitCode})`,
        500,
      );
    }
    return ok({ containerId: r.stdout.trim().substring(0, 12) });
  }
}

// ── Helpers (private to this module) ──────────────────────

function parseContainers(stdout: string): DockerContainer[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const out: DockerContainer[] = [];
  for (const line of lines) {
    try {
      const raw: DockerPsJson = JSON.parse(line);
      const state = raw.State.toLowerCase();
      out.push({
        id: raw.ID,
        name: raw.Names,
        image: raw.Image,
        status: raw.Status,
        state: (['running', 'exited', 'paused', 'restarting', 'dead'].includes(
          state,
        )
          ? state
          : 'exited') as DockerContainer['state'],
        ports: raw.Ports,
        created: raw.CreatedAt,
      });
    } catch {
      /* skip malformed lines */
    }
  }
  return out;
}

function parseImages(stdout: string): DockerImage[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const out: DockerImage[] = [];
  for (const line of lines) {
    try {
      const raw: DockerImageJson = JSON.parse(line);
      out.push({
        id: raw.ID,
        repository: raw.Repository,
        tag: raw.Tag,
        size: raw.Size,
        created: raw.CreatedAt,
      });
    } catch {
      /* skip malformed lines */
    }
  }
  return out;
}

function isValidContainerId(id: string): boolean {
  return typeof id === 'string' && /^[a-f0-9]{12,64}$/.test(id);
}
