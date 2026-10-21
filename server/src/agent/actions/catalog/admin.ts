// EX9.1: read actions — packages, web server, security
// @see docs/phases/phase-ex9.md §1

import { z } from 'zod';
import { readAction } from './define.js';
import { packageName, userName } from '../params.js';

export const ADMIN_ACTIONS = [
  // ── Packages ──
  readAction({
    id: 'packages_upgradable',
    title: 'Upgradable packages',
    description: 'Debian/Ubuntu packages with a newer version available (apt list --upgradable).',
    category: 'packages',
    keywords: ['update', 'upgrade', 'patch', 'apt', 'packages', 'security updates'],
    timeoutMs: 30_000,
    run: { kind: 'exec', build: () => ['apt', 'list', '--upgradable'] },
  }),
  readAction({
    id: 'package_status',
    title: 'Package version',
    description: 'Installed and candidate version of one Debian/Ubuntu package (apt-cache policy).',
    category: 'packages',
    keywords: ['package', 'installed', 'version', 'apt'],
    params: z.object({ name: packageName() }).strict(),
    run: { kind: 'exec', build: (p) => ['apt-cache', 'policy', p.name] },
  }),

  // ── Web server ──
  readAction({
    id: 'nginx_test',
    title: 'Nginx config test',
    description: 'Check the nginx configuration for errors (nginx -t, needs passwordless sudo).',
    category: 'web',
    keywords: ['nginx', 'config', 'syntax', 'test', 'web server'],
    okExitCodes: [0, 1],
    run: { kind: 'exec', sudo: true, build: () => ['nginx', '-t'] },
  }),
  readAction({
    id: 'nginx_sites',
    title: 'Nginx sites',
    description: 'Site files in /etc/nginx/sites-enabled or sites-available.',
    category: 'web',
    keywords: ['nginx', 'site', 'sites', 'vhost', 'domain'],
    params: z.object({ which: z.enum(['enabled', 'available']).default('enabled').describe('which folder') }).strict(),
    okExitCodes: [0, 2],
    run: { kind: 'exec', build: (p) => ['ls', '-la', `/etc/nginx/sites-${p.which}`] },
  }),
  readAction({
    id: 'tls_certificates',
    title: 'TLS certificates',
    description: "Let's Encrypt certificates with domains and expiry dates (certbot certificates, needs sudo).",
    category: 'web',
    keywords: ['ssl', 'tls', 'certificate', 'https', 'expiry', 'letsencrypt', 'certbot'],
    timeoutMs: 30_000,
    run: { kind: 'exec', sudo: true, build: () => ['certbot', 'certificates'] },
  }),

  // ── Security ──
  readAction({
    id: 'fail2ban_status',
    title: 'Fail2ban',
    description: 'Fail2ban jails, or one jail with its banned IPs (needs passwordless sudo).',
    category: 'security',
    keywords: ['fail2ban', 'ban', 'banned', 'brute force', 'ssh attack'],
    params: z.object({
      jail: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, 'expected a jail name like sshd').optional().describe('jail name, e.g. sshd'),
    }).strict(),
    run: { kind: 'exec', sudo: true, build: (p) => ['fail2ban-client', 'status', ...(p.jail ? [p.jail] : [])] },
  }),
  readAction({
    id: 'user_accounts',
    title: 'User accounts',
    description: 'Local accounts with uid, home and shell (/etc/passwd over SFTP; it holds no password hashes).',
    category: 'security',
    keywords: ['users', 'accounts', 'uid', 'shell', 'home'],
    // SFTP: the classic blocklist refuses any command containing the word "passwd"
    maxOutputBytes: 262_144,
    run: { kind: 'sftp-read', path: () => '/etc/passwd', maxBytes: () => 262_144 },
  }),
  readAction({
    id: 'user_groups',
    title: 'User groups',
    description: "One user's uid and groups (id <user>), e.g. whether they are in sudo or docker.",
    category: 'security',
    keywords: ['user', 'groups', 'sudo', 'docker group', 'permissions'],
    params: z.object({ user: userName() }).strict(),
    okExitCodes: [0, 1],
    run: { kind: 'exec', build: (p) => ['id', '--', p.user] },
  }),
  readAction({
    id: 'sudo_rights',
    title: 'Sudo rights',
    description: 'What the login user may run with sudo without a password (sudo -n -l).',
    category: 'security',
    keywords: ['sudo', 'root', 'privileges', 'permissions'],
    okExitCodes: [0, 1],
    run: { kind: 'exec', build: () => ['sudo', '-n', '-l'] },
  }),
];
