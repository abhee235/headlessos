// EX1.7: Service Status template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const serviceStatusTemplate: UITemplate = {
  id: 'service-status',
  name: 'Service Status',
  description: 'Systemd service details and recent logs',
  tags: ['services', 'systemd', 'systemctl', 'daemon'],
  matchPatterns: [
    '^systemctl\\s+status',
    '^systemctl\\s+list-units',
    '^service\\s+.*\\s+status',
  ],
  schema: {
    title: 'Service Status',
    description: 'Systemd service details and journal output',
    icon: 'Settings',
    root: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'key-value',
          title: 'Service Details',
          pairs: [
            { key: 'Service', value: 'nginx.service' },
            { key: 'Description', value: 'A high performance web server' },
            { key: 'Loaded', value: 'loaded (/lib/systemd/system/nginx.service)' },
            { key: 'Active', value: 'active (running) since Mon 2026-03-23' },
            { key: 'Main PID', value: '5678 (nginx)' },
            { key: 'Memory', value: '45.2 MB' },
            { key: 'CPU', value: '1min 23.456s' },
            { key: 'CGroup', value: '/system.slice/nginx.service' },
          ],
          layout: 'grid-2',
        },
        {
          type: 'alert',
          title: 'Status',
          message: 'Service is running normally. No issues detected.',
          variant: 'success',
        },
        {
          type: 'log-viewer',
          title: 'Recent Journal Entries',
          maxHeight: '300px',
          lines: [
            { timestamp: 'Apr 07 10:00:01', level: 'info', message: 'nginx[5678]: signal process started' },
            { timestamp: 'Apr 07 10:00:01', level: 'info', message: 'systemd[1]: Started A high performance web server.' },
            { timestamp: 'Apr 07 09:59:58', level: 'info', message: 'nginx[5672]: Stopping old workers' },
            { timestamp: 'Apr 07 09:59:58', level: 'info', message: 'systemd[1]: Reloading A high performance web server.' },
            { timestamp: 'Apr 07 08:00:00', level: 'info', message: 'logrotate[12345]: rotating /var/log/nginx/access.log' },
          ],
        },
      ],
    },
  },
};
