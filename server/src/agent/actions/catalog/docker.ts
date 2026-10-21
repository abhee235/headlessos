// EX9.1: read actions — Docker
// @see docs/phases/phase-ex9.md §1

import { z } from 'zod';
import { jsonLines, readAction } from './define.js';
import { containerRef, lineCount } from '../params.js';

const JSON_FORMAT = '{{json .}}';

/**
 * `docker inspect` minus anything that commonly holds secrets: environment
 * variables, and the full config of mounts' drivers. The model gets what it
 * needs to diagnose (state, restart policy, ports, mounts, networks, health).
 */
export function summarizeInspect(stdout: string): unknown {
  const items = JSON.parse(stdout) as Array<Record<string, unknown>>;
  return items.map((c) => {
    const config = (c.Config ?? {}) as Record<string, unknown>;
    const host = (c.HostConfig ?? {}) as Record<string, unknown>;
    const net = (c.NetworkSettings ?? {}) as Record<string, unknown>;
    return {
      Id: typeof c.Id === 'string' ? c.Id.slice(0, 12) : c.Id,
      Name: c.Name,
      Created: c.Created,
      State: c.State,
      RestartCount: c.RestartCount,
      Image: config.Image,
      Cmd: config.Cmd,
      Entrypoint: config.Entrypoint,
      WorkingDir: config.WorkingDir,
      User: config.User,
      Healthcheck: config.Healthcheck,
      EnvCount: Array.isArray(config.Env) ? config.Env.length : 0,
      RestartPolicy: host.RestartPolicy,
      Memory: host.Memory,
      NanoCpus: host.NanoCpus,
      Privileged: host.Privileged,
      PortBindings: host.PortBindings,
      Mounts: Array.isArray(c.Mounts)
        ? (c.Mounts as Array<Record<string, unknown>>).map((m) => ({ Type: m.Type, Source: m.Source, Destination: m.Destination, RW: m.RW }))
        : [],
      Networks: net.Networks ? Object.keys(net.Networks as object) : [],
      Ports: net.Ports,
    };
  });
}

export const DOCKER_ACTIONS = [
  readAction({
    id: 'docker_containers',
    title: 'Containers',
    description: 'All containers (running and stopped) with image, state, status and ports.',
    category: 'docker',
    keywords: ['docker', 'container', 'containers', 'running', 'stopped', 'exited'],
    run: { kind: 'exec', build: () => ['docker', 'ps', '-a', '--no-trunc', '--format', JSON_FORMAT] },
    parse: jsonLines(['ID', 'Names', 'Image', 'State', 'Status', 'Ports', 'CreatedAt', 'RunningFor']),
  }),
  readAction({
    id: 'docker_images',
    title: 'Images',
    description: 'Local Docker images with tag, id, size and age.',
    category: 'docker',
    keywords: ['docker', 'image', 'images', 'size'],
    run: { kind: 'exec', build: () => ['docker', 'images', '--format', JSON_FORMAT] },
    parse: jsonLines(['Repository', 'Tag', 'ID', 'Size', 'CreatedSince']),
  }),
  readAction({
    id: 'docker_stats',
    title: 'Container resource use',
    description: 'CPU%, memory, network and block I/O per running container (one sample).',
    category: 'docker',
    keywords: ['docker', 'cpu', 'memory', 'usage', 'stats', 'container'],
    timeoutMs: 20_000,
    run: { kind: 'exec', build: () => ['docker', 'stats', '--no-stream', '--format', JSON_FORMAT] },
    parse: jsonLines(['Name', 'CPUPerc', 'MemUsage', 'MemPerc', 'NetIO', 'BlockIO', 'PIDs']),
  }),
  readAction({
    id: 'docker_inspect',
    title: 'Inspect container',
    description: 'One container: state, exit code, restart policy, health, ports, mounts (env vars left out).',
    category: 'docker',
    keywords: ['docker', 'container', 'inspect', 'exit code', 'restart', 'health', 'crash'],
    params: z.object({ container: containerRef() }).strict(),
    okExitCodes: [0, 1],
    run: { kind: 'exec', build: (p) => ['docker', 'inspect', '--type', 'container', '--', p.container] },
    parse: summarizeInspect,
  }),
  readAction({
    id: 'docker_logs',
    title: 'Container logs',
    description: 'Last lines a container wrote to stdout and stderr, with timestamps.',
    category: 'docker',
    keywords: ['docker', 'logs', 'container', 'error', 'crash'],
    params: z.object({ container: containerRef(), lines: lineCount(1000, 100) }).strict(),
    keep: 'tail',
    run: { kind: 'exec', build: (p) => ['docker', 'logs', '--tail', String(p.lines), '--timestamps', '--', p.container] },
  }),
  readAction({
    id: 'docker_volumes',
    title: 'Volumes',
    description: 'Docker volumes with driver and name.',
    category: 'docker',
    keywords: ['docker', 'volume', 'volumes', 'storage'],
    run: { kind: 'exec', build: () => ['docker', 'volume', 'ls'] },
  }),
  readAction({
    id: 'docker_disk_usage',
    title: 'Docker disk use',
    description: 'Space used by images, containers, volumes and build cache, and how much is reclaimable.',
    category: 'docker',
    keywords: ['docker', 'disk', 'space', 'prune', 'reclaimable'],
    timeoutMs: 30_000,
    run: { kind: 'exec', build: () => ['docker', 'system', 'df'] },
  }),
];
