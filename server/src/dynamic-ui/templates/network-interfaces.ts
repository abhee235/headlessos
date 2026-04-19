// EX3-B.3: Network Interfaces template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const networkInterfacesTemplate: UITemplate = {
  id: 'network-interfaces',
  name: 'Network Interfaces',
  description: 'Network interface configuration, stats, and routes per interface',
  tags: ['network', 'interfaces', 'ip', 'routing', 'ethernet'],
  layoutPattern: 'tabbed-detail',
  matchPatterns: [
    '^ip\\s+link',
    '^ifconfig$',
    '^ifconfig\\s+-a',
    '^nmcli\\s+device',
    '^ip\\s+-s\\s+link',
  ],
  schema: {
    title: 'Network Interfaces',
    description: 'Interface configuration and traffic statistics',
    icon: 'Network',
    sidebarItems: [{ id: 'main', label: 'Interfaces' }],
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
              { type: 'stat-card', title: 'Interfaces', value: '4', icon: 'Network', trend: 'neutral' },
              { type: 'stat-card', title: 'Active', value: '3', icon: 'Wifi', trend: 'neutral' },
              { type: 'stat-card', title: 'Total RX', value: '45.2', unit: 'GB', icon: 'ArrowDown', trend: 'up' },
              { type: 'stat-card', title: 'Total TX', value: '12.8', unit: 'GB', icon: 'ArrowUp', trend: 'up' },
            ],
          },
          {
            layout: 'tabs',
            tabs: [
              {
                id: 'eth0',
                label: 'eth0',
                icon: 'Cable',
                children: [
                  {
                    type: 'key-value',
                    title: 'eth0 Configuration',
                    pairs: [
                      { key: 'State', value: 'UP' },
                      { key: 'IPv4', value: '192.168.1.100/24', copyable: true },
                      { key: 'IPv6', value: 'fe80::1/64', copyable: true },
                      { key: 'MAC', value: '00:1a:2b:3c:4d:5e', copyable: true },
                      { key: 'MTU', value: '1500' },
                      { key: 'Speed', value: '1000 Mbps' },
                      { key: 'RX Bytes', value: '42.1 GB' },
                      { key: 'TX Bytes', value: '11.3 GB' },
                      { key: 'RX Errors', value: '0' },
                      { key: 'TX Errors', value: '0' },
                    ],
                    layout: 'grid-3',
                  },
                ],
              },
              {
                id: 'lo',
                label: 'lo',
                icon: 'RotateCcw',
                children: [
                  {
                    type: 'key-value',
                    title: 'Loopback',
                    pairs: [
                      { key: 'State', value: 'UP' },
                      { key: 'IPv4', value: '127.0.0.1/8' },
                      { key: 'MTU', value: '65536' },
                    ],
                    layout: 'grid-3',
                  },
                ],
              },
              {
                id: 'docker0',
                label: 'docker0',
                icon: 'Container',
                children: [
                  {
                    type: 'key-value',
                    title: 'Docker Bridge',
                    pairs: [
                      { key: 'State', value: 'UP' },
                      { key: 'IPv4', value: '172.17.0.1/16' },
                      { key: 'MAC', value: '02:42:ac:11:00:01' },
                      { key: 'MTU', value: '1500' },
                      { key: 'RX Bytes', value: '3.1 GB' },
                      { key: 'TX Bytes', value: '1.5 GB' },
                    ],
                    layout: 'grid-3',
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
