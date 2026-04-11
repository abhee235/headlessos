// EX1.7: Process Top template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const processTopTemplate: UITemplate = {
  id: 'process-top',
  name: 'Top Processes',
  description: 'Top processes by CPU and memory utilization',
  tags: ['processes', 'top', 'htop', 'monitoring', 'performance'],
  layoutPattern: 'single-table',
  matchPatterns: [
    '^top\\b',
    '^htop$',
    '^ps\\s+aux',
    '^ps\\s+-ef',
    '^ps\\s+(-A|--all)',
  ],
  schema: {
    title: 'Top Processes',
    description: 'Processes sorted by resource consumption',
    icon: 'Activity',
    sidebarItems: [{ id: 'main', label: 'Processes' }],
    sections: {
      main: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          layout: 'grid',
          autoFit: true,
          minChildWidth: 180,
          children: [
            { type: 'stat-card', title: 'Load 1m', value: '2.45', icon: 'Activity', trend: 'up' },
            { type: 'stat-card', title: 'Load 5m', value: '1.82' },
            { type: 'stat-card', title: 'Load 15m', value: '1.34', trend: 'down' },
            { type: 'stat-card', title: 'Total Procs', value: '247' },
            { type: 'stat-card', title: 'Running', value: '3', trend: 'neutral' },
          ],
        },
        {
          type: 'table',
          title: 'Process List',
          columns: [
            { key: 'pid', label: 'PID', type: 'number', sortable: true },
            { key: 'user', label: 'User', type: 'text' },
            { key: 'cpu', label: 'CPU%', type: 'percent', sortable: true },
            { key: 'mem', label: 'MEM%', type: 'percent', sortable: true },
            { key: 'vsz', label: 'VSZ', type: 'text' },
            { key: 'rss', label: 'RSS', type: 'text' },
            {
              key: 'state',
              label: 'State',
              type: 'badge',
              badgeVariant: { R: 'success', S: 'default', D: 'warning', Z: 'destructive', T: 'secondary' },
            },
            { key: 'command', label: 'Command', type: 'code' },
          ],
          rows: [
            { pid: 9012, user: 'postgres', cpu: 18.5, mem: 12.4, vsz: '2.1 GB', rss: '512 MB', state: 'S', command: '/usr/lib/postgresql/16/bin/postgres' },
            { pid: 3456, user: 'node', cpu: 12.3, mem: 8.2, vsz: '1.8 GB', rss: '256 MB', state: 'S', command: 'node /app/server.js' },
            { pid: 5678, user: 'www-data', cpu: 5.7, mem: 2.8, vsz: '128 MB', rss: '45 MB', state: 'S', command: 'nginx: worker process' },
            { pid: 7890, user: 'root', cpu: 4.2, mem: 3.1, vsz: '256 MB', rss: '80 MB', state: 'R', command: 'python3 /opt/monitor/agent.py' },
            { pid: 2345, user: 'redis', cpu: 1.8, mem: 1.5, vsz: '64 MB', rss: '28 MB', state: 'S', command: 'redis-server *:6379' },
          ],
          filters: { search: true },
          footer: 'Showing top 5 of 247 processes',
        },
      ],
      },
    },
  },
};
