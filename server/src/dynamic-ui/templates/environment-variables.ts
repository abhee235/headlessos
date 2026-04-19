// EX3-B.3: Environment Variables template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const environmentVariablesTemplate: UITemplate = {
  id: 'environment-variables',
  name: 'Environment Variables',
  description: 'System and user environment variable listing with search',
  tags: ['env', 'environment', 'variables', 'export', 'printenv'],
  layoutPattern: 'single-table',
  matchPatterns: [
    '^env$',
    '^printenv',
    '^export$',
    '^export\\s+-p',
    '^set$',
  ],
  schema: {
    title: 'Environment Variables',
    description: 'Current shell environment variables',
    icon: 'Variable',
    sidebarItems: [{ id: 'main', label: 'Variables' }],
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
              { type: 'stat-card', title: 'Total Variables', value: '62', icon: 'Variable', trend: 'neutral' },
              { type: 'stat-card', title: 'PATH Entries', value: '12', icon: 'FolderTree', trend: 'neutral' },
              { type: 'stat-card', title: 'User Defined', value: '18', icon: 'User', trend: 'neutral' },
            ],
          },
          {
            type: 'table',
            title: 'Environment Variables',
            columns: [
              { key: 'name', label: 'Variable', sortable: true },
              { key: 'value', label: 'Value' },
              { key: 'category', label: 'Category', sortable: true },
            ],
            rows: [
              { name: 'PATH', value: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', category: 'System' },
              { name: 'HOME', value: '/home/deploy', category: 'System' },
              { name: 'USER', value: 'deploy', category: 'System' },
              { name: 'SHELL', value: '/bin/bash', category: 'System' },
              { name: 'LANG', value: 'en_US.UTF-8', category: 'Locale' },
              { name: 'TERM', value: 'xterm-256color', category: 'Terminal' },
              { name: 'NODE_ENV', value: 'production', category: 'Application' },
              { name: 'DATABASE_URL', value: 'postgres://localhost:5432/app', category: 'Application' },
              { name: 'REDIS_URL', value: 'redis://localhost:6379', category: 'Application' },
              { name: 'PORT', value: '3000', category: 'Application' },
              { name: 'LOG_LEVEL', value: 'info', category: 'Application' },
              { name: 'SSH_AUTH_SOCK', value: '/tmp/ssh-XXXXXXabc/agent.1234', category: 'SSH' },
            ],
            filters: {
              search: true,
              dropdowns: [
                { key: 'category', label: 'Category', options: [
                  { label: 'System', value: 'System' },
                  { label: 'Application', value: 'Application' },
                  { label: 'Locale', value: 'Locale' },
                  { label: 'Terminal', value: 'Terminal' },
                  { label: 'SSH', value: 'SSH' },
                ]},
              ],
            },
          },
        ],
      },
    },
  },
};
