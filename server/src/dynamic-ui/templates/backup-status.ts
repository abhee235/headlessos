// EX3-B.3: Backup Status template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const backupStatusTemplate: UITemplate = {
  id: 'backup-status',
  name: 'Backup Status',
  description: 'Backup job status, schedules, and storage usage',
  tags: ['backup', 'rsync', 'cron', 'restic', 'borgbackup', 'snapshot'],
  layoutPattern: 'status-overview',
  matchPatterns: [
    '^restic\\s+snapshots',
    '^borg\\s+list',
    '^rsync.*backup',
    'crontab.*backup',
    'backup.*status',
  ],
  schema: {
    title: 'Backup Status',
    description: 'Backup job inventory and health overview',
    icon: 'Archive',
    sidebarItems: [{ id: 'main', label: 'Backups' }],
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
              { type: 'stat-card', title: 'Backup Jobs', value: '4', icon: 'Archive', trend: 'neutral' },
              { type: 'stat-card', title: 'Last Success', value: '2h ago', icon: 'CheckCircle', trend: 'up' },
              { type: 'stat-card', title: 'Total Size', value: '128', unit: 'GB', icon: 'HardDrive', trend: 'up' },
              { type: 'stat-card', title: 'Failed', value: '0', icon: 'XCircle', trend: 'neutral' },
            ],
          },
          {
            type: 'badge-grid',
            title: 'Job Status Overview',
            badges: [
              { label: 'DB Daily', value: 'OK (2h ago)', variant: 'success' },
              { label: 'Files Weekly', value: 'OK (2d ago)', variant: 'success' },
              { label: 'Config Daily', value: 'OK (6h ago)', variant: 'success' },
              { label: 'Full Monthly', value: 'Scheduled (in 5d)', variant: 'secondary' },
            ],
          },
          {
            type: 'table',
            title: 'Backup Jobs',
            columns: [
              { key: 'name', label: 'Job Name', sortable: true },
              { key: 'type', label: 'Type' },
              { key: 'schedule', label: 'Schedule' },
              { key: 'lastRun', label: 'Last Run', sortable: true },
              { key: 'duration', label: 'Duration' },
              { key: 'size', label: 'Size', sortable: true },
              { key: 'destination', label: 'Destination' },
              { key: 'status', label: 'Status' },
            ],
            rows: [
              { name: 'DB Daily', type: 'pg_dump', schedule: 'Daily 02:00', lastRun: '2h ago', duration: '4m 32s', size: '2.4 GB', destination: 's3://backups/db/', status: 'Success' },
              { name: 'Files Weekly', type: 'restic', schedule: 'Sun 03:00', lastRun: '2d ago', duration: '45m', size: '85 GB', destination: 's3://backups/files/', status: 'Success' },
              { name: 'Config Daily', type: 'rsync', schedule: 'Daily 01:00', lastRun: '6h ago', duration: '12s', size: '24 MB', destination: '/mnt/backup/config/', status: 'Success' },
              { name: 'Full Monthly', type: 'restic', schedule: '1st 04:00', lastRun: '25d ago', duration: '2h 15m', size: '128 GB', destination: 's3://backups/full/', status: 'Success' },
            ],
            filters: {
              search: true,
              dropdowns: [
                { key: 'status', label: 'Status', options: [{ label: 'Success', value: 'Success' }, { label: 'Failed', value: 'Failed' }, { label: 'Running', value: 'Running' }, { label: 'Scheduled', value: 'Scheduled' }] },
                { key: 'type', label: 'Type', options: [{ label: 'pg_dump', value: 'pg_dump' }, { label: 'restic', value: 'restic' }, { label: 'rsync', value: 'rsync' }] },
              ],
            },
          },
        ],
      },
    },
  },
};
