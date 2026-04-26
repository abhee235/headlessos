// EX1.4: Playground example views — pre-loaded JSON examples
// @see docs/phases/phase-ex1.md

import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

interface PlaygroundExample {
  id: string;
  name: string;
  data: DynamicView;
}

export const EXAMPLE_VIEWS: PlaygroundExample[] = [
  {
    id: 'system-overview',
    name: 'System Overview',
    data: {
      title: 'System Overview',
      description: 'Server health metrics at a glance',
      icon: 'Activity',
      sidebarItems: [{ id: 'main', label: 'System', icon: 'Activity' }],
      sections: {
        main: {
          layout: 'stack',
          gap: 'md',
          children: [
            {
              type: 'alert',
              message: 'All systems operational',
              variant: 'success',
            },
            {
              type: 'key-value',
              title: 'Server Info',
              pairs: [
                { key: 'Hostname', value: 'web-prod-01', copyable: false },
                { key: 'OS', value: 'Ubuntu 22.04 LTS', copyable: false },
                { key: 'Kernel', value: '5.15.0-91-generic', copyable: false },
                { key: 'Uptime', value: '42 days, 3 hours', copyable: false },
              ],
              layout: 'grid-2',
            },
            {
              type: 'progress-bar',
              title: 'CPU Usage',
              value: 45,
              label: '4 cores',
              variant: 'default',
            },
            {
              type: 'progress-bar',
              title: 'Memory',
              value: 78,
              label: '6.2 GB / 8 GB',
              variant: 'warning',
            },
            {
              type: 'progress-bar',
              title: 'Disk',
              value: 64,
              label: '320 GB / 500 GB',
              variant: 'default',
            },
          ],
        },
      },
      meta: {
        command: 'uname -a && free -h && df -h',
        generatedAt: new Date().toISOString(),
      },
    },
  },
  {
    id: 'docker-containers',
    name: 'Docker Containers',
    data: {
      title: 'Docker Containers',
      description: 'Running containers on this host',
      icon: 'Box',
      sidebarItems: [{ id: 'main', label: 'Docker', icon: 'Box' }],
      sections: {
        main: {
          layout: 'stack',
          gap: 'md',
          children: [
          {
            type: 'badge-grid',
            title: 'Container Status',
            badges: [
              { label: 'Running', value: '5', variant: 'success' },
              { label: 'Stopped', value: '2', variant: 'destructive' },
              { label: 'Paused', value: '0', variant: 'secondary' },
            ],
          },
          {
            type: 'table',
            title: 'Containers',
            columns: [
              { key: 'name', label: 'Name', type: 'text', sortable: false },
              { key: 'image', label: 'Image', type: 'code', sortable: false },
              {
                key: 'status', label: 'Status', type: 'badge', sortable: false,
                badgeVariant: { running: 'success', stopped: 'destructive', paused: 'warning' },
              },
              { key: 'ports', label: 'Ports', type: 'text', sortable: false },
              { key: 'cpu', label: 'CPU', type: 'percent', sortable: false },
            ],
            rows: [
              { name: 'nginx-proxy', image: 'nginx:latest', status: 'running', ports: '80, 443', cpu: 2.3 },
              { name: 'postgres-db', image: 'postgres:15', status: 'running', ports: '5432', cpu: 8.1 },
              { name: 'redis-cache', image: 'redis:7', status: 'running', ports: '6379', cpu: 0.4 },
              { name: 'app-worker', image: 'myapp:v2.1', status: 'running', ports: '3000', cpu: 15.2 },
              { name: 'monitoring', image: 'grafana:latest', status: 'running', ports: '3100', cpu: 3.7 },
              { name: 'old-api', image: 'myapp:v1.9', status: 'stopped', ports: '-', cpu: 0 },
              { name: 'test-db', image: 'postgres:14', status: 'stopped', ports: '-', cpu: 0 },
            ],
            footer: '7 containers total',
          },
        ],
        },
      },
      meta: {
        command: 'docker ps -a --format json',
        generatedAt: new Date().toISOString(),
      },
    },
  },
  {
    id: 'metrics-grid',
    name: 'Metrics Grid',
    data: {
      title: 'Performance Metrics',
      icon: 'BarChart3',
      sidebarItems: [{ id: 'main', label: 'Metrics', icon: 'BarChart3' }],
      sections: {
        main: {
          layout: 'grid',
          columns: 3,
          autoFit: null,
          minChildWidth: null,
          children: [
            { type: 'stat-card', title: 'CPU', value: '45', unit: '%', trend: 'up', description: '+3% from last hour' },
            { type: 'stat-card', title: 'Memory', value: '6.2', unit: 'GB', trend: 'neutral' },
            { type: 'stat-card', title: 'Disk I/O', value: '124', unit: 'MB/s', trend: 'down', description: '-15% from peak' },
            { type: 'stat-card', title: 'Network In', value: '2.4', unit: 'Gbps', trend: 'up' },
            { type: 'stat-card', title: 'Network Out', value: '1.8', unit: 'Gbps', trend: 'neutral' },
            { type: 'stat-card', title: 'Uptime', value: '99.97', unit: '%' },
          ],
        },
      },
    },
  },
  {
    id: 'nginx-config',
    name: 'Nginx Config',
    data: {
      title: 'Nginx Configuration',
      description: 'Active virtual hosts',
      icon: 'Globe',
      sidebarItems: [{ id: 'main', label: 'Nginx', icon: 'Globe' }],
      sections: {
        main: {
          layout: 'stack',
          gap: 'md',
          children: [
          {
            type: 'code-block',
            title: 'Default Server Block',
            code: `server {
    listen 80;
    server_name example.com www.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /static/ {
        alias /var/www/static/;
        expires 30d;
    }
}`,
            language: 'nginx',
            maxHeight: '300px',
          },
          {
            type: 'alert',
            title: 'SSL Certificate',
            message: 'Certificate expires in 23 days. Consider renewing with certbot.',
            variant: 'warning',
          },
        ],
        },
      },
      meta: {
        command: 'cat /etc/nginx/sites-enabled/default',
        generatedAt: new Date().toISOString(),
      },
    },
  },
  // ── EX3-P.7: NetworkSection replica — exercises all new widget primitives ──
  {
    id: 'network-section',
    name: 'Network Section',
    data: {
      title: 'Network',
      description: 'Listening ports, connections, interfaces, routes, and DNS',
      icon: 'Network',
      sidebarItems: [{ id: 'main', label: 'Network', icon: 'Network' }],
      sections: {
        main: {
          layout: 'tabs',
        tabs: [
          // ── Tab 1: Listening Ports ──────────────────────────────
          {
            id: 'ports',
            label: 'Listening Ports',
            icon: 'Radio',
            count: 6,
            children: [
              {
                type: 'table',
                filters: {
                  search: true,
                  searchPlaceholder: 'Search...',
                  dropdowns: [
                    {
                      key: '_filter',
                      label: 'Filters',
                      icon: 'SlidersHorizontal',
                      options: [
                        { label: 'Show All', value: '' },
                        { label: 'Public Only', value: 'public' },
                        { label: 'Private Only', value: 'private' },
                      ],
                    },
                    {
                      key: 'protocol',
                      label: 'All Protocols',
                      options: [
                        { label: 'All Protocols', value: '' },
                        { label: 'TCP', value: 'tcp' },
                        { label: 'UDP', value: 'udp' },
                        { label: 'TCP6', value: 'tcp6' },
                      ],
                    },
                    {
                      key: '_portRange',
                      label: 'All Ports',
                      options: [
                        { label: 'All Ports', value: '' },
                        { label: 'Common Ports', value: 'common' },
                        { label: 'High Ports', value: 'high' },
                      ],
                    },
                    {
                      key: '_status',
                      label: 'All Status',
                      options: [
                        { label: 'All Status', value: '' },
                        { label: 'Running', value: 'running' },
                        { label: 'Listening', value: 'listening' },
                      ],
                    },
                  ],
                },
                columns: [
                  {
                    key: 'protocol',
                    label: 'Proto',
                    type: 'badge',
                    sortable: false, width: '80px',
                    badgeVariant: {
                      tcp: 'secondary', udp: 'secondary',
                      tcp6: 'secondary', udp6: 'secondary',
                    },
                  },
                  { key: 'localAddress', label: 'Address', type: 'mono', sortable: false },
                  {
                    key: 'localPort',
                    label: 'Port',
                    type: 'rich',
                    sortable: false, width: '100px',
                    segments: [
                      { segment: 'dot', key: 'isPublic', color: 'amber' },
                      { segment: 'text', key: 'localPort', className: 'font-mono text-sm font-bold tabular-nums' },
                    ],
                  },
                  {
                    key: 'process',
                    label: 'Process',
                    type: 'rich',
                    sortable: false,
                    segments: [
                      { segment: 'icon', icon: 'Lock', key: 'isSecure', className: 'text-foreground/30' },
                      {
                        segment: 'badge', key: 'process',
                        variant: 'secondary',
                      },
                      {
                        segment: 'badge', key: 'processTag',
                        badgeVariant: {
                          Running: 'success',
                          DNS: 'secondary',
                        },
                      },
                      {
                        segment: 'badge', key: 'publicLabel',
                        variant: 'warning',
                      },
                    ],
                  },
                ],
                rows: [
                  { protocol: 'tcp', localAddress: '0.0.0.0', localPort: 22, process: 'sshd', pid: 1234, isPublic: true, isSecure: true, processTag: 'Running', publicLabel: 'PUBLIC' },
                  { protocol: 'tcp', localAddress: '0.0.0.0', localPort: 80, process: 'nginx', pid: 5678, isPublic: true, isSecure: false, processTag: 'Running', publicLabel: 'PUBLIC' },
                  { protocol: 'tcp', localAddress: '0.0.0.0', localPort: 443, process: 'nginx', pid: 5678, isPublic: true, isSecure: true, processTag: 'Running', publicLabel: 'PUBLIC' },
                  { protocol: 'tcp', localAddress: '127.0.0.1', localPort: 5432, process: 'postgres', pid: 9012, isPublic: false, isSecure: false, processTag: 'Running', publicLabel: '' },
                  { protocol: 'udp', localAddress: '0.0.0.0', localPort: 53, process: 'systemd-resolve', pid: 345, isPublic: false, isSecure: false, processTag: 'DNS', publicLabel: '' },
                  { protocol: 'tcp6', localAddress: '::', localPort: 3000, process: 'node', pid: 6789, isPublic: true, isSecure: false, processTag: 'Running', publicLabel: 'PUBLIC' },
                ],
                actions: [
                  { id: 'inspect', label: 'Inspect', icon: 'Eye', command: 'ss -tlnp | grep {localPort}' },
                  { id: 'kill', label: 'Kill Process', icon: 'Target', command: 'kill {pid}', confirm: true, confirmMessage: 'Kill process {process} (PID {pid})?', variant: 'destructive' },
                  { id: 'block', label: 'Block IP', icon: 'Ban', command: 'iptables -A INPUT -p {protocol} --dport {localPort} -j DROP', confirm: true },
                  { id: 'logs', label: 'View Logs', icon: 'FileText', command: 'journalctl -u {process} --no-pager -n 50' },
                ],
                actionStyle: 'dropdown',
              },
            ],
          },
          // ── Tab 2: Connections ──────────────────────────────────
          {
            id: 'connections',
            label: 'Connections',
            icon: 'Activity',
            count: 8,
            children: [
              {
                type: 'table',
                columns: [
                  {
                    key: 'protocol', label: 'Proto', type: 'badge', sortable: false, width: '80px',
                    badgeVariant: { tcp: 'secondary', udp: 'secondary', tcp6: 'secondary' },
                  },
                  { key: 'local', label: 'Local', type: 'mono', sortable: false },
                  { key: 'remote', label: 'Remote', type: 'mono', sortable: false },
                  {
                    key: 'state', label: 'State', type: 'badge', sortable: false, width: '140px',
                    badgeVariant: {
                      ESTABLISHED: 'success',
                      LISTEN: 'secondary',
                      TIME_WAIT: 'warning',
                      CLOSE_WAIT: 'warning',
                      CLOSED: 'outline',
                    },
                  },
                  { key: 'process', label: 'Process', type: 'text', sortable: false },
                ],
                rows: [
                  { protocol: 'tcp', local: '10.0.0.5:22', remote: '192.168.1.100:52341', state: 'ESTABLISHED', process: 'sshd' },
                  { protocol: 'tcp', local: '10.0.0.5:443', remote: '203.0.113.42:48923', state: 'ESTABLISHED', process: 'nginx' },
                  { protocol: 'tcp', local: '10.0.0.5:443', remote: '198.51.100.7:33021', state: 'ESTABLISHED', process: 'nginx' },
                  { protocol: 'tcp', local: '10.0.0.5:5432', remote: '10.0.0.5:41234', state: 'ESTABLISHED', process: 'postgres' },
                  { protocol: 'tcp', local: '10.0.0.5:80', remote: '203.0.113.99:51022', state: 'TIME_WAIT', process: '' },
                  { protocol: 'tcp', local: '10.0.0.5:3000', remote: '192.168.1.50:60123', state: 'ESTABLISHED', process: 'node' },
                  { protocol: 'tcp', local: '10.0.0.5:22', remote: '10.10.0.3:44891', state: 'ESTABLISHED', process: 'sshd' },
                  { protocol: 'tcp', local: '10.0.0.5:80', remote: '198.51.100.20:38477', state: 'CLOSE_WAIT', process: 'nginx' },
                ],
                footer: '8 active connections',
              },
            ],
          },
          // ── Tab 3: Interfaces (card-list) ──────────────────────
          {
            id: 'interfaces',
            label: 'Interfaces',
            icon: 'Cable',
            count: 4,
            children: [
              {
                type: 'card-list',
                items: [
                  {
                    icon: 'Cable',
                    title: 'eth0',
                    badge: { label: 'UP', variant: 'success', dot: true },
                    details: [
                      { label: 'MAC', value: '02:42:ac:11:00:02' },
                      { label: 'MTU', value: '1500' },
                      { label: 'Type', value: 'ether' },
                    ],
                  },
                  {
                    icon: 'RotateCcw',
                    title: 'lo',
                    badge: { label: 'UP', variant: 'success', dot: true },
                    details: [
                      { label: 'MAC', value: '00:00:00:00:00:00' },
                      { label: 'MTU', value: '65536' },
                      { label: 'Type', value: 'loopback' },
                    ],
                  },
                  {
                    icon: 'Container',
                    title: 'docker0',
                    badge: { label: 'UP', variant: 'success', dot: true },
                    details: [
                      { label: 'MAC', value: '02:42:d8:a1:3e:f0' },
                      { label: 'MTU', value: '1500' },
                      { label: 'Type', value: 'ether' },
                    ],
                  },
                  {
                    icon: 'Wifi',
                    title: 'wlan0',
                    badge: { label: 'DOWN', variant: 'outline', dot: true },
                    details: [
                      { label: 'MAC', value: '08:00:27:e5:a3:7f' },
                      { label: 'MTU', value: '1500' },
                      { label: 'Type', value: 'wifi' },
                    ],
                  },
                ],
              },
            ],
          },
          // ── Tab 4: Routes ──────────────────────────────────────
          {
            id: 'routes',
            label: 'Routes',
            icon: 'Route',
            children: [
              {
                type: 'table',
                columns: [
                  { key: 'destination', label: 'Destination', type: 'mono', sortable: false },
                  { key: 'gateway', label: 'Gateway', type: 'mono', sortable: false },
                  { key: 'interface', label: 'Interface', type: 'badge', sortable: false, badgeVariant: {} },
                  { key: 'metric', label: 'Metric', type: 'text', sortable: false, width: '100px' },
                ],
                rows: [
                  { destination: 'default', gateway: '10.0.0.1', interface: 'eth0', metric: 100 },
                  { destination: '10.0.0.0/24', gateway: '—', interface: 'eth0', metric: 0 },
                  { destination: '172.17.0.0/16', gateway: '—', interface: 'docker0', metric: 0 },
                  { destination: '169.254.0.0/16', gateway: '—', interface: 'eth0', metric: 1000 },
                ],
              },
            ],
          },
          // ── Tab 5: DNS (badge-grid / key-value) ────────────────
          {
            id: 'dns',
            label: 'DNS',
            icon: 'Dns',
            children: [
              {
                type: 'key-value',
                title: 'Nameservers',
                pairs: [
                  { key: 'Primary', value: '8.8.8.8', icon: 'Server', copyable: true },
                  { key: 'Secondary', value: '1.1.1.1', icon: 'Server', copyable: true },
                  { key: 'Tertiary', value: '8.8.4.4', icon: 'Server', copyable: true },
                ],
                layout: 'grid-3',
              },
              {
                type: 'key-value',
                title: 'Search Domains',
                pairs: [
                  { key: 'Domain 1', value: 'example.com', icon: 'Globe', copyable: true },
                  { key: 'Domain 2', value: 'internal.lan', icon: 'Globe', copyable: true },
                ],
                layout: 'grid-2',
              },
            ],
          },
        ],
        },
      },
      meta: {
        command: 'ss -tlnp && ss -tnp && ip addr && ip route && cat /etc/resolv.conf',
        generatedAt: new Date().toISOString(),
      },
    },
  },
  {
    id: 'minimal',
    name: 'Minimal (Empty)',
    data: {
      title: 'Empty View',
      sidebarItems: [{ id: 'main', label: 'Empty View' }],
      sections: {
        main: {
          layout: 'stack',
          gap: 'md',
          children: [],
        },
      },
    },
  },
  // ── EX3-P.8: Packages replica — exercises nested layouts + emptyState ──
  {
    id: 'packages',
    name: 'Packages',
    data: {
      title: 'Packages',
      description: 'System package management',
      icon: 'Package',
      sidebarItems: [{ id: 'main', label: 'Packages', icon: 'Package' }],
      sections: {
        main: {
          layout: 'stack',
          gap: 'md',
          children: [
          // ── Row of stat cards (nested grid inside stack) ──
          {
            layout: 'grid',
            columns: 2,
            children: [
              {
                type: 'stat-card',
                title: 'Installed',
                value: '530',
                icon: 'Package',
              },
              {
                type: 'stat-card',
                title: 'Upgradable',
                value: '0',
                icon: 'ArrowUpCircle',
              },
            ],
          },
          // ── Tabs below the stat cards ──
          {
            layout: 'tabs',
            tabs: [
              {
                id: 'upgradable',
                label: 'Upgradable',
                count: 0,
                children: [
                  {
                    type: 'table',
                    columns: [
                      { key: 'name', label: 'Package', type: 'text', sortable: true },
                      { key: 'current', label: 'Current', type: 'mono', sortable: false },
                      { key: 'available', label: 'Available', type: 'mono', sortable: false },
                      { key: 'source', label: 'Source', type: 'text', sortable: false },
                    ],
                    rows: [],
                    emptyState: {
                      icon: 'PackageCheck',
                      title: 'All packages are up to date',
                      message: 'No upgradable packages found on this system.',
                    },
                    actions: [
                      { id: 'upgrade', label: 'Upgrade', command: 'sudo apt upgrade -y {name}', confirm: true, confirmMessage: 'Upgrade {name}?', icon: 'ArrowUpCircle' },
                    ],
                  },
                ],
              },
              {
                id: 'search',
                label: 'Search & Install',
                children: [
                  {
                    type: 'table',
                    filters: {
                      search: true,
                      searchPlaceholder: 'Search packages...',
                    },
                    columns: [
                      { key: 'name', label: 'Package', type: 'text', sortable: true },
                      { key: 'version', label: 'Version', type: 'mono', sortable: false },
                      { key: 'description', label: 'Description', type: 'text', sortable: false },
                      {
                        key: 'status', label: 'Status', type: 'badge', sortable: false,
                        badgeVariant: { installed: 'success', available: 'secondary' },
                      },
                    ],
                    rows: [],
                    emptyState: {
                      icon: 'Search',
                      title: 'Search for packages',
                      message: 'Type a package name above to search the repository.',
                    },
                    actions: [
                      { id: 'install', label: 'Install', command: 'sudo apt install -y {name}', confirm: true, confirmMessage: 'Install {name}?', icon: 'Download' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        },
      },
      meta: {
        command: 'dpkg --list | wc -l && apt list --upgradable 2>/dev/null',
        generatedAt: new Date().toISOString(),
      },
    },
  },
  // ── Server Admin — multi-section with nested tabs ──
  {
    id: 'server-admin',
    name: 'Server Admin',
    data: {
      title: 'Server Admin',
      description: 'Server configuration and management',
      icon: 'Shield',
      sidebarItems: [
        { id: 'network', label: 'Network', icon: 'Network' },
        { id: 'firewall', label: 'Firewall', icon: 'ShieldAlert' },
        { id: 'security', label: 'Security', icon: 'Lock' },
        { id: 'webserver', label: 'Web Server', icon: 'Globe' },
        { id: 'packages', label: 'Packages', icon: 'Package' },
        { id: 'cron', label: 'Cron Jobs', icon: 'Clock' },
        { id: 'logs', label: 'Logs', icon: 'ScrollText' },
        { id: 'storage', label: 'Storage', icon: 'HardDrive' },
      ],
      sections: {
        network: {
          layout: 'stack',
          gap: 'md',
          children: [
            {
              type: 'key-value',
              title: 'Network Configuration',
              pairs: [
                { key: 'Hostname', value: 'web-prod-01', icon: 'Server' },
                { key: 'Primary IP', value: '10.0.0.5', icon: 'Globe', copyable: true },
                { key: 'Gateway', value: '10.0.0.1', icon: 'Route' },
                { key: 'DNS', value: '8.8.8.8, 1.1.1.1', icon: 'Dns' },
              ],
              layout: 'grid-2',
            },
            {
              type: 'card-list',
              items: [
                {
                  icon: 'Cable',
                  title: 'eth0',
                  badge: { label: 'UP', variant: 'success', dot: true },
                  details: [
                    { label: 'IP', value: '10.0.0.5/24' },
                    { label: 'MAC', value: '02:42:ac:11:00:02' },
                    { label: 'MTU', value: '1500' },
                  ],
                },
                {
                  icon: 'RotateCcw',
                  title: 'lo',
                  badge: { label: 'UP', variant: 'success', dot: true },
                  details: [
                    { label: 'IP', value: '127.0.0.1/8' },
                    { label: 'MAC', value: '00:00:00:00:00:00' },
                    { label: 'MTU', value: '65536' },
                  ],
                },
              ],
            },
          ],
        },
        firewall: {
          layout: 'stack',
          gap: 'md',
          children: [
            {
              type: 'alert',
              title: 'UFW Active',
              message: 'Firewall is enabled with 5 rules configured.',
              variant: 'success',
            },
            {
              type: 'table',
              title: 'Firewall Rules',
              columns: [
                { key: 'num', label: '#', type: 'text', sortable: false, width: '50px' },
                { key: 'to', label: 'To', type: 'mono', sortable: false },
                { key: 'action', label: 'Action', type: 'badge', sortable: false, badgeVariant: { ALLOW: 'success', DENY: 'destructive', LIMIT: 'warning' } },
                { key: 'from', label: 'From', type: 'mono', sortable: false },
                { key: 'comment', label: 'Comment', type: 'text', sortable: false },
              ],
              rows: [
                { num: 1, to: '22/tcp', action: 'LIMIT', from: 'Anywhere', comment: 'SSH rate limit' },
                { num: 2, to: '80/tcp', action: 'ALLOW', from: 'Anywhere', comment: 'HTTP' },
                { num: 3, to: '443/tcp', action: 'ALLOW', from: 'Anywhere', comment: 'HTTPS' },
                { num: 4, to: '5432/tcp', action: 'ALLOW', from: '10.0.0.0/24', comment: 'PostgreSQL (LAN)' },
                { num: 5, to: '3000/tcp', action: 'DENY', from: 'Anywhere', comment: 'Blocked dev port' },
              ],
              actions: [
                { id: 'delete', label: 'Delete Rule', icon: 'Trash2', command: 'sudo ufw delete {num}', confirm: true, confirmMessage: 'Delete firewall rule #{num}?', variant: 'destructive' },
              ],
              actionStyle: 'dropdown',
            },
          ],
        },
        security: {
          layout: 'tabs',
          tabs: [
            {
              id: 'sessions',
              label: 'Active Sessions',
              icon: 'Users',
              count: 2,
              children: [
                {
                  type: 'table',
                  columns: [
                    { key: 'user', label: 'User', type: 'text', sortable: false },
                    { key: 'ip', label: 'IP Address', type: 'mono', sortable: false },
                    { key: 'loginAt', label: 'Login Time', type: 'text', sortable: false },
                    { key: 'idle', label: 'Idle', type: 'text', sortable: false, width: '80px' },
                  ],
                  rows: [
                    { user: 'root', ip: '192.168.1.100', loginAt: '2024-01-15 09:23', idle: '0s' },
                    { user: 'deploy', ip: '10.0.0.50', loginAt: '2024-01-15 08:45', idle: '12m' },
                  ],
                  actions: [
                    { id: 'kill', label: 'Kill Session', icon: 'LogOut', command: 'pkill -u {user}', confirm: true, confirmMessage: 'Terminate session for {user}?', variant: 'destructive' },
                  ],
                  actionStyle: 'dropdown',
                },
              ],
            },
            {
              id: 'users',
              label: 'Users',
              icon: 'UserCog',
              count: 4,
              children: [
                {
                  type: 'table',
                  columns: [
                    { key: 'username', label: 'Username', type: 'text', sortable: true },
                    { key: 'uid', label: 'UID', type: 'mono', sortable: false, width: '70px' },
                    { key: 'groups', label: 'Groups', type: 'text', sortable: false },
                    { key: 'shell', label: 'Shell', type: 'mono', sortable: false },
                    { key: 'sudo', label: 'Sudo', type: 'badge', sortable: false, width: '80px', badgeVariant: { Yes: 'warning', No: 'secondary' } },
                  ],
                  rows: [
                    { username: 'root', uid: '0', groups: 'root', shell: '/bin/bash', sudo: 'Yes' },
                    { username: 'deploy', uid: '1001', groups: 'deploy,docker', shell: '/bin/bash', sudo: 'Yes' },
                    { username: 'www-data', uid: '33', groups: 'www-data', shell: '/usr/sbin/nologin', sudo: 'No' },
                    { username: 'postgres', uid: '114', groups: 'postgres', shell: '/bin/bash', sudo: 'No' },
                  ],
                },
              ],
            },
            {
              id: 'ssh-config',
              label: 'SSH Config',
              icon: 'KeyRound',
              children: [
                {
                  type: 'key-value',
                  title: 'SSH Configuration',
                  pairs: [
                    { key: 'Port', value: '22', icon: 'Hash' },
                    { key: 'PermitRootLogin', value: 'prohibit-password', icon: 'ShieldAlert' },
                    { key: 'PasswordAuth', value: 'no', icon: 'Lock' },
                    { key: 'PubkeyAuth', value: 'yes', icon: 'Key' },
                    { key: 'MaxAuthTries', value: '3', icon: 'ShieldCheck' },
                    { key: 'X11 Forwarding', value: 'no', icon: 'Monitor' },
                  ],
                  layout: 'grid-2',
                },
              ],
            },
            {
              id: 'login-history',
              label: 'Login History',
              icon: 'History',
              children: [
                {
                  type: 'table',
                  columns: [
                    { key: 'user', label: 'User', type: 'text', sortable: false },
                    { key: 'ip', label: 'From', type: 'mono', sortable: false },
                    { key: 'time', label: 'Time', type: 'text', sortable: false },
                    { key: 'result', label: 'Result', type: 'badge', sortable: false, badgeVariant: { Success: 'success', Failed: 'destructive' } },
                  ],
                  rows: [
                    { user: 'root', ip: '192.168.1.100', time: 'Jan 15 09:23', result: 'Success' },
                    { user: 'deploy', ip: '10.0.0.50', time: 'Jan 15 08:45', result: 'Success' },
                    { user: 'admin', ip: '203.0.113.42', time: 'Jan 15 03:17', result: 'Failed' },
                    { user: 'root', ip: '198.51.100.7', time: 'Jan 14 22:01', result: 'Failed' },
                    { user: 'deploy', ip: '10.0.0.50', time: 'Jan 14 18:30', result: 'Success' },
                  ],
                },
              ],
            },
            {
              id: 'fail2ban',
              label: 'Fail2ban',
              icon: 'ShieldCheck',
              children: [
                {
                  type: 'alert',
                  title: 'Fail2ban Active',
                  message: '2 jails configured, 14 IPs currently banned.',
                  variant: 'success',
                },
                {
                  type: 'table',
                  title: 'Active Jails',
                  columns: [
                    { key: 'jail', label: 'Jail', type: 'text', sortable: false },
                    { key: 'status', label: 'Status', type: 'badge', sortable: false, badgeVariant: { active: 'success', inactive: 'secondary' } },
                    { key: 'banned', label: 'Banned IPs', type: 'text', sortable: false, width: '100px' },
                    { key: 'totalBans', label: 'Total Bans', type: 'text', sortable: false, width: '100px' },
                  ],
                  rows: [
                    { jail: 'sshd', status: 'active', banned: 12, totalBans: 847 },
                    { jail: 'nginx-http-auth', status: 'active', banned: 2, totalBans: 31 },
                  ],
                },
              ],
            },
          ],
        },
        webserver: {
          layout: 'stack',
          gap: 'md',
          children: [
            {
              type: 'badge-grid',
              title: 'Nginx Status',
              badges: [
                { label: 'Status', value: 'Running', variant: 'success' },
                { label: 'Sites', value: '3 enabled', variant: 'secondary' },
                { label: 'Connections', value: '42 active', variant: 'secondary' },
              ],
            },
            {
              type: 'table',
              title: 'Virtual Hosts',
              columns: [
                { key: 'domain', label: 'Domain', type: 'text', sortable: true },
                { key: 'port', label: 'Port', type: 'mono', sortable: false, width: '80px' },
                { key: 'ssl', label: 'SSL', type: 'badge', sortable: false, width: '80px', badgeVariant: { Yes: 'success', No: 'destructive' } },
                { key: 'upstream', label: 'Upstream', type: 'mono', sortable: false },
              ],
              rows: [
                { domain: 'example.com', port: '443', ssl: 'Yes', upstream: '127.0.0.1:3000' },
                { domain: 'api.example.com', port: '443', ssl: 'Yes', upstream: '127.0.0.1:4000' },
                { domain: 'staging.example.com', port: '80', ssl: 'No', upstream: '127.0.0.1:3001' },
              ],
            },
          ],
        },
        packages: {
          layout: 'grid',
          columns: 3,
          autoFit: null,
          minChildWidth: null,
          children: [
            { type: 'stat-card', title: 'Installed', value: '530', icon: 'Package' },
            { type: 'stat-card', title: 'Upgradable', value: '12', icon: 'ArrowUpCircle', trend: 'up' },
            { type: 'stat-card', title: 'Auto-removable', value: '3', icon: 'Trash2' },
          ],
        },
        cron: {
          layout: 'stack',
          gap: 'md',
          children: [
            {
              type: 'table',
              title: 'Scheduled Tasks',
              columns: [
                { key: 'schedule', label: 'Schedule', type: 'mono', sortable: false },
                { key: 'command', label: 'Command', type: 'code', sortable: false },
                { key: 'user', label: 'User', type: 'text', sortable: false, width: '80px' },
                { key: 'lastRun', label: 'Last Run', type: 'text', sortable: false },
              ],
              rows: [
                { schedule: '0 2 * * *', command: '/usr/local/bin/backup.sh', user: 'root', lastRun: '2024-01-15 02:00' },
                { schedule: '*/5 * * * *', command: '/opt/app/health-check.sh', user: 'deploy', lastRun: '2024-01-15 09:25' },
                { schedule: '0 0 * * 0', command: 'certbot renew --quiet', user: 'root', lastRun: '2024-01-14 00:00' },
                { schedule: '30 3 * * *', command: 'pg_dump mydb | gzip > /backups/db.gz', user: 'postgres', lastRun: '2024-01-15 03:30' },
              ],
            },
          ],
        },
        logs: {
          layout: 'stack',
          gap: 'md',
          children: [
            {
              type: 'code-block',
              title: 'Recent System Logs',
              code: `Jan 15 09:23:41 web-prod-01 sshd[12345]: Accepted publickey for root from 192.168.1.100
Jan 15 09:20:15 web-prod-01 nginx[5678]: 203.0.113.42 - "GET /api/health" 200
Jan 15 09:15:02 web-prod-01 cron[9012]: (deploy) CMD (/opt/app/health-check.sh)
Jan 15 09:10:33 web-prod-01 kernel: [UFW BLOCK] IN=eth0 SRC=198.51.100.7 DST=10.0.0.5
Jan 15 09:05:01 web-prod-01 systemd[1]: Starting Daily apt upgrade...
Jan 15 09:00:00 web-prod-01 cron[8901]: (root) CMD (/usr/local/bin/logrotate.sh)`,
              language: 'log',
              maxHeight: '240px',
            },
          ],
        },
        storage: {
          layout: 'stack',
          gap: 'md',
          children: [
            {
              type: 'progress-bar',
              title: 'Root (/)',
              value: 64,
              label: '32 GB / 50 GB',
              variant: 'default',
            },
            {
              type: 'progress-bar',
              title: 'Data (/data)',
              value: 23,
              label: '115 GB / 500 GB',
              variant: 'default',
            },
            {
              type: 'progress-bar',
              title: 'Backups (/backups)',
              value: 87,
              label: '174 GB / 200 GB',
              variant: 'destructive',
            },
          ],
        },
      },
      meta: {
        command: 'Multiple: ufw status, last, ss -tlnp, nginx -T, crontab -l, df -h',
        generatedAt: new Date().toISOString(),
      },
    },
  },
];
