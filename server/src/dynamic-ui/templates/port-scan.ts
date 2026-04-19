// EX3-B.3: Port Scan template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const portScanTemplate: UITemplate = {
  id: 'port-scan',
  name: 'Port Scan / Listening Ports',
  description: 'Open ports, listening services, and network connections',
  tags: ['ports', 'nmap', 'ss', 'netstat', 'listening', 'connections', 'firewall'],
  layoutPattern: 'single-table',
  matchPatterns: [
    '^ss\\s+-tulnp',
    '^ss\\s+-tlnp',
    '^netstat\\s+-tulnp',
    '^nmap\\s+',
    '^ss\\s+-a',
    '^netstat\\s+-an',
  ],
  schema: {
    title: 'Listening Ports & Connections',
    description: 'Open ports and active network connections',
    icon: 'Radio',
    sidebarItems: [{ id: 'main', label: 'Ports' }],
    sections: {
      main: {
        layout: 'stack',
        gap: 'md',
        children: [
          {
            layout: 'grid',
            autoFit: true,
            minChildWidth: 170,
            children: [
              { type: 'stat-card', title: 'Listening', value: '14', icon: 'Radio', trend: 'neutral' },
              { type: 'stat-card', title: 'Established', value: '42', icon: 'Link', trend: 'up' },
              { type: 'stat-card', title: 'TCP Ports', value: '12', icon: 'Cable', trend: 'neutral' },
              { type: 'stat-card', title: 'UDP Ports', value: '2', icon: 'Wifi', trend: 'neutral' },
            ],
          },
          {
            type: 'table',
            title: 'Listening Ports',
            columns: [
              { key: 'protocol', label: 'Proto', sortable: true },
              { key: 'port', label: 'Port', sortable: true },
              { key: 'address', label: 'Listen Address' },
              { key: 'process', label: 'Process', sortable: true },
              { key: 'pid', label: 'PID', sortable: true },
              { key: 'state', label: 'State' },
            ],
            rows: [
              { protocol: 'tcp', port: '22', address: '0.0.0.0', process: 'sshd', pid: '1024', state: 'LISTEN' },
              { protocol: 'tcp', port: '80', address: '0.0.0.0', process: 'nginx', pid: '2048', state: 'LISTEN' },
              { protocol: 'tcp', port: '443', address: '0.0.0.0', process: 'nginx', pid: '2048', state: 'LISTEN' },
              { protocol: 'tcp', port: '3000', address: '127.0.0.1', process: 'node', pid: '3456', state: 'LISTEN' },
              { protocol: 'tcp', port: '5432', address: '127.0.0.1', process: 'postgres', pid: '1567', state: 'LISTEN' },
              { protocol: 'tcp', port: '6379', address: '127.0.0.1', process: 'redis-server', pid: '1789', state: 'LISTEN' },
              { protocol: 'tcp', port: '8080', address: '0.0.0.0', process: 'java', pid: '4567', state: 'LISTEN' },
              { protocol: 'tcp', port: '9090', address: '0.0.0.0', process: 'prometheus', pid: '5678', state: 'LISTEN' },
              { protocol: 'tcp', port: '3306', address: '127.0.0.1', process: 'mysqld', pid: '1890', state: 'LISTEN' },
              { protocol: 'tcp', port: '27017', address: '127.0.0.1', process: 'mongod', pid: '2345', state: 'LISTEN' },
              { protocol: 'tcp', port: '2377', address: '0.0.0.0', process: 'dockerd', pid: '1234', state: 'LISTEN' },
              { protocol: 'tcp', port: '9100', address: '0.0.0.0', process: 'node_exporter', pid: '6789', state: 'LISTEN' },
              { protocol: 'udp', port: '53', address: '127.0.0.53', process: 'systemd-resolve', pid: '567', state: 'UNCONN' },
              { protocol: 'udp', port: '68', address: '0.0.0.0', process: 'dhclient', pid: '890', state: 'UNCONN' },
            ],
            filters: {
              search: true,
              dropdowns: [
                { key: 'protocol', label: 'Protocol', options: [
                  { label: 'tcp', value: 'tcp' },
                  { label: 'udp', value: 'udp' },
                ]},
                { key: 'state', label: 'State', options: [
                  { label: 'LISTEN', value: 'LISTEN' },
                  { label: 'UNCONN', value: 'UNCONN' },
                ]},
              ],
            },
          },
        ],
      },
    },
  },
};
