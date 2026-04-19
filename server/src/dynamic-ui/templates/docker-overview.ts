// EX1.7: Docker Overview template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const dockerOverviewTemplate: UITemplate = {
  id: 'docker-overview',
  name: 'Docker Overview',
  description: 'Docker container status summary and resource usage',
  tags: ['docker', 'containers', 'devops', 'orchestration'],
  layoutPattern: 'status-overview',
  matchPatterns: [
    '^docker\\s+ps',
    '^docker\\s+container\\s+ls',
    '^docker\\s+stats',
    '^docker\\s+compose\\s+ps',
  ],
  schema: {
    title: 'Docker Containers',
    description: 'Container status and resource utilization',
    icon: 'Container',
    sidebarItems: [{ id: 'main', label: 'Containers' }],
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
            { type: 'stat-card', title: 'Running', value: '5', icon: 'Play', trend: 'neutral' },
            { type: 'stat-card', title: 'Stopped', value: '2', icon: 'Square', trend: 'neutral' },
            { type: 'stat-card', title: 'Paused', value: '0', icon: 'Pause', trend: 'neutral' },
            { type: 'stat-card', title: 'Images', value: '12', icon: 'Layers', trend: 'neutral' },
          ],
        },
        {
          type: 'table',
          title: 'Containers',
          columns: [
            { key: 'name', label: 'Name', type: 'text', sortable: true },
            { key: 'image', label: 'Image', type: 'code' },
            {
              key: 'status',
              label: 'Status',
              type: 'badge',
              badgeVariant: {
                running: 'success',
                exited: 'destructive',
                paused: 'warning',
                restarting: 'warning',
                created: 'secondary',
              },
            },
            { key: 'ports', label: 'Ports', type: 'text' },
            { key: 'cpu', label: 'CPU', type: 'percent' },
            { key: 'memory', label: 'Memory', type: 'text' },
            { key: 'uptime', label: 'Uptime', type: 'text' },
          ],
          rows: [
            { name: 'nginx-proxy', image: 'nginx:1.25', status: 'running', ports: '80, 443', cpu: 2.1, memory: '45 MB', uptime: '15 days' },
            { name: 'api-server', image: 'node:20-alpine', status: 'running', ports: '3001', cpu: 8.5, memory: '256 MB', uptime: '15 days' },
            { name: 'postgres-db', image: 'postgres:16', status: 'running', ports: '5432', cpu: 3.2, memory: '512 MB', uptime: '15 days' },
            { name: 'redis-cache', image: 'redis:7-alpine', status: 'running', ports: '6379', cpu: 0.5, memory: '28 MB', uptime: '15 days' },
            { name: 'worker', image: 'node:20-alpine', status: 'running', ports: '', cpu: 12.0, memory: '180 MB', uptime: '3 days' },
            { name: 'old-api', image: 'node:18', status: 'exited', ports: '', cpu: 0, memory: '0 B', uptime: 'Exited 5 days ago' },
            { name: 'test-db', image: 'postgres:15', status: 'exited', ports: '', cpu: 0, memory: '0 B', uptime: 'Exited 10 days ago' },
          ],
          filters: { search: true },
          footer: '5 running, 2 stopped',
        },
      ],
      },
    },
  },
};
