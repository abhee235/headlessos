// EX1.7: Log Viewer template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const logViewerTemplate: UITemplate = {
  id: 'log-viewer',
  name: 'Log Viewer',
  description: 'Structured log file output with level filtering',
  tags: ['logs', 'monitoring', 'debugging', 'syslog', 'journalctl'],
  matchPatterns: [
    'journalctl',
    'tail\\s+(-f|-n)\\s+.*log',
    'cat\\s+.*\\.log',
    'less\\s+.*\\.log',
    'dmesg',
    'syslog',
  ],
  schema: {
    title: 'Log Viewer',
    description: 'Application and system log output',
    icon: 'ScrollText',
    sidebarItems: [{ id: 'main', label: 'Logs' }],
    sections: {
      main: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'badge-grid',
          title: 'Log Summary',
          badges: [
            { label: 'Total Lines', value: '1,247', variant: 'default' },
            { label: 'Errors', value: '3', variant: 'destructive' },
            { label: 'Warnings', value: '12', variant: 'warning' },
            { label: 'Info', value: '1,232', variant: 'default' },
          ],
        },
        {
          type: 'log-viewer',
          title: 'Recent Entries',
          maxHeight: '500px',
          lines: [
            { timestamp: '2026-04-07 10:23:01', level: 'info', message: 'Server started on port 3001' },
            { timestamp: '2026-04-07 10:23:02', level: 'info', message: 'Database connection established' },
            { timestamp: '2026-04-07 10:23:15', level: 'warn', message: 'Slow query detected (2.3s): SELECT * FROM users JOIN ...' },
            { timestamp: '2026-04-07 10:24:01', level: 'info', message: 'Request GET /api/health - 200 (12ms)' },
            { timestamp: '2026-04-07 10:24:05', level: 'error', message: 'Connection refused to redis://localhost:6379' },
            { timestamp: '2026-04-07 10:24:06', level: 'warn', message: 'Falling back to memory cache' },
            { timestamp: '2026-04-07 10:25:00', level: 'info', message: 'Scheduled task: cleanup old sessions' },
            { timestamp: '2026-04-07 10:25:01', level: 'debug', message: 'Removed 42 expired sessions' },
          ],
        },
      ],
      },
    },
  },
};
