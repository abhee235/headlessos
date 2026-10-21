// EX9.2: change actions — each one pauses the run until the owner allows it
// @see docs/phases/phase-ex9.md §7, docs/DECISIONS.md (ADR-024)
//
// Mirrors the write operations the classic apps already offer (Services, Docker,
// Server Admin, Task Manager). The runner adds a required `reason` parameter and
// shows it on the approval card with the full command, server and login user.

import { z } from 'zod';
import { changeAction } from './define.js';
import { containerRef, packageName, pid, unitName } from '../params.js';

const unit = z.object({ unit: unitName() }).strict();
const container = z.object({ container: containerRef() }).strict();

export const CHANGE_ACTIONS = [
  changeAction({
    id: 'service_start',
    title: 'Start service',
    description: 'Start a systemd service (sudo).',
    category: 'service',
    keywords: ['start', 'service', 'down', 'stopped'],
    params: unit,
    timeoutMs: 60_000,
    run: { kind: 'exec', sudo: true, build: (p) => ['systemctl', 'start', '--', p.unit] },
  }),
  changeAction({
    id: 'service_stop',
    title: 'Stop service',
    description: 'Stop a systemd service (sudo).',
    category: 'service',
    keywords: ['stop', 'service', 'disable'],
    params: unit,
    timeoutMs: 60_000,
    run: { kind: 'exec', sudo: true, build: (p) => ['systemctl', 'stop', '--', p.unit] },
  }),
  changeAction({
    id: 'service_restart',
    title: 'Restart service',
    description: 'Restart a systemd service (sudo).',
    category: 'service',
    keywords: ['restart', 'service', 'stuck', 'reload'],
    params: unit,
    timeoutMs: 60_000,
    run: { kind: 'exec', sudo: true, build: (p) => ['systemctl', 'restart', '--', p.unit] },
  }),
  changeAction({
    id: 'service_reload',
    title: 'Reload service',
    description: 'Reload a systemd service so it rereads its configuration (sudo).',
    category: 'service',
    keywords: ['reload', 'config', 'service'],
    params: unit,
    timeoutMs: 60_000,
    run: { kind: 'exec', sudo: true, build: (p) => ['systemctl', 'reload', '--', p.unit] },
  }),
  changeAction({
    id: 'container_start',
    title: 'Start container',
    description: 'Start a stopped Docker container.',
    category: 'docker',
    keywords: ['docker', 'container', 'start', 'exited'],
    params: container,
    timeoutMs: 60_000,
    run: { kind: 'exec', build: (p) => ['docker', 'start', '--', p.container] },
  }),
  changeAction({
    id: 'container_stop',
    title: 'Stop container',
    description: 'Stop a running Docker container.',
    category: 'docker',
    keywords: ['docker', 'container', 'stop'],
    params: container,
    timeoutMs: 60_000,
    run: { kind: 'exec', build: (p) => ['docker', 'stop', '--', p.container] },
  }),
  changeAction({
    id: 'container_restart',
    title: 'Restart container',
    description: 'Restart a Docker container.',
    category: 'docker',
    keywords: ['docker', 'container', 'restart'],
    params: container,
    timeoutMs: 60_000,
    run: { kind: 'exec', build: (p) => ['docker', 'restart', '--', p.container] },
  }),
  changeAction({
    id: 'nginx_reload',
    title: 'Reload nginx',
    description: 'Reload nginx so it picks up configuration changes (sudo; test first with nginx_test).',
    category: 'web',
    keywords: ['nginx', 'reload', 'config'],
    params: z.object({}).strict(),
    timeoutMs: 30_000,
    run: { kind: 'exec', sudo: true, build: () => ['nginx', '-s', 'reload'] },
  }),
  changeAction({
    id: 'process_signal',
    title: 'Signal a process',
    description: 'Send TERM, HUP, INT or KILL to a process owned by the login user.',
    category: 'process',
    keywords: ['kill', 'process', 'stop', 'hung', 'signal'],
    params: z.object({
      pid: pid(),
      signal: z.enum(['TERM', 'HUP', 'INT', 'KILL']).default('TERM').describe('signal to send'),
    }).strict(),
    timeoutMs: 15_000,
    run: { kind: 'exec', build: (p) => ['kill', '-s', p.signal, String(p.pid)] },
  }),
  changeAction({
    id: 'package_install',
    title: 'Install package',
    description: 'Install one Debian/Ubuntu package with apt-get (sudo).',
    category: 'packages',
    keywords: ['install', 'package', 'apt', 'missing'],
    params: z.object({ name: packageName() }).strict(),
    timeoutMs: 600_000,
    run: { kind: 'exec', sudo: true, build: (p) => ['apt-get', 'install', '-y', p.name] },
  }),
  changeAction({
    id: 'packages_refresh',
    title: 'Refresh package lists',
    description: 'Download fresh Debian/Ubuntu package lists (apt-get update, sudo).',
    category: 'packages',
    keywords: ['update', 'apt', 'package lists'],
    params: z.object({}).strict(),
    timeoutMs: 300_000,
    run: { kind: 'exec', sudo: true, build: () => ['apt-get', 'update'] },
  }),
];
