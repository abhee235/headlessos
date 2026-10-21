// EX9.1: read actions — system, disk, processes
// @see docs/phases/phase-ex9.md §1

import { z } from 'zod';
import { readAction } from './define.js';
import { lineCount, pid, readPath } from '../params.js';

export const SYSTEM_ACTIONS = [
  readAction({
    id: 'os_release',
    title: 'OS release',
    description: 'Linux distribution name and version (/etc/os-release).',
    category: 'system',
    keywords: ['distro', 'ubuntu', 'debian', 'version', 'os'],
    run: { kind: 'exec', build: () => ['cat', '/etc/os-release'] },
  }),
  readAction({
    id: 'kernel_info',
    title: 'Kernel and host',
    description: 'Kernel version, host name and architecture (uname -a).',
    category: 'system',
    keywords: ['kernel', 'hostname', 'architecture', 'arch'],
    run: { kind: 'exec', build: () => ['uname', '-a'] },
  }),
  readAction({
    id: 'uptime',
    title: 'Uptime and load',
    description: 'How long the server has been up, logged-in user count and load averages.',
    category: 'system',
    keywords: ['load', 'reboot', 'running since'],
    run: { kind: 'exec', build: () => ['uptime'] },
  }),
  readAction({
    id: 'cpu_info',
    title: 'CPU info',
    description: 'CPU model, cores, threads and architecture (lscpu).',
    category: 'system',
    keywords: ['cpu', 'cores', 'processor'],
    run: { kind: 'exec', build: () => ['lscpu'] },
  }),
  readAction({
    id: 'load_average',
    title: 'Load average',
    description: 'Load averages over 1, 5 and 15 minutes plus running/total tasks (/proc/loadavg).',
    category: 'system',
    keywords: ['load', 'cpu', 'busy'],
    run: { kind: 'exec', build: () => ['cat', '/proc/loadavg'] },
  }),
  readAction({
    id: 'memory_usage',
    title: 'Memory usage',
    description: 'RAM and swap totals, used, free and available in MiB (free -m).',
    category: 'system',
    keywords: ['memory', 'ram', 'swap', 'oom'],
    run: { kind: 'exec', build: () => ['free', '-m'] },
  }),
  readAction({
    id: 'logged_in_users',
    title: 'Logged-in users',
    description: 'Who is logged in now, from which terminal and host (who).',
    category: 'system',
    keywords: ['users', 'sessions', 'who', 'login'],
    run: { kind: 'exec', build: () => ['who'] },
  }),
  readAction({
    id: 'recent_logins',
    title: 'Recent logins',
    description: 'Most recent logins and reboots (last).',
    category: 'system',
    keywords: ['login', 'history', 'reboot', 'users'],
    params: z.object({ lines: lineCount(200, 20) }).strict(),
    run: { kind: 'exec', build: (p) => ['last', '-n', String(p.lines)] },
  }),
  readAction({
    id: 'current_user',
    title: 'Current user',
    description: 'The SSH login user and its groups (id).',
    category: 'system',
    keywords: ['user', 'whoami', 'groups', 'permissions'],
    run: { kind: 'exec', build: () => ['id'] },
  }),

  // ── Disk ──
  readAction({
    id: 'disk_usage',
    title: 'Disk usage',
    description: 'Size, used, free and use% per mounted filesystem, with type (df -hT).',
    category: 'disk',
    keywords: ['disk', 'space', 'full', 'storage', 'filesystem', 'df'],
    run: { kind: 'exec', build: () => ['df', '-hT'] },
  }),
  readAction({
    id: 'disk_inodes',
    title: 'Inode usage',
    description: 'Inodes used and free per filesystem (df -i); a disk can be "full" on inodes.',
    category: 'disk',
    keywords: ['inode', 'disk', 'full', 'files'],
    run: { kind: 'exec', build: () => ['df', '-i'] },
  }),
  readAction({
    id: 'block_devices',
    title: 'Block devices',
    description: 'Disks and partitions with size, type, filesystem and mount point (lsblk).',
    category: 'disk',
    keywords: ['disk', 'partition', 'drive', 'volume'],
    run: { kind: 'exec', build: () => ['lsblk', '-o', 'NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT'] },
  }),
  readAction({
    id: 'mounts',
    title: 'Mounts',
    description: 'Mounted filesystems with source, type and options (findmnt -l).',
    category: 'disk',
    keywords: ['mount', 'filesystem', 'nfs'],
    run: { kind: 'exec', build: () => ['findmnt', '-l'] },
  }),
  readAction({
    id: 'dir_size',
    title: 'Directory size',
    description: 'Size of a directory, optionally of each subdirectory one or two levels down (du).',
    category: 'disk',
    keywords: ['size', 'space', 'biggest', 'folder', 'directory', 'du'],
    params: z.object({
      path: readPath(),
      depth: z.number().int().min(0).max(2).default(1).describe('0 = total only, 1–2 = per subdirectory'),
    }).strict(),
    timeoutMs: 30_000,
    run: { kind: 'exec', build: (p) => ['du', '-h', '-x', `--max-depth=${p.depth}`, '--', p.path] },
  }),

  // ── Processes ──
  readAction({
    id: 'process_list',
    title: 'Processes',
    description: 'All processes with user, CPU%, MEM%, RSS and command, sorted (ps aux).',
    category: 'process',
    keywords: ['process', 'cpu', 'memory', 'top', 'running', 'hog'],
    params: z.object({
      sortBy: z.enum(['cpu', 'memory', 'pid']).default('cpu').describe('sort order'),
    }).strict(),
    run: {
      kind: 'exec',
      build: (p) => ['ps', 'aux', p.sortBy === 'cpu' ? '--sort=-%cpu' : p.sortBy === 'memory' ? '--sort=-%mem' : '--sort=pid'],
    },
  }),
  readAction({
    id: 'process_detail',
    title: 'Process detail',
    description: 'One process: parent, user, state, threads, start time, elapsed, CPU%, MEM% and full command.',
    category: 'process',
    keywords: ['process', 'pid'],
    params: z.object({ pid: pid() }).strict(),
    okExitCodes: [0, 1],
    run: {
      kind: 'exec',
      build: (p) => ['ps', '-o', 'pid,ppid,user,stat,nlwp,ni,lstart,etime,%cpu,%mem,rss,args', '-p', String(p.pid)],
    },
  }),
  readAction({
    id: 'process_find',
    title: 'Find processes',
    description: 'Processes whose name matches, with pid and command line (pgrep -a).',
    category: 'process',
    keywords: ['process', 'running', 'pid', 'find'],
    params: z.object({
      name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:+-]{0,63}$/, 'expected a process name like nginx').describe('process name, e.g. nginx'),
    }).strict(),
    okExitCodes: [0, 1],
    run: { kind: 'exec', build: (p) => ['pgrep', '-a', p.name] },
  }),
];
