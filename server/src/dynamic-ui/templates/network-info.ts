// EX1.7: Network Info template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const networkInfoTemplate: UITemplate = {
  id: 'network-info',
  name: 'Network Information',
  description: 'IP addresses, routes, DNS, and network interfaces',
  tags: ['network', 'ip', 'dns', 'routes', 'interfaces'],
  layoutPattern: 'tabbed-detail',
  matchPatterns: [
    '^ip\\s+addr',
    '^ip\\s+a$',
    '^ifconfig',
    '^ip\\s+route',
    '^ip\\s+r$',
    '^cat\\s+/etc/resolv\\.conf',
    '^nmcli',
  ],
  schema: {
    title: 'Network Information',
    description: 'Network interfaces, addresses, routes, and DNS',
    icon: 'Globe',
    sidebarItems: [{ id: 'main', label: 'Network' }],
    sections: {
      main: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'key-value',
          title: 'Network Summary',
          pairs: [
            { key: 'Hostname', value: 'server-01.example.com' },
            { key: 'Primary IP', value: '10.0.1.50' },
            { key: 'Public IP', value: '203.0.113.42' },
            { key: 'Default Gateway', value: '10.0.1.1' },
            { key: 'DNS Servers', value: '8.8.8.8, 8.8.4.4' },
            { key: 'Domain', value: 'example.com' },
          ],
          layout: 'grid-2',
        },
        {
          layout: 'tabs',
          tabs: [
            {
              id: 'interfaces',
              label: 'Interfaces',
              icon: 'Network',
              count: 3,
              children: [
                {
                  type: 'table',
                  title: 'Network Interfaces',
                  columns: [
                    { key: 'interface', label: 'Interface', type: 'text', sortable: true },
                    {
                      key: 'state',
                      label: 'State',
                      type: 'badge',
                      badgeVariant: { UP: 'success', DOWN: 'destructive', UNKNOWN: 'warning' },
                    },
                    { key: 'ipv4', label: 'IPv4', type: 'code' },
                    { key: 'ipv6', label: 'IPv6', type: 'code' },
                    { key: 'mac', label: 'MAC', type: 'code' },
                    { key: 'mtu', label: 'MTU', type: 'number' },
                  ],
                  rows: [
                    { interface: 'eth0', state: 'UP', ipv4: '10.0.1.50/24', ipv6: 'fe80::1/64', mac: '02:42:ac:11:00:02', mtu: 1500 },
                    { interface: 'lo', state: 'UNKNOWN', ipv4: '127.0.0.1/8', ipv6: '::1/128', mac: '00:00:00:00:00:00', mtu: 65536 },
                    { interface: 'docker0', state: 'UP', ipv4: '172.17.0.1/16', ipv6: '', mac: '02:42:d8:f0:a1:b3', mtu: 1500 },
                  ],
                  filters: { search: true },
                },
              ],
            },
            {
              id: 'routes',
              label: 'Routes',
              icon: 'Route',
              count: 3,
              children: [
                {
                  type: 'table',
                  title: 'Routes',
                  columns: [
                    { key: 'destination', label: 'Destination', type: 'text' },
                    { key: 'gateway', label: 'Gateway', type: 'text' },
                    { key: 'interface', label: 'Interface', type: 'text' },
                    { key: 'metric', label: 'Metric', type: 'number' },
                  ],
                  rows: [
                    { destination: 'default', gateway: '10.0.1.1', interface: 'eth0', metric: 100 },
                    { destination: '10.0.1.0/24', gateway: '0.0.0.0', interface: 'eth0', metric: 100 },
                    { destination: '172.17.0.0/16', gateway: '0.0.0.0', interface: 'docker0', metric: 0 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      },
    },
  },
};
