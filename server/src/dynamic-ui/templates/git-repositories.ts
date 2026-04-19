// EX3-B.3: Git Repositories template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const gitRepositoriesTemplate: UITemplate = {
  id: 'git-repositories',
  name: 'Git Repositories',
  description: 'Git repository status, branches, and recent activity',
  tags: ['git', 'repository', 'branch', 'commit', 'version-control'],
  layoutPattern: 'detail-overview',
  matchPatterns: [
    '^git\\s+status',
    '^git\\s+log',
    '^git\\s+branch',
    'find.*\\.git',
    '^git\\s+remote\\s+-v',
  ],
  schema: {
    title: 'Git Repositories',
    description: 'Repository overview and recent activity',
    icon: 'GitBranch',
    sidebarItems: [{ id: 'main', label: 'Repositories' }],
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
              { type: 'stat-card', title: 'Repositories', value: '4', icon: 'GitBranch', trend: 'neutral' },
              { type: 'stat-card', title: 'Total Branches', value: '12', icon: 'GitFork', trend: 'neutral' },
              { type: 'stat-card', title: 'Uncommitted', value: '2', icon: 'FileEdit', trend: 'down' },
              { type: 'stat-card', title: 'Behind Remote', value: '1', icon: 'ArrowDown', trend: 'down' },
            ],
          },
          {
            type: 'card-list',
            title: 'Repositories',
            items: [
              {
                title: 'web-app',
                subtitle: '/opt/web-app',
                badge: { label: 'clean', variant: 'success' },
                details: [
                  { label: 'Branch', value: 'main (3 branches)' },
                  { label: 'Last Commit', value: '2h ago — fix: resolve login redirect loop' },
                  { label: 'Remote', value: 'git@github.com:org/web-app.git' },
                  { label: 'Ahead/Behind', value: '0/0' },
                ],
              },
              {
                title: 'api-server',
                subtitle: '/opt/api-server',
                badge: { label: '3 modified', variant: 'destructive' },
                details: [
                  { label: 'Branch', value: 'develop (5 branches)' },
                  { label: 'Last Commit', value: '1d ago — feat: add user analytics endpoint' },
                  { label: 'Remote', value: 'git@github.com:org/api-server.git' },
                  { label: 'Ahead/Behind', value: '2/0' },
                ],
              },
              {
                title: 'infrastructure',
                subtitle: '/opt/infra',
                badge: { label: 'clean', variant: 'success' },
                details: [
                  { label: 'Branch', value: 'main (2 branches)' },
                  { label: 'Last Commit', value: '5d ago — chore: update nginx config' },
                  { label: 'Remote', value: 'git@github.com:org/infra.git' },
                  { label: 'Ahead/Behind', value: '0/3' },
                ],
              },
              {
                title: 'monitoring',
                subtitle: '/opt/monitoring',
                badge: { label: '1 modified', variant: 'warning' },
                details: [
                  { label: 'Branch', value: 'main (2 branches)' },
                  { label: 'Last Commit', value: '3d ago — fix: alert threshold adjustment' },
                  { label: 'Remote', value: 'git@github.com:org/monitoring.git' },
                  { label: 'Ahead/Behind', value: '0/0' },
                ],
              },
            ],
          },
        ],
      },
    },
  },
};
