// EX1.7: System Overview template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const systemOverviewTemplate: UITemplate = {
  id: 'system-overview',
  name: 'System Overview',
  description: 'System stats summary — CPU, memory, disk, uptime, hostname, OS info',
  tags: ['system', 'monitoring', 'dashboard', 'overview'],
  matchPatterns: [
    '^uname\\s+-a$',
    '^hostnamectl$',
    '^neofetch$',
    '^cat\\s+/etc/os-release',
    '^lsb_release',
  ],
  schema: {
    title: 'System Overview',
    description: 'Server system information and resource utilization',
    icon: 'Monitor',
    root: {
      layout: 'stack',
      gap: 'md',
      widgets: [
        {
          type: 'key-value',
          title: 'System Information',
          pairs: [
            { key: 'Hostname', value: 'server-01' },
            { key: 'OS', value: 'Ubuntu 22.04 LTS' },
            { key: 'Kernel', value: '5.15.0-91-generic' },
            { key: 'Architecture', value: 'x86_64' },
            { key: 'Uptime', value: '45 days, 3:22' },
            { key: 'Last Boot', value: '2026-02-20 14:30 UTC' },
          ],
          layout: 'grid-3',
        },
        {
          type: 'stat-card',
          title: 'CPU Usage',
          value: '23',
          unit: '%',
          trend: 'neutral',
          description: '4 cores / 8 threads',
        },
        {
          type: 'stat-card',
          title: 'Memory',
          value: '6.2',
          unit: 'GB / 16 GB',
          trend: 'up',
          description: '38.8% used',
        },
        {
          type: 'progress-bar',
          title: 'Disk Usage (/)',
          value: 62,
          label: '31 GB / 50 GB',
          variant: 'default',
        },
        {
          type: 'progress-bar',
          title: 'Disk Usage (/home)',
          value: 45,
          label: '90 GB / 200 GB',
          variant: 'default',
        },
      ],
    },
  },
};
