// EX3-B.3: Database Status template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const databaseStatusTemplate: UITemplate = {
  id: 'database-status',
  name: 'Database Status',
  description: 'Database server health, connections, replication, and query performance',
  tags: ['database', 'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'db'],
  layoutPattern: 'tabbed-detail',
  matchPatterns: [
    '^mysql\\s+.*status',
    '^pg_isready',
    '^psql\\s+.*SELECT',
    '^redis-cli\\s+info',
    '^mongosh\\s+.*status',
    '^mysqladmin\\s+status',
  ],
  schema: {
    title: 'Database Status',
    description: 'Database server health and performance metrics',
    icon: 'Database',
    sidebarItems: [{ id: 'main', label: 'Database' }],
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
              { type: 'stat-card', title: 'Status', value: 'Running', icon: 'Database', trend: 'neutral' },
              { type: 'stat-card', title: 'Connections', value: '24/100', icon: 'Users', trend: 'neutral' },
              { type: 'stat-card', title: 'Uptime', value: '45d 12h', icon: 'Clock', trend: 'up' },
              { type: 'stat-card', title: 'Queries/sec', value: '142', icon: 'Zap', trend: 'up' },
            ],
          },
          {
            layout: 'tabs',
            tabs: [
              {
                id: 'overview',
                label: 'Overview',
                icon: 'LayoutDashboard',
                children: [
                  {
                    type: 'key-value',
                    title: 'Server Information',
                    pairs: [
                      { key: 'Engine', value: 'PostgreSQL 16.1' },
                      { key: 'Data Directory', value: '/var/lib/postgresql/16/main' },
                      { key: 'Listen Address', value: '0.0.0.0:5432' },
                      { key: 'Max Connections', value: '100' },
                      { key: 'Shared Buffers', value: '256 MB' },
                      { key: 'Work Mem', value: '4 MB' },
                      { key: 'Effective Cache', value: '768 MB' },
                      { key: 'WAL Level', value: 'replica' },
                    ],
                    layout: 'grid-2',
                  },
                ],
              },
              {
                id: 'databases',
                label: 'Databases',
                icon: 'Database',
                children: [
                  {
                    type: 'table',
                    title: 'Database List',
                    columns: [
                      { key: 'name', label: 'Name', sortable: true },
                      { key: 'size', label: 'Size', sortable: true },
                      { key: 'tables', label: 'Tables', sortable: true },
                      { key: 'connections', label: 'Active Conn', sortable: true },
                      { key: 'owner', label: 'Owner' },
                    ],
                    rows: [
                      { name: 'app_production', size: '2.4 GB', tables: '48', connections: '18', owner: 'app_user' },
                      { name: 'app_staging', size: '892 MB', tables: '48', connections: '3', owner: 'app_user' },
                      { name: 'analytics', size: '5.1 GB', tables: '12', connections: '2', owner: 'analytics_user' },
                      { name: 'postgres', size: '8.4 MB', tables: '0', connections: '1', owner: 'postgres' },
                    ],
                  },
                ],
              },
              {
                id: 'replication',
                label: 'Replication',
                icon: 'Copy',
                children: [
                  {
                    type: 'key-value',
                    title: 'Replication Status',
                    pairs: [
                      { key: 'Role', value: 'Primary' },
                      { key: 'WAL Level', value: 'replica' },
                      { key: 'Replicas', value: '1 connected' },
                      { key: 'Replication Lag', value: '0.2 MB' },
                      { key: 'Sync State', value: 'async' },
                    ],
                    layout: 'grid-2',
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
