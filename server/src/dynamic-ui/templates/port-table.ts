// EX1.7: Port Table template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const portTableTemplate: UITemplate = {
  id: 'port-table',
  name: 'Listening Ports',
  description: 'Network ports and active connections overview',
  tags: ['network', 'ports', 'connections', 'security'],
  layoutPattern: 'single-table',
  matchPatterns: [
    'ss\\s+(-tulnp|--listening)',
    'netstat\\s+(-tulnp|--listening)',
    'lsof\\s+-i',
  ],
  schema: {
    title: 'Listening Ports',
    description: 'Active network ports and associated processes',
    icon: 'Network',
    sidebarItems: [{ id: 'main', label: 'Ports' }],
    sections: {
      main: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'badge-grid',
          title: 'Summary',
          badges: [
            { label: 'TCP Listening', value: '12', variant: 'default' },
            { label: 'UDP Listening', value: '3', variant: 'secondary' },
            { label: 'Established', value: '47', variant: 'success' },
            { label: 'Time-Wait', value: '8', variant: 'warning' },
          ],
        },
        {
          type: 'table',
          title: 'Open Ports',
          columns: [
            {
              key: 'protocol',
              label: 'Proto',
              type: 'badge',
              badgeVariant: { tcp: 'default', udp: 'secondary', tcp6: 'default', udp6: 'secondary' },
            },
            { key: 'port', label: 'Port', type: 'number', sortable: true },
            { key: 'address', label: 'Listen Address', type: 'text' },
            { key: 'process', label: 'Process', type: 'text' },
            { key: 'pid', label: 'PID', type: 'number' },
            {
              key: 'state',
              label: 'State',
              type: 'badge',
              badgeVariant: {
                LISTEN: 'success',
                ESTABLISHED: 'default',
                TIME_WAIT: 'warning',
                CLOSE_WAIT: 'destructive',
              },
            },
          ],
          rows: [
            { protocol: 'tcp', port: 22, address: '0.0.0.0', process: 'sshd', pid: 1234, state: 'LISTEN' },
            { protocol: 'tcp', port: 80, address: '0.0.0.0', process: 'nginx', pid: 5678, state: 'LISTEN' },
            { protocol: 'tcp', port: 443, address: '0.0.0.0', process: 'nginx', pid: 5678, state: 'LISTEN' },
            { protocol: 'tcp', port: 3306, address: '127.0.0.1', process: 'mysqld', pid: 9012, state: 'LISTEN' },
            { protocol: 'tcp', port: 5432, address: '127.0.0.1', process: 'postgres', pid: 3456, state: 'LISTEN' },
            { protocol: 'udp', port: 53, address: '0.0.0.0', process: 'systemd-resolve', pid: 789, state: 'LISTEN' },
          ],
          filters: { search: true },
          footer: '6 listening ports',
        },
      ],
      },
    },
  },
};
