// EX3-B.3: Docker Images template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const dockerImagesTemplate: UITemplate = {
  id: 'docker-images',
  name: 'Docker Images',
  description: 'Docker image inventory with size, tag, and repository info',
  tags: ['docker', 'images', 'containers', 'devops'],
  layoutPattern: 'single-table',
  matchPatterns: [
    '^docker\\s+images',
    '^docker\\s+image\\s+ls',
    '^docker\\s+image\\s+list',
  ],
  schema: {
    title: 'Docker Images',
    description: 'Local Docker image inventory',
    icon: 'Layers',
    sidebarItems: [{ id: 'main', label: 'Images' }],
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
              { type: 'stat-card', title: 'Total Images', value: '14', icon: 'Layers', trend: 'neutral' },
              { type: 'stat-card', title: 'Total Size', value: '8.2', unit: 'GB', icon: 'HardDrive', trend: 'up' },
              { type: 'stat-card', title: 'Dangling', value: '3', icon: 'AlertTriangle', trend: 'neutral' },
            ],
          },
          {
            type: 'table',
            title: 'Images',
            columns: [
              { key: 'repository', label: 'Repository', type: 'text', sortable: true },
              { key: 'tag', label: 'Tag', type: 'badge', badgeVariant: { latest: 'success', '*': 'secondary' } },
              { key: 'imageId', label: 'Image ID', type: 'mono' },
              { key: 'created', label: 'Created', type: 'text' },
              { key: 'size', label: 'Size', type: 'text', sortable: true },
            ],
            rows: [
              { repository: 'nginx', tag: 'latest', imageId: 'a6bd71f',  created: '2 weeks ago', size: '187 MB' },
              { repository: 'node', tag: '20-alpine', imageId: 'b3e2c4d', created: '3 weeks ago', size: '126 MB' },
              { repository: 'postgres', tag: '16', imageId: 'c7f9a1e', created: '1 month ago', size: '432 MB' },
              { repository: 'redis', tag: '7-alpine', imageId: 'd4b8e2f', created: '2 months ago', size: '30 MB' },
              { repository: '<none>', tag: '<none>', imageId: 'e5c1d3a', created: '3 months ago', size: '245 MB' },
            ],
            filters: { search: true },
            footer: '14 images, 8.2 GB total',
          },
        ],
      },
    },
  },
};
