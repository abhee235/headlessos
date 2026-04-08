// EX1.7: Cron Schedule template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const cronScheduleTemplate: UITemplate = {
  id: 'cron-schedule',
  name: 'Cron Schedule',
  description: 'Scheduled cron jobs and their configuration',
  tags: ['cron', 'schedule', 'jobs', 'automation', 'timer'],
  matchPatterns: [
    '^crontab\\s+-l',
    '^cat\\s+/etc/crontab',
    '^systemctl\\s+list-timers',
    'ls\\s+/etc/cron\\.',
  ],
  schema: {
    title: 'Scheduled Jobs',
    description: 'Cron jobs and systemd timers',
    icon: 'Clock',
    sidebarItems: [{ id: 'main', label: 'Schedule' }],
    sections: {
      main: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'stat-card',
          title: 'Active Jobs',
          value: '8',
          description: '3 cron, 5 systemd timers',
        },
        {
          type: 'table',
          title: 'Cron Jobs',
          columns: [
            { key: 'schedule', label: 'Schedule', type: 'code' },
            { key: 'readable', label: 'When', type: 'text' },
            { key: 'user', label: 'User', type: 'text' },
            { key: 'command', label: 'Command', type: 'code' },
            {
              key: 'status',
              label: 'Status',
              type: 'badge',
              badgeVariant: { active: 'success', disabled: 'secondary', error: 'destructive' },
            },
          ],
          rows: [
            { schedule: '0 2 * * *', readable: 'Daily at 2:00 AM', user: 'root', command: '/usr/local/bin/backup.sh', status: 'active' },
            { schedule: '*/5 * * * *', readable: 'Every 5 minutes', user: 'root', command: '/opt/monitor/check-health.sh', status: 'active' },
            { schedule: '0 0 * * 0', readable: 'Sunday midnight', user: 'root', command: 'certbot renew --quiet', status: 'active' },
            { schedule: '30 3 * * *', readable: 'Daily at 3:30 AM', user: 'postgres', command: 'pg_dump -U app mydb | gzip > /backups/db.gz', status: 'active' },
            { schedule: '0 */6 * * *', readable: 'Every 6 hours', user: 'root', command: 'apt-get update -qq', status: 'active' },
            { schedule: '0 4 1 * *', readable: '1st of month, 4 AM', user: 'root', command: '/usr/local/bin/rotate-logs.sh', status: 'active' },
          ],
          footer: '6 active cron jobs',
        },
        {
          type: 'table',
          title: 'Systemd Timers',
          columns: [
            { key: 'timer', label: 'Timer', type: 'text', sortable: true },
            { key: 'nextRun', label: 'Next Run', type: 'text' },
            { key: 'lastRun', label: 'Last Run', type: 'text' },
            { key: 'unit', label: 'Service Unit', type: 'code' },
          ],
          rows: [
            { timer: 'apt-daily', nextRun: 'Tomorrow 06:14', lastRun: 'Today 06:14', unit: 'apt-daily.service' },
            { timer: 'logrotate', nextRun: 'Tomorrow 00:00', lastRun: 'Today 00:00', unit: 'logrotate.service' },
          ],
        },
      ],
      },
    },
  },
};
