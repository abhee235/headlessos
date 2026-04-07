// EX1.7: Package List template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const packageListTemplate: UITemplate = {
  id: 'package-list',
  name: 'Package List',
  description: 'Installed packages listing from apt, rpm, pip, or npm',
  tags: ['packages', 'software', 'apt', 'rpm', 'pip', 'npm'],
  matchPatterns: [
    'dpkg\\s+(-l|--list)',
    'apt\\s+list\\s+--installed',
    'rpm\\s+-qa',
    'pip\\s+list',
    'pip3\\s+list',
    'npm\\s+list\\s+-g',
  ],
  schema: {
    title: 'Installed Packages',
    description: 'Package listing with version and status information',
    icon: 'Package',
    root: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'stat-card',
          title: 'Total Packages',
          value: '342',
          description: 'Installed on system',
        },
        {
          type: 'table',
          title: 'Package Details',
          columns: [
            { key: 'name', label: 'Package', type: 'text', sortable: true },
            { key: 'version', label: 'Version', type: 'code' },
            {
              key: 'status',
              label: 'Status',
              type: 'badge',
              badgeVariant: {
                installed: 'success',
                upgradable: 'warning',
                removed: 'destructive',
                'half-configured': 'warning',
              },
            },
            { key: 'size', label: 'Size', type: 'text' },
          ],
          rows: [
            { name: 'nginx', version: '1.24.0-1', status: 'installed', size: '1.2 MB' },
            { name: 'nodejs', version: '20.11.0', status: 'installed', size: '45 MB' },
            { name: 'python3', version: '3.10.12', status: 'installed', size: '52 MB' },
            { name: 'curl', version: '7.81.0-1', status: 'installed', size: '420 KB' },
            { name: 'git', version: '2.34.1', status: 'upgradable', size: '28 MB' },
          ],
          footer: 'Showing 5 of 342 packages',
        },
      ],
    },
  },
};
