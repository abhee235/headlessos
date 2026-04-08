// EX1.7: User List template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const userListTemplate: UITemplate = {
  id: 'user-list',
  name: 'User List',
  description: 'System users, active sessions, and login history',
  tags: ['users', 'accounts', 'sessions', 'security', 'login'],
  matchPatterns: [
    '^who$',
    '^w$',
    '^last\\b',
    '^cat\\s+/etc/passwd',
    '^getent\\s+passwd',
    '^users$',
  ],
  schema: {
    title: 'System Users',
    description: 'User accounts and current sessions',
    icon: 'Users',
    sidebarItems: [{ id: 'main', label: 'Users' }],
    sections: {
      main: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'badge-grid',
          title: 'Summary',
          badges: [
            { label: 'Total Users', value: '24', variant: 'default' },
            { label: 'Active Sessions', value: '3', variant: 'success' },
            { label: 'Sudo Users', value: '2', variant: 'warning' },
            { label: 'System Accounts', value: '18', variant: 'secondary' },
          ],
        },
        {
          type: 'table',
          title: 'Active Sessions',
          columns: [
            { key: 'user', label: 'User', type: 'text', sortable: true },
            { key: 'tty', label: 'TTY', type: 'code' },
            { key: 'from', label: 'From', type: 'text' },
            { key: 'loginTime', label: 'Login Time', type: 'text' },
            { key: 'idle', label: 'Idle', type: 'text' },
          ],
          rows: [
            { user: 'root', tty: 'pts/0', from: '10.0.1.5', loginTime: '10:15', idle: '0:00' },
            { user: 'deploy', tty: 'pts/1', from: '10.0.1.12', loginTime: '09:30', idle: '0:45' },
            { user: 'admin', tty: 'pts/2', from: '10.0.1.1', loginTime: '08:00', idle: '2:15' },
          ],
        },
        {
          type: 'table',
          title: 'User Accounts',
          columns: [
            { key: 'username', label: 'Username', type: 'text', sortable: true },
            { key: 'uid', label: 'UID', type: 'number' },
            { key: 'gid', label: 'GID', type: 'number' },
            { key: 'shell', label: 'Shell', type: 'code' },
            { key: 'home', label: 'Home', type: 'text' },
            {
              key: 'type',
              label: 'Type',
              type: 'badge',
              badgeVariant: { human: 'default', system: 'secondary', service: 'outline' },
            },
          ],
          rows: [
            { username: 'root', uid: 0, gid: 0, shell: '/bin/bash', home: '/root', type: 'human' },
            { username: 'deploy', uid: 1001, gid: 1001, shell: '/bin/bash', home: '/home/deploy', type: 'human' },
            { username: 'www-data', uid: 33, gid: 33, shell: '/usr/sbin/nologin', home: '/var/www', type: 'service' },
            { username: 'nobody', uid: 65534, gid: 65534, shell: '/usr/sbin/nologin', home: '/nonexistent', type: 'system' },
          ],
          footer: 'Showing 4 of 24 users',
        },
      ],
      },
    },
  },
};
