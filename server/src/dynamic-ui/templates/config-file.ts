// EX1.7: Config File template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const configFileTemplate: UITemplate = {
  id: 'config-file',
  name: 'Config File Viewer',
  description: 'Configuration file contents with key-value summary',
  tags: ['config', 'configuration', 'settings', 'nginx', 'apache', 'sshd'],
  matchPatterns: [
    'cat\\s+/etc/',
    'cat\\s+.*\\.conf$',
    'cat\\s+.*\\.cfg$',
    'cat\\s+.*\\.ini$',
    'cat\\s+.*\\.yaml$',
    'cat\\s+.*\\.yml$',
    'cat\\s+.*\\.toml$',
    'nginx\\s+-T',
    'sshd\\s+-T',
  ],
  schema: {
    title: 'Configuration File',
    description: 'Parsed configuration with key settings highlighted',
    icon: 'FileCode',
    sidebarItems: [{ id: 'main', label: 'Configuration' }],
    sections: {
      main: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'key-value',
          title: 'Key Settings',
          pairs: [
            { key: 'File', value: '/etc/nginx/nginx.conf' },
            { key: 'Worker Processes', value: 'auto' },
            { key: 'Worker Connections', value: '1024' },
            { key: 'Gzip', value: 'on' },
            { key: 'Server Names Hash', value: '64' },
            { key: 'Client Max Body', value: '50m' },
          ],
          layout: 'grid-2',
        },
        {
          type: 'code-block',
          title: 'Raw Configuration',
          language: 'nginx',
          maxHeight: '400px',
          code: 'worker_processes auto;\nevents {\n    worker_connections 1024;\n}\nhttp {\n    include /etc/nginx/mime.types;\n    default_type application/octet-stream;\n    gzip on;\n    server {\n        listen 80;\n        server_name example.com;\n        root /var/www/html;\n    }\n}',
        },
      ],
      },
    },
  },
};
