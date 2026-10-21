// EX9.1: Parameter validators for actions
// @see docs/phases/phase-ex9.md §2
//
// Values the shell could misread are rejected, not escaped around. Names start
// with an alphanumeric and paths with "/", so no parameter can become an option.
// Messages are written for the model: "expected …".

import { posix } from 'node:path';
import { z } from 'zod';
import type { ActionDef } from './types.js';

// ── Paths ───────────────────────────────────────────────

/** Where agents may read files and list directories. */
export const READ_ROOTS = [
  '/etc', '/var/log', '/home', '/root', '/opt', '/srv', '/var/www', '/tmp', '/usr/share/doc',
] as const;

/** Files that may hold secrets: denied even under a read root. */
const SECRET_PATHS: RegExp[] = [
  /^\/etc\/g?shadow(-|$)/,
  /^\/etc\/sudoers(\.d(\/|$)|$)/,
  /^\/etc\/ssh\/ssh_host_[^/]*_key$/,
  /(^|\/)\.ssh(\/|$)/,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)[^/]*$/,
  /(^|\/)\.env(\.[^/]*)?$/,
  /(^|\/)\.(git-credentials|netrc|pgpass|my\.cnf)$/,
  /(^|\/)\.docker\/config\.json$/,
  /(^|\/)\.aws\/credentials$/,
  /(^|\/)\.kube\/config$/,
];

export function isSecretPath(path: string): boolean {
  return SECRET_PATHS.some((re) => re.test(path));
}

export function isUnderRoot(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => path === root || path.startsWith(`${root}/`));
}

/** Directories excluded from recursive searches so they never read secret files. */
export const SEARCH_EXCLUDED_DIRS = ['.ssh', '.gnupg', '.aws', '.kube', '.docker', 'sudoers.d'];
export const SEARCH_EXCLUDED_FILES = ['shadow', 'shadow-', 'gshadow', 'gshadow-', 'sudoers', '*.pem', '*.key', 'id_*', '.env', '.env.*', '.netrc', '.pgpass', '.git-credentials'];

export function readPath(roots: readonly string[] = READ_ROOTS) {
  return z.string().max(4096).superRefine((p, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (/[\x00-\x1f\x7f]/.test(p)) return fail('expected a path without control characters');
    if (!p.startsWith('/')) return fail('expected an absolute path starting with /');
    if (p.split('/').includes('..')) return fail('expected a path without ".."');
    const normalized = posix.normalize(p);
    if (normalized !== p && `${normalized}/` !== p) return fail(`expected a normalized path such as ${normalized}`);
    const clean = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
    if (!isUnderRoot(clean, roots)) return fail(`expected a path under ${roots.join(', ')}`);
    if (isSecretPath(clean)) return fail('that file may hold secrets; agents cannot read it');
  }).transform((p) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p))
    .describe(`Absolute path under ${roots.join(', ')}`);
}

// ── Names ───────────────────────────────────────────────

export function unitName() {
  return z.string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/, 'expected a systemd unit name like nginx or nginx.service')
    .describe('systemd unit, e.g. nginx or nginx.service');
}

export function containerRef() {
  return z.string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/, 'expected a container name or id like web-1 or 3f2a9c1b7d4e')
    .describe('container name or id');
}

export function packageName() {
  return z.string()
    .regex(/^[a-z0-9][a-z0-9.+-]{0,127}$/, 'expected a package name like nginx or libssl3')
    .describe('package name, e.g. nginx');
}

/** Programs an action may run with --help / --version: never ones that act on any invocation. */
const PROGRAM_DENY = new Set([
  'reboot', 'shutdown', 'halt', 'poweroff', 'init', 'telinit', 'dd', 'shred', 'wipefs', 'fdisk',
  'sfdisk', 'parted', 'mke2fs', 'rm', 'rmdir', 'kill', 'killall', 'pkill', 'passwd', 'chpasswd',
  'useradd', 'userdel', 'usermod', 'groupdel', 'su', 'sudo', 'doas',
]);

export function programName() {
  return z.string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/, 'expected a program name like restic or docker (no path)')
    .refine((name) => !PROGRAM_DENY.has(name) && !name.startsWith('mkfs'), {
      message: 'that program is not available to agents',
    })
    .describe('program name, e.g. restic');
}

export function subcommand() {
  return z.string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, 'expected a subcommand word like backup')
    .describe('subcommand, e.g. backup');
}

export function userName() {
  return z.string()
    .regex(/^[a-z_][a-z0-9_.-]{0,31}\$?$/, 'expected a Linux user name like www-data')
    .describe('Linux user name');
}

const HOST_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const DNS_NAME = new RegExp(`^(?=.{1,253}$)${HOST_LABEL}(?:\\.${HOST_LABEL})*\\.?$`);
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9A-Fa-f:.]{2,45}$/;

export function isHostName(value: string): boolean {
  return DNS_NAME.test(value) || IPV4.test(value) || (value.includes(':') && IPV6.test(value));
}

export function hostName() {
  return z.string()
    .refine(isHostName, 'expected a host name like example.com or an IP address')
    .describe('host name or IP address');
}

export function httpUrl() {
  return z.string().max(2048).superRefine((value, ctx) => {
    const fail = () => ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'expected an http(s) URL like https://example.com/health' });
    if (!/^[\x21-\x7e]+$/.test(value)) return fail();
    let url: URL;
    try { url = new URL(value); } catch { return fail(); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail();
    if (url.username || url.password) return fail();
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!isHostName(host)) return fail();
  }).describe('http(s) URL');
}

// ── Numbers and text ────────────────────────────────────

export function lineCount(max: number, fallback: number) {
  return z.number().int().min(1).max(max).default(fallback)
    .describe(`number of lines, 1–${max} (default ${fallback})`);
}

export function pid() {
  return z.number().int().min(1).max(4_194_304).describe('process id');
}

export function globPattern() {
  return z.string()
    .regex(/^[A-Za-z0-9*?._-]{1,64}$/, 'expected a file name pattern like *.log')
    .describe('file name pattern, e.g. *.log');
}

export function searchText() {
  return z.string()
    .regex(/^[\x20-\x7e]{1,128}$/, 'expected 1–128 plain characters')
    .describe('text to search for (matched literally)');
}

// ── Change actions (EX9.2) ──────────────────────────────

/** Every change call carries a reason; the owner reads it on the approval card. */
export const REASON = z.string().trim()
  .min(3, 'expected a short reason the owner will read (3–200 characters)')
  .max(200, 'expected a short reason the owner will read (3–200 characters)')
  .describe('why this change is needed — the owner reads this before allowing it');

/** The parameters a call to `def` takes: change actions add a required `reason`. */
export function callParams(def: ActionDef): ActionDef['params'] {
  return def.risk === 'change' ? def.params.extend({ reason: REASON }) : def.params;
}
