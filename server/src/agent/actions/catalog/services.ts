// EX9.1: read actions — services, logs, cron
// @see docs/phases/phase-ex9.md §1

import { z } from 'zod';
import { readAction } from './define.js';
import { lineCount, readPath, unitName } from '../params.js';

/** journalctl --since values the model may pick */
const SINCE = { '15m': '-15min', '1h': '-1h', '6h': '-6h', '24h': '-24h', '7d': '-7d' } as const;
const since = () => z.enum(['15m', '1h', '6h', '24h', '7d']).optional().describe('only entries newer than this');

export const SERVICE_ACTIONS = [
  readAction({
    id: 'service_list',
    title: 'Services',
    description: 'systemd services with load, active and sub state (systemctl list-units).',
    category: 'service',
    keywords: ['service', 'daemon', 'systemd', 'running', 'units'],
    params: z.object({
      state: z.enum(['all', 'running', 'failed', 'inactive']).default('all').describe('filter by state'),
    }).strict(),
    run: {
      kind: 'exec',
      build: (p) => [
        'systemctl', 'list-units', '--type=service', '--no-pager', '--no-legend',
        ...(p.state === 'all' ? ['--all'] : [`--state=${p.state}`]),
      ],
    },
  }),
  readAction({
    id: 'service_failed',
    title: 'Failed units',
    description: 'systemd units in the failed state (systemctl --failed).',
    category: 'service',
    keywords: ['failed', 'broken', 'crash', 'error', 'service'],
    run: { kind: 'exec', build: () => ['systemctl', '--failed', '--no-pager', '--no-legend'] },
  }),
  readAction({
    id: 'service_status',
    title: 'Service status',
    description: 'Status of one systemd unit: active state, main PID, memory and its last log lines.',
    category: 'service',
    keywords: ['service', 'status', 'running', 'stopped', 'nginx', 'apache', 'mysql', 'postgres'],
    params: z.object({ unit: unitName(), lines: lineCount(100, 20) }).strict(),
    okExitCodes: [0, 1, 2, 3, 4],
    run: { kind: 'exec', build: (p) => ['systemctl', 'status', '--no-pager', `--lines=${p.lines}`, '--', p.unit] },
  }),
  readAction({
    id: 'service_config',
    title: 'Service unit file',
    description: 'The unit file and drop-ins systemd uses for a service (systemctl cat).',
    category: 'service',
    keywords: ['unit', 'config', 'execstart', 'service file'],
    params: z.object({ unit: unitName() }).strict(),
    okExitCodes: [0, 1],
    run: { kind: 'exec', build: (p) => ['systemctl', 'cat', '--no-pager', '--', p.unit] },
  }),
  readAction({
    id: 'sysv_services',
    title: 'Init services (no systemd)',
    description: 'Service states on hosts without systemd (service --status-all).',
    category: 'service',
    keywords: ['service', 'init', 'sysv', 'running'],
    run: { kind: 'exec', build: () => ['service', '--status-all'] },
  }),

  // ── Logs ──
  readAction({
    id: 'service_logs',
    title: 'Service logs',
    description: 'Recent journal lines for one systemd unit, with ISO timestamps.',
    category: 'logs',
    keywords: ['log', 'logs', 'journal', 'error', 'service', 'why'],
    params: z.object({ unit: unitName(), lines: lineCount(500, 100), since: since() }).strict(),
    keep: 'tail',
    run: {
      kind: 'exec',
      build: (p) => [
        'journalctl', '-u', p.unit, '-n', String(p.lines), '--no-pager', '--output=short-iso',
        ...(p.since ? [`--since=${SINCE[p.since]}`] : []),
      ],
    },
  }),
  readAction({
    id: 'system_logs',
    title: 'System journal',
    description: 'Recent system journal lines, optionally only warnings/errors or a time window.',
    category: 'logs',
    keywords: ['log', 'logs', 'journal', 'syslog', 'error', 'warning'],
    params: z.object({
      lines: lineCount(500, 100),
      priority: z.enum(['err', 'warning', 'notice', 'info']).optional().describe('lowest priority to include'),
      since: since(),
    }).strict(),
    keep: 'tail',
    run: {
      kind: 'exec',
      build: (p) => [
        'journalctl', '-n', String(p.lines), '--no-pager', '--output=short-iso',
        ...(p.priority ? ['-p', p.priority] : []),
        ...(p.since ? [`--since=${SINCE[p.since]}`] : []),
      ],
    },
  }),
  readAction({
    id: 'kernel_messages',
    title: 'Kernel messages',
    description: 'Kernel ring buffer with timestamps: OOM kills, disk and driver errors (dmesg).',
    category: 'logs',
    keywords: ['kernel', 'dmesg', 'oom', 'killed', 'hardware', 'disk error'],
    keep: 'tail',
    run: { kind: 'exec', build: () => ['dmesg', '--time-format=iso'] },
  }),
  readAction({
    id: 'file_tail',
    title: 'Tail a file',
    description: 'Last lines of a text file such as /var/log/nginx/error.log (SFTP).',
    category: 'logs',
    keywords: ['log', 'tail', 'nginx', 'error.log', 'auth.log', 'syslog'],
    params: z.object({ path: readPath(), lines: lineCount(1000, 100) }).strict(),
    keep: 'tail',
    maxOutputBytes: 262_144,
    run: { kind: 'sftp-read', path: (p) => p.path, maxBytes: () => 262_144, tailLines: (p) => p.lines },
  }),

  // ── Cron ──
  readAction({
    id: 'cron_user',
    title: 'User crontab',
    description: "The login user's crontab entries (crontab -l).",
    category: 'cron',
    keywords: ['cron', 'scheduled', 'job', 'crontab'],
    okExitCodes: [0, 1],
    run: { kind: 'exec', build: () => ['crontab', '-l'] },
  }),
];
