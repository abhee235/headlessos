// EX1.7: Git Status template
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

export const gitStatusTemplate: UITemplate = {
  id: 'git-status',
  name: 'Git Repository',
  description: 'Git repo status, branch info, and recent commits',
  tags: ['git', 'vcs', 'repository', 'development'],
  matchPatterns: [
    '^git\\s+status',
    '^git\\s+log',
    '^git\\s+branch',
    '^git\\s+diff\\s+--stat',
  ],
  schema: {
    title: 'Git Repository',
    description: 'Repository status and recent activity',
    icon: 'GitBranch',
    root: {
      layout: 'stack',
      gap: 'md',
      widgets: [
        {
          type: 'key-value',
          title: 'Repository Info',
          pairs: [
            { key: 'Branch', value: 'main' },
            { key: 'Remote', value: 'origin (git@github.com:user/repo.git)' },
            { key: 'Last Commit', value: 'a1b2c3d — feat: add user dashboard' },
            { key: 'Ahead/Behind', value: '2 ahead, 0 behind' },
            { key: 'Working Tree', value: '3 modified, 1 untracked' },
            { key: 'Stash', value: '1 entry' },
          ],
          layout: 'grid-2',
        },
        {
          type: 'table',
          title: 'Changed Files',
          columns: [
            {
              key: 'status',
              label: 'Status',
              type: 'badge',
              badgeVariant: {
                modified: 'warning',
                added: 'success',
                deleted: 'destructive',
                untracked: 'secondary',
                renamed: 'default',
              },
            },
            { key: 'file', label: 'File', type: 'code' },
            { key: 'changes', label: 'Changes', type: 'text' },
          ],
          rows: [
            { status: 'modified', file: 'src/components/Dashboard.tsx', changes: '+45 / -12' },
            { status: 'modified', file: 'src/lib/api.ts', changes: '+8 / -3' },
            { status: 'added', file: 'src/components/UserCard.tsx', changes: '+120 / -0' },
            { status: 'untracked', file: 'TODO.md', changes: 'new file' },
          ],
        },
        {
          type: 'table',
          title: 'Recent Commits',
          columns: [
            { key: 'hash', label: 'Hash', type: 'code', width: '80px' },
            { key: 'message', label: 'Message', type: 'text' },
            { key: 'author', label: 'Author', type: 'text' },
            { key: 'date', label: 'Date', type: 'text' },
          ],
          rows: [
            { hash: 'a1b2c3d', message: 'feat: add user dashboard', author: 'dev', date: '2 hours ago' },
            { hash: 'e4f5g6h', message: 'fix: resolve auth redirect loop', author: 'dev', date: '5 hours ago' },
            { hash: 'i7j8k9l', message: 'refactor: extract API client', author: 'dev', date: '1 day ago' },
            { hash: 'm0n1o2p', message: 'docs: update README', author: 'dev', date: '2 days ago' },
            { hash: 'q3r4s5t', message: 'chore: upgrade dependencies', author: 'ops', date: '3 days ago' },
          ],
        },
      ],
    },
  },
};
