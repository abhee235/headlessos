// EX1.4: Playground example views — pre-loaded JSON examples
// @see docs/phases/phase-ex1.md

import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

interface PlaygroundExample {
  id: string;
  name: string;
  data: DynamicView;
}

export const EXAMPLE_VIEWS: PlaygroundExample[] = [
  {
    id: 'system-overview',
    name: 'System Overview',
    data: {
      title: 'System Overview',
      description: 'Server health metrics at a glance',
      icon: 'Activity',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [
          {
            type: 'alert',
            message: 'All systems operational',
            variant: 'success',
          },
          {
            type: 'key-value',
            title: 'Server Info',
            pairs: [
              { key: 'Hostname', value: 'web-prod-01', copyable: false },
              { key: 'OS', value: 'Ubuntu 22.04 LTS', copyable: false },
              { key: 'Kernel', value: '5.15.0-91-generic', copyable: false },
              { key: 'Uptime', value: '42 days, 3 hours', copyable: false },
            ],
            layout: 'grid-2',
          },
          {
            type: 'progress-bar',
            title: 'CPU Usage',
            value: 45,
            label: '4 cores',
            variant: 'default',
          },
          {
            type: 'progress-bar',
            title: 'Memory',
            value: 78,
            label: '6.2 GB / 8 GB',
            variant: 'warning',
          },
          {
            type: 'progress-bar',
            title: 'Disk',
            value: 64,
            label: '320 GB / 500 GB',
            variant: 'default',
          },
        ],
      },
      meta: {
        command: 'uname -a && free -h && df -h',
        generatedAt: new Date().toISOString(),
      },
    },
  },
  {
    id: 'docker-containers',
    name: 'Docker Containers',
    data: {
      title: 'Docker Containers',
      description: 'Running containers on this host',
      icon: 'Box',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [
          {
            type: 'badge-grid',
            title: 'Container Status',
            badges: [
              { label: 'Running', value: '5', variant: 'success' },
              { label: 'Stopped', value: '2', variant: 'destructive' },
              { label: 'Paused', value: '0', variant: 'secondary' },
            ],
          },
          {
            type: 'table',
            title: 'Containers',
            columns: [
              { key: 'name', label: 'Name', type: 'text', sortable: false },
              { key: 'image', label: 'Image', type: 'code', sortable: false },
              {
                key: 'status', label: 'Status', type: 'badge', sortable: false,
                badgeVariant: { running: 'success', stopped: 'destructive', paused: 'warning' },
              },
              { key: 'ports', label: 'Ports', type: 'text', sortable: false },
              { key: 'cpu', label: 'CPU', type: 'percent', sortable: false },
            ],
            rows: [
              { name: 'nginx-proxy', image: 'nginx:latest', status: 'running', ports: '80, 443', cpu: 2.3 },
              { name: 'postgres-db', image: 'postgres:15', status: 'running', ports: '5432', cpu: 8.1 },
              { name: 'redis-cache', image: 'redis:7', status: 'running', ports: '6379', cpu: 0.4 },
              { name: 'app-worker', image: 'myapp:v2.1', status: 'running', ports: '3000', cpu: 15.2 },
              { name: 'monitoring', image: 'grafana:latest', status: 'running', ports: '3100', cpu: 3.7 },
              { name: 'old-api', image: 'myapp:v1.9', status: 'stopped', ports: '-', cpu: 0 },
              { name: 'test-db', image: 'postgres:14', status: 'stopped', ports: '-', cpu: 0 },
            ],
            footer: '7 containers total',
          },
        ],
      },
      meta: {
        command: 'docker ps -a --format json',
        generatedAt: new Date().toISOString(),
      },
    },
  },
  {
    id: 'metrics-grid',
    name: 'Metrics Grid',
    data: {
      title: 'Performance Metrics',
      icon: 'BarChart3',
      root: {
        layout: 'grid',
        columns: 3,
        widgets: [
          { type: 'stat-card', title: 'CPU', value: '45', unit: '%', trend: 'up', description: '+3% from last hour' },
          { type: 'stat-card', title: 'Memory', value: '6.2', unit: 'GB', trend: 'neutral' },
          { type: 'stat-card', title: 'Disk I/O', value: '124', unit: 'MB/s', trend: 'down', description: '-15% from peak' },
          { type: 'stat-card', title: 'Network In', value: '2.4', unit: 'Gbps', trend: 'up' },
          { type: 'stat-card', title: 'Network Out', value: '1.8', unit: 'Gbps', trend: 'neutral' },
          { type: 'stat-card', title: 'Uptime', value: '99.97', unit: '%' },
        ],
      },
    },
  },
  {
    id: 'nginx-config',
    name: 'Nginx Config',
    data: {
      title: 'Nginx Configuration',
      description: 'Active virtual hosts',
      icon: 'Globe',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [
          {
            type: 'code-block',
            title: 'Default Server Block',
            code: `server {
    listen 80;
    server_name example.com www.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /static/ {
        alias /var/www/static/;
        expires 30d;
    }
}`,
            language: 'nginx',
            maxHeight: '300px',
          },
          {
            type: 'alert',
            title: 'SSL Certificate',
            message: 'Certificate expires in 23 days. Consider renewing with certbot.',
            variant: 'warning',
          },
        ],
      },
      meta: {
        command: 'cat /etc/nginx/sites-enabled/default',
        generatedAt: new Date().toISOString(),
      },
    },
  },
  {
    id: 'minimal',
    name: 'Minimal (Empty)',
    data: {
      title: 'Empty View',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [],
      },
    },
  },
];
