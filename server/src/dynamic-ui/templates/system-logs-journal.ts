// EX3-B.3: System Logs / Journald template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const systemLogsJournalTemplate: UITemplate = {
  id: 'system-logs-journal',
  name: 'System Logs (journalctl)',
  description: 'Systemd journal log viewer with severity filtering',
  tags: ['logs', 'journal', 'journalctl', 'syslog', 'systemd'],
  layoutPattern: 'log-viewer',
  matchPatterns: [
    '^journalctl',
    '^dmesg',
    '^cat\\s+/var/log/syslog',
    '^tail\\s+.*syslog',
    '^tail\\s+.*messages',
  ],
  schema: {
    title: 'System Logs',
    description: 'Systemd journal entries',
    icon: 'ScrollText',
    sidebarItems: [{ id: 'main', label: 'Logs' }],
    sections: {
      main: {
        layout: 'stack',
        gap: 'md',
        children: [
          {
            layout: 'grid',
            autoFit: true,
            minChildWidth: 160,
            children: [
              { type: 'stat-card', title: 'Total Entries', value: '1,247', icon: 'FileText', trend: 'neutral' },
              { type: 'stat-card', title: 'Errors', value: '12', icon: 'AlertCircle', trend: 'down' },
              { type: 'stat-card', title: 'Warnings', value: '34', icon: 'AlertTriangle', trend: 'neutral' },
              { type: 'stat-card', title: 'Boot ID', value: 'Current', icon: 'Power', trend: 'neutral' },
            ],
          },
          {
            type: 'log-viewer',
            title: 'Journal Entries',
            lines: [
              { timestamp: '2024-01-15T10:32:01Z', level: 'error', message: '[kernel] Out of memory: Killed process 1234 (node)' },
              { timestamp: '2024-01-15T10:31:58Z', level: 'warn', message: '[systemd] nginx.service: Main process exited, code=exited, status=1/FAILURE' },
              { timestamp: '2024-01-15T10:31:55Z', level: 'info', message: '[sshd] Accepted publickey for deploy from 10.0.0.5 port 45322' },
              { timestamp: '2024-01-15T10:31:50Z', level: 'info', message: '[systemd] Started Nginx HTTP Server.' },
              { timestamp: '2024-01-15T10:31:45Z', level: 'info', message: '[kernel] docker0: port 1(vethfa92b3) entered forwarding state' },
              { timestamp: '2024-01-15T10:31:40Z', level: 'warn', message: '[docker] Container health check failed for web-app' },
              { timestamp: '2024-01-15T10:31:35Z', level: 'info', message: '[cron] Job backup.sh completed successfully' },
              { timestamp: '2024-01-15T10:31:30Z', level: 'error', message: '[postfix] fatal: no SASL authentication mechanisms' },
            ],
            maxHeight: '500px',
          },
        ],
      },
    },
  },
};
