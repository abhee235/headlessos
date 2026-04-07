// EX1.7: Security Audit template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const securityAuditTemplate: UITemplate = {
  id: 'security-audit',
  name: 'Security Audit',
  description: 'Failed logins, open ports, and security overview',
  tags: ['security', 'audit', 'login', 'firewall', 'fail2ban'],
  matchPatterns: [
    '^last\\s+-f\\s+/var/log/btmp',
    '^lastb',
    'fail2ban-client\\s+status',
    '^grep\\s+.*Failed.*auth\\.log',
    'iptables\\s+-L',
    'ufw\\s+status',
  ],
  schema: {
    title: 'Security Audit',
    description: 'Login attempts, firewall status, and security alerts',
    icon: 'Shield',
    root: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'alert',
          title: 'Security Alert',
          message: '47 failed SSH login attempts detected in the last 24 hours from 12 unique IPs.',
          variant: 'warning',
        },
        {
          type: 'badge-grid',
          title: 'Security Summary',
          badges: [
            { label: 'Failed Logins (24h)', value: '47', variant: 'destructive' },
            { label: 'Banned IPs', value: '8', variant: 'warning' },
            { label: 'Open Ports', value: '5', variant: 'default' },
            { label: 'Firewall', value: 'Active', variant: 'success' },
            { label: 'SSH Root Login', value: 'Disabled', variant: 'success' },
            { label: 'Unattended Upgrades', value: 'Enabled', variant: 'success' },
          ],
        },
        {
          type: 'table',
          title: 'Failed Login Attempts (Top IPs)',
          columns: [
            { key: 'ip', label: 'Source IP', type: 'code', sortable: true },
            { key: 'attempts', label: 'Attempts', type: 'number', sortable: true },
            { key: 'lastAttempt', label: 'Last Attempt', type: 'text' },
            { key: 'user', label: 'Username', type: 'text' },
            {
              key: 'status',
              label: 'Status',
              type: 'badge',
              badgeVariant: { banned: 'destructive', watching: 'warning', cleared: 'success' },
            },
            { key: 'country', label: 'Country', type: 'text' },
          ],
          rows: [
            { ip: '185.220.101.42', attempts: 15, lastAttempt: '10 min ago', user: 'root', status: 'banned', country: 'DE' },
            { ip: '45.33.32.156', attempts: 12, lastAttempt: '25 min ago', user: 'admin', status: 'banned', country: 'US' },
            { ip: '103.21.58.7', attempts: 8, lastAttempt: '1 hour ago', user: 'root', status: 'banned', country: 'CN' },
            { ip: '192.168.1.100', attempts: 5, lastAttempt: '3 hours ago', user: 'deploy', status: 'watching', country: 'Local' },
            { ip: '10.0.2.15', attempts: 3, lastAttempt: '6 hours ago', user: 'test', status: 'cleared', country: 'Local' },
          ],
          footer: 'Showing top 5 source IPs',
        },
        {
          type: 'chart',
          title: 'Failed Logins (Last 7 Days)',
          chartType: 'area',
          height: 200,
          data: [
            { day: 'Mon', attempts: 23 },
            { day: 'Tue', attempts: 45 },
            { day: 'Wed', attempts: 67 },
            { day: 'Thu', attempts: 34 },
            { day: 'Fri', attempts: 12 },
            { day: 'Sat', attempts: 89 },
            { day: 'Sun', attempts: 47 },
          ],
          xKey: 'day',
          yKeys: [{ key: 'attempts', label: 'Failed Attempts' }],
        },
      ],
    },
  },
};
