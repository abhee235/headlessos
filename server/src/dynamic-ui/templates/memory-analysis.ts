// EX3-B.3: Memory Analysis template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const memoryAnalysisTemplate: UITemplate = {
  id: 'memory-analysis',
  name: 'Memory Analysis',
  description: 'Memory breakdown with usage stats, swap, and top consumers',
  tags: ['memory', 'ram', 'swap', 'monitoring', 'performance'],
  layoutPattern: 'dashboard-metrics',
  matchPatterns: [
    '^free\\s+-[mhg]',
    '^free$',
    '^cat\\s+/proc/meminfo',
    '^vmstat',
  ],
  schema: {
    title: 'Memory Analysis',
    description: 'Memory usage breakdown and top consumers',
    icon: 'MemoryStick',
    sidebarItems: [{ id: 'main', label: 'Memory' }],
    sections: {
      main: {
        layout: 'stack',
        gap: 'md',
        children: [
          {
            layout: 'grid',
            autoFit: true,
            minChildWidth: 200,
            children: [
              { type: 'stat-card', title: 'Total RAM', value: '16', unit: 'GB', icon: 'MemoryStick', trend: 'neutral' },
              { type: 'stat-card', title: 'Used', value: '11.2', unit: 'GB', icon: 'Activity', trend: 'up' },
              { type: 'stat-card', title: 'Available', value: '4.8', unit: 'GB', icon: 'CheckCircle', trend: 'down' },
              { type: 'stat-card', title: 'Swap Used', value: '512', unit: 'MB / 4 GB', icon: 'HardDrive', trend: 'neutral' },
            ],
          },
          {
            layout: 'grid',
            columns: 2,
            gap: 'md',
            children: [
              {
                type: 'key-value',
                title: 'Memory Breakdown',
                pairs: [
                  { key: 'Buffers', value: '1.2 GB' },
                  { key: 'Cached', value: '3.8 GB' },
                  { key: 'Shared', value: '256 MB' },
                  { key: 'Dirty', value: '12 MB' },
                  { key: 'Slab', value: '890 MB' },
                  { key: 'Page Tables', value: '64 MB' },
                ],
                layout: 'grid-3',
              },
              {
                type: 'progress-bar',
                title: 'Memory Usage',
                value: 70,
                label: '11.2 GB / 16 GB',
                variant: 'warning',
              },
            ],
          },
          {
            type: 'table',
            title: 'Top Memory Consumers',
            columns: [
              { key: 'pid', label: 'PID', type: 'mono', sortable: true },
              { key: 'user', label: 'User', type: 'text' },
              { key: 'command', label: 'Command', type: 'text', sortable: true },
              { key: 'rss', label: 'RSS', type: 'text', sortable: true },
              { key: 'percent', label: '%MEM', type: 'percent', sortable: true },
            ],
            rows: [
              { pid: '1234', user: 'postgres', command: 'postgres: main', rss: '2.1 GB', percent: 13.1 },
              { pid: '2345', user: 'node', command: 'node /app/server.js', rss: '890 MB', percent: 5.6 },
              { pid: '3456', user: 'www-data', command: 'nginx: worker', rss: '256 MB', percent: 1.6 },
              { pid: '4567', user: 'redis', command: 'redis-server', rss: '128 MB', percent: 0.8 },
              { pid: '5678', user: 'root', command: 'dockerd', rss: '512 MB', percent: 3.2 },
            ],
            filters: { search: true },
          },
        ],
      },
    },
  },
};
