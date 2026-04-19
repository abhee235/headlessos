// EX3-B.3: Docker Compose template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const dockerComposeTemplate: UITemplate = {
  id: 'docker-compose',
  name: 'Docker Compose',
  description: 'Docker Compose project services with status, ports, and volumes',
  tags: ['docker', 'compose', 'containers', 'devops', 'orchestration'],
  layoutPattern: 'tabbed-detail',
  matchPatterns: [
    '^docker.compose\\s+ps',
    '^docker.compose\\s+config',
    '^docker.compose\\s+ls',
  ],
  schema: {
    title: 'Docker Compose Services',
    description: 'Compose project service status and configuration',
    icon: 'Container',
    sidebarItems: [{ id: 'main', label: 'Services' }],
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
              { type: 'stat-card', title: 'Running', value: '4', icon: 'Play', trend: 'neutral' },
              { type: 'stat-card', title: 'Stopped', value: '1', icon: 'Square', trend: 'neutral' },
              { type: 'stat-card', title: 'Total Services', value: '5', icon: 'Blocks', trend: 'neutral' },
            ],
          },
          {
            layout: 'tabs',
            tabs: [
              {
                id: 'status',
                label: 'Status',
                count: 5,
                children: [
                  {
                    type: 'card-list',
                    title: 'Service Status',
                    items: [
                      {
                        icon: 'Globe',
                        title: 'web',
                        subtitle: 'nginx:1.25',
                        badge: { label: 'running', variant: 'success', dot: true },
                        details: [
                          { label: 'Ports', value: '80:80, 443:443' },
                          { label: 'Uptime', value: '15 days' },
                        ],
                      },
                      {
                        icon: 'Server',
                        title: 'api',
                        subtitle: 'node:20-alpine',
                        badge: { label: 'running', variant: 'success', dot: true },
                        details: [
                          { label: 'Ports', value: '3001:3001' },
                          { label: 'Uptime', value: '15 days' },
                        ],
                      },
                      {
                        icon: 'Database',
                        title: 'db',
                        subtitle: 'postgres:16',
                        badge: { label: 'running', variant: 'success', dot: true },
                        details: [
                          { label: 'Ports', value: '5432:5432' },
                          { label: 'Volumes', value: 'pgdata:/var/lib/postgresql/data' },
                        ],
                      },
                      {
                        icon: 'Zap',
                        title: 'cache',
                        subtitle: 'redis:7-alpine',
                        badge: { label: 'running', variant: 'success', dot: true },
                        details: [
                          { label: 'Ports', value: '6379:6379' },
                        ],
                      },
                      {
                        icon: 'Cog',
                        title: 'worker',
                        subtitle: 'node:20-alpine',
                        badge: { label: 'exited', variant: 'destructive', dot: true },
                        details: [
                          { label: 'Exit Code', value: '1' },
                          { label: 'Since', value: '2 hours ago' },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'volumes',
                label: 'Volumes',
                count: 3,
                children: [
                  {
                    type: 'table',
                    title: 'Named Volumes',
                    columns: [
                      { key: 'name', label: 'Volume', type: 'text', sortable: true },
                      { key: 'driver', label: 'Driver', type: 'text' },
                      { key: 'mountpoint', label: 'Mountpoint', type: 'mono' },
                    ],
                    rows: [
                      { name: 'pgdata', driver: 'local', mountpoint: '/var/lib/docker/volumes/pgdata/_data' },
                      { name: 'redis-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/redis-data/_data' },
                      { name: 'uploads', driver: 'local', mountpoint: '/var/lib/docker/volumes/uploads/_data' },
                    ],
                  },
                ],
              },
              {
                id: 'networks',
                label: 'Networks',
                count: 2,
                children: [
                  {
                    type: 'table',
                    title: 'Networks',
                    columns: [
                      { key: 'name', label: 'Network', type: 'text' },
                      { key: 'driver', label: 'Driver', type: 'text' },
                      { key: 'subnet', label: 'Subnet', type: 'mono' },
                    ],
                    rows: [
                      { name: 'app_default', driver: 'bridge', subnet: '172.18.0.0/16' },
                      { name: 'app_backend', driver: 'bridge', subnet: '172.19.0.0/16' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  },
};
