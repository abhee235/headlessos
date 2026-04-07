// EX1.7: Database Info template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const databaseInfoTemplate: UITemplate = {
  id: 'database-info',
  name: 'Database Status',
  description: 'MySQL/PostgreSQL status, connections, and database sizes',
  tags: ['database', 'mysql', 'postgres', 'postgresql', 'mariadb', 'sql'],
  matchPatterns: [
    'mysqladmin\\s+status',
    'mysql\\s+-e\\s+.*show',
    'pg_isready',
    'psql\\s+.*-c',
    'SHOW\\s+(DATABASES|STATUS|PROCESSLIST)',
  ],
  schema: {
    title: 'Database Status',
    description: 'Database server status and performance metrics',
    icon: 'Database',
    root: {
      layout: 'stack',
      gap: 'md',
      widgets: [
        {
          type: 'key-value',
          title: 'Server Info',
          pairs: [
            { key: 'Engine', value: 'PostgreSQL 16.1' },
            { key: 'Status', value: 'Running' },
            { key: 'Uptime', value: '45 days 3:22:15' },
            { key: 'Connection String', value: 'localhost:5432' },
            { key: 'Data Directory', value: '/var/lib/postgresql/16/main' },
            { key: 'Config File', value: '/etc/postgresql/16/main/postgresql.conf' },
          ],
          layout: 'grid-2',
        },
        {
          type: 'stat-card',
          title: 'Active Connections',
          value: '23',
          unit: '/ 100 max',
          trend: 'neutral',
          description: '23% connection pool utilization',
        },
        {
          type: 'stat-card',
          title: 'Queries/sec',
          value: '1,247',
          trend: 'up',
          description: 'Average over last 5 minutes',
        },
        {
          type: 'table',
          title: 'Databases',
          columns: [
            { key: 'name', label: 'Database', type: 'text', sortable: true },
            { key: 'size', label: 'Size', type: 'text', sortable: true },
            { key: 'tables', label: 'Tables', type: 'number' },
            { key: 'connections', label: 'Connections', type: 'number' },
            { key: 'owner', label: 'Owner', type: 'text' },
          ],
          rows: [
            { name: 'production_db', size: '4.2 GB', tables: 87, connections: 15, owner: 'app' },
            { name: 'staging_db', size: '1.8 GB', tables: 87, connections: 3, owner: 'app' },
            { name: 'analytics', size: '12.5 GB', tables: 24, connections: 5, owner: 'analytics' },
            { name: 'postgres', size: '8 MB', tables: 0, connections: 0, owner: 'postgres' },
          ],
          footer: '4 databases, 18.5 GB total',
        },
        {
          type: 'chart',
          title: 'Connections Over Time',
          chartType: 'line',
          height: 200,
          data: [
            { time: '00:00', connections: 8 },
            { time: '04:00', connections: 5 },
            { time: '08:00', connections: 18 },
            { time: '12:00', connections: 35 },
            { time: '16:00', connections: 42 },
            { time: '20:00', connections: 28 },
            { time: 'Now', connections: 23 },
          ],
          xKey: 'time',
          yKeys: [{ key: 'connections', label: 'Active Connections' }],
        },
      ],
    },
  },
};
