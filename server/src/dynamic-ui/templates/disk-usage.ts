// EX1.7: Disk Usage template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const diskUsageTemplate: UITemplate = {
  id: 'disk-usage',
  name: 'Disk Usage',
  description: 'Filesystem and directory size analysis',
  tags: ['disk', 'storage', 'filesystem', 'space', 'df', 'du'],
  matchPatterns: [
    '^df\\s+(-h|--human)',
    '^df$',
    '^du\\s+(-sh|-h)',
    '^lsblk',
  ],
  schema: {
    title: 'Disk Usage',
    description: 'Filesystem utilization and storage analysis',
    icon: 'HardDrive',
    root: {
      layout: 'stack',
      gap: 'md',
      widgets: [
        {
          type: 'badge-grid',
          title: 'Storage Summary',
          badges: [
            { label: 'Total', value: '500 GB', variant: 'default' },
            { label: 'Used', value: '312 GB', variant: 'warning' },
            { label: 'Available', value: '188 GB', variant: 'success' },
            { label: 'Filesystems', value: '4', variant: 'secondary' },
          ],
        },
        {
          type: 'table',
          title: 'Filesystem Details',
          columns: [
            { key: 'filesystem', label: 'Filesystem', type: 'text' },
            { key: 'mountpoint', label: 'Mount', type: 'code' },
            { key: 'type', label: 'Type', type: 'badge', badgeVariant: { ext4: 'default', xfs: 'secondary', tmpfs: 'outline', btrfs: 'default' } },
            { key: 'size', label: 'Size', type: 'text', sortable: true },
            { key: 'used', label: 'Used', type: 'text' },
            { key: 'available', label: 'Available', type: 'text' },
            { key: 'usePercent', label: 'Use%', type: 'percent' },
          ],
          rows: [
            { filesystem: '/dev/sda1', mountpoint: '/', type: 'ext4', size: '50 GB', used: '31 GB', available: '19 GB', usePercent: 62 },
            { filesystem: '/dev/sda2', mountpoint: '/home', type: 'ext4', size: '200 GB', used: '90 GB', available: '110 GB', usePercent: 45 },
            { filesystem: '/dev/sdb1', mountpoint: '/data', type: 'xfs', size: '250 GB', used: '191 GB', available: '59 GB', usePercent: 76 },
            { filesystem: 'tmpfs', mountpoint: '/tmp', type: 'tmpfs', size: '8 GB', used: '245 MB', available: '7.8 GB', usePercent: 3 },
          ],
        },
        {
          type: 'progress-bar',
          title: 'Root (/)',
          value: 62,
          label: '31 GB / 50 GB',
          variant: 'default',
        },
        {
          type: 'progress-bar',
          title: 'Home (/home)',
          value: 45,
          label: '90 GB / 200 GB',
          variant: 'default',
        },
        {
          type: 'progress-bar',
          title: 'Data (/data)',
          value: 76,
          label: '191 GB / 250 GB',
          variant: 'warning',
        },
      ],
    },
  },
};
