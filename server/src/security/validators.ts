// M5.1: Security validators — command allowlists, input validation, shell escaping
// @see docs/SECURITY.md

import { posix } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface CommandRule {
  pattern: RegExp;
  risk: RiskLevel;
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

// ---------------------------------------------------------------------------
// Command Allowlist (from SECURITY.md)
// ---------------------------------------------------------------------------

export const ALLOWED_COMMANDS = new Map<string, CommandRule>([
  // System info (read-only, safe)
  ['hostname', { pattern: /^hostname$/, risk: 'none' }],
  ['uptime', { pattern: /^uptime(\s+-[ps])?$/, risk: 'none' }],
  ['uname', { pattern: /^uname(\s+-[a-z]+)+$/, risk: 'none' }],
  ['df', { pattern: /^df\s+-[hHPT]+(\s+--output=\S+)?$/, risk: 'none' }],
  ['free', { pattern: /^free\s+-[mhgb]$/, risk: 'none' }],
  ['ip', { pattern: /^ip\s+(-brief\s+)?addr/, risk: 'none' }],
  ['ip route', { pattern: /^ip\s+route(\s+show)?$/, risk: 'none' }],
  ['ps', { pattern: /^ps\s+(aux|ef)/, risk: 'none' }],
  ['cat /proc/cpuinfo', { pattern: /^cat\s+\/proc\/cpuinfo$/, risk: 'none' }],
  ['cat /proc/meminfo', { pattern: /^cat\s+\/proc\/meminfo$/, risk: 'none' }],
  ['cat /etc/os-release', { pattern: /^cat\s+\/etc\/os-release$/, risk: 'none' }],
  ['lsb_release', { pattern: /^lsb_release\s+-[adsc]+$/, risk: 'none' }],
  ['who', { pattern: /^who(\s+-[abduHlmpqrsTt]+)*$/, risk: 'none' }],
  ['w', { pattern: /^w$/, risk: 'none' }],
  ['last', { pattern: /^last(\s+-\d+)?(\s+-[aFdix]+)*$/, risk: 'none' }],
  ['ss', { pattern: /^ss\s+-[tlunpa4]+(\s+state\s+\S+)?$/, risk: 'none' }],
  ['findmnt', { pattern: /^findmnt\s+/, risk: 'none' }],
  ['du', { pattern: /^du\s+-[shx]+/, risk: 'none' }],
  ['swapon', { pattern: /^swapon\s+--show(=\S+)?$/, risk: 'none' }],
  ['lsblk', { pattern: /^lsblk(\s+-[flo]+)?$/, risk: 'none' }],
  ['journalctl', { pattern: /^journalctl\s+--no-pager/, risk: 'none' }],
  ['dmesg', { pattern: /^dmesg(\s+--time-format=\S+)?(\s+\|\s+tail\s+-n\s+\d+)?$/, risk: 'none' }],
  ['cat /var/log/syslog', { pattern: /^tail\s+-n\s+\d+\s+\/var\/log\/syslog$/, risk: 'none' }],

  // Package management (read-only)
  ['apt list', { pattern: /^apt\s+list\s+--installed/, risk: 'none' }],
  ['apt list upgradable', { pattern: /^apt\s+list\s+--upgradable/, risk: 'none' }],
  ['dpkg-query', { pattern: /^dpkg-query\s+-W/, risk: 'none' }],

  // Cron
  ['crontab', { pattern: /^crontab\s+-l(\s+-u\s+[\w.-]+)?$/, risk: 'none' }],
  ['cat /etc/crontab', { pattern: /^cat\s+\/etc\/crontab$/, risk: 'none' }],

  // Nginx (read-only)
  ['nginx -t', { pattern: /^(sudo\s+)?nginx\s+-t$/, risk: 'low' }],
  ['nginx sites', { pattern: /^ls\s+-la?\s+\/etc\/nginx\/sites-enabled\/?$/, risk: 'none' }],

  // SSH config (read-only)
  ['sshd_config', { pattern: /^(sudo\s+)?cat\s+\/etc\/ssh\/sshd_config$/, risk: 'none' }],

  // UFW
  ['ufw status', { pattern: /^(sudo\s+)?ufw\s+status(\s+verbose)?(\s+numbered)?$/, risk: 'none' }],
  ['ufw allow', { pattern: /^(sudo\s+)?ufw\s+allow\s+\d{1,5}(\/[a-z]+)?(\s+comment\s+'[^']*')?$/, risk: 'medium' }],
  ['ufw delete', { pattern: /^(sudo\s+)?ufw\s+delete\s+\d{1,3}$/, risk: 'high' }],
  ['ufw enable', { pattern: /^(sudo\s+)?ufw\s+--force\s+enable$/, risk: 'high' }],
  ['ufw disable', { pattern: /^(sudo\s+)?ufw\s+--force\s+disable$/, risk: 'high' }],

  // Fail2ban (read-only)
  ['fail2ban status', { pattern: /^(sudo\s+)?fail2ban-client\s+status(\s+[\w.-]+)?$/, risk: 'none' }],

  // SSL certs (read-only)
  ['openssl', { pattern: /^openssl\s+x509\s+-in\s+/, risk: 'none' }],

  // Docker (state changes)
  ['docker ps', { pattern: /^docker\s+ps/, risk: 'low' }],
  ['docker images', { pattern: /^docker\s+images/, risk: 'low' }],
  ['docker inspect', { pattern: /^docker\s+inspect\s+[a-f0-9]{12,64}$/, risk: 'low' }],
  ['docker stats', { pattern: /^docker\s+stats\s+--no-stream/, risk: 'low' }],
  ['docker start', { pattern: /^docker\s+start\s+[a-f0-9]{12,64}$/, risk: 'medium' }],
  ['docker stop', { pattern: /^docker\s+stop\s+[a-f0-9]{12,64}$/, risk: 'medium' }],
  ['docker restart', { pattern: /^docker\s+restart\s+[a-f0-9]{12,64}$/, risk: 'medium' }],
  ['docker pause', { pattern: /^docker\s+pause\s+[a-f0-9]{12,64}$/, risk: 'medium' }],
  ['docker unpause', { pattern: /^docker\s+unpause\s+[a-f0-9]{12,64}$/, risk: 'medium' }],
  ['docker rm', { pattern: /^docker\s+rm\s+[a-f0-9]{12,64}$/, risk: 'high' }],
  ['docker rmi', { pattern: /^docker\s+rmi\s+\S+$/, risk: 'high' }],
  ['docker logs', { pattern: /^docker\s+logs\s+/, risk: 'low' }],
  ['docker run', { pattern: /^docker\s+run\s+/, risk: 'high' }],

  // systemctl (service management)
  ['systemctl list-units', { pattern: /^systemctl\s+list-units/, risk: 'low' }],
  ['systemctl show', { pattern: /^systemctl\s+show\s+/, risk: 'low' }],
  ['systemctl status', { pattern: /^(sudo\s+)?systemctl\s+status\s+[\w@.-]+$/, risk: 'low' }],
  ['systemctl start', { pattern: /^(sudo\s+)?systemctl\s+start\s+[\w@.-]+$/, risk: 'high' }],
  ['systemctl stop', { pattern: /^(sudo\s+)?systemctl\s+stop\s+[\w@.-]+$/, risk: 'high' }],
  ['systemctl restart', { pattern: /^(sudo\s+)?systemctl\s+restart\s+[\w@.-]+$/, risk: 'high' }],
  ['systemctl enable', { pattern: /^(sudo\s+)?systemctl\s+enable\s+[\w@.-]+$/, risk: 'high' }],
  ['systemctl disable', { pattern: /^(sudo\s+)?systemctl\s+disable\s+[\w@.-]+$/, risk: 'high' }],

  // Process management
  ['kill', { pattern: /^kill\s+-\d{1,2}\s+\d{1,5}$/, risk: 'high' }],
]);

// ---------------------------------------------------------------------------
// Blocked Commands (NEVER allowed)
// ---------------------------------------------------------------------------

export const BLOCKED_COMMANDS: RegExp[] = [
  /\brm\s+-rf\s+\/($|\s)/,       // rm -rf /
  /\brm\s+-rf\s+\/\*/,           // rm -rf /*
  /\bmkfs\b/,                     // format filesystem
  /\bdd\s+.*of=\/dev\//,         // write to raw device
  /\b>\s*\/dev\/sd/,             // redirect to disk
  /\bshutdown\b/,                // shutdown server
  /\breboot\b/,                  // reboot server
  /\bchmod\s+777\s+\//,         // recursive chmod 777 from root
  /\bcurl\b.*\|\s*(ba)?sh/,     // pipe curl to bash/sh
  /\bwget\b.*\|\s*(ba)?sh/,     // pipe wget to bash/sh
  /:\(\)\s*\{.*\};\s*:/,         // fork bomb
  /\bpasswd\b/,                  // change password
  /\buseradd\b/,                 // add user
  /\buserdel\b/,                 // delete user
  /\bchown\s+-R\s+.*\s+\/$/,    // recursive chown from root
  /\b>\s*\/etc\//,              // redirect to /etc
  /\biptables\s+-F\b/,          // flush all iptables rules
];

// ---------------------------------------------------------------------------
// Blocked Paths (dangerous filesystem locations)
// ---------------------------------------------------------------------------

const BLOCKED_PATHS = [
  '/proc/sysrq-trigger',
  '/dev/sda',
  '/dev/vda',
  '/dev/nvme',
  '/dev/null',    // safe to read but block file ops
];

// ---------------------------------------------------------------------------
// Command Validation
// ---------------------------------------------------------------------------

/**
 * Check if a command matches any entry in the allowlist.
 * Returns the matching CommandRule, or null if not allowed.
 */
export function matchAllowedCommand(command: string): CommandRule | null {
  const trimmed = command.trim();
  for (const [, rule] of ALLOWED_COMMANDS) {
    if (rule.pattern.test(trimmed)) {
      return rule;
    }
  }
  return null;
}

/**
 * Check if a command matches any blocked pattern.
 * Returns true if the command is BLOCKED (dangerous).
 */
export function isBlockedCommand(command: string): boolean {
  const trimmed = command.trim();
  return BLOCKED_COMMANDS.some(pattern => pattern.test(trimmed));
}

/**
 * Validate a command against allowlist and blocklist.
 * Throws SecurityError if the command is not allowed.
 * Returns the CommandRule for the matched command.
 */
export function validateCommand(command: string): CommandRule {
  if (!command || typeof command !== 'string') {
    throw new SecurityError('Command must be a non-empty string');
  }

  const trimmed = command.trim();

  // Check blocklist first (takes precedence)
  if (isBlockedCommand(trimmed)) {
    throw new SecurityError(`Blocked command detected: ${trimmed.substring(0, 50)}...`);
  }

  // Check allowlist
  const rule = matchAllowedCommand(trimmed);
  if (!rule) {
    throw new SecurityError(`Command not in allowlist: ${trimmed.substring(0, 50)}...`);
  }

  return rule;
}

// ---------------------------------------------------------------------------
// Path Validation (enhanced — returns sanitized path or throws)
// ---------------------------------------------------------------------------

/**
 * Validate and sanitize a remote file path.
 * Returns the normalized path. Throws SecurityError on invalid input.
 */
export function validateAndSanitizePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new SecurityError('Path must be a non-empty string');
  }

  // Must be absolute
  if (!inputPath.startsWith('/')) {
    throw new SecurityError('Path must be absolute');
  }

  // Check for null bytes
  if (inputPath.includes('\0')) {
    throw new SecurityError('Null byte in path');
  }

  // Normalize
  const normalized = posix.normalize(inputPath);

  // Check for traversal AFTER normalization
  if (normalized.includes('..')) {
    throw new SecurityError('Path traversal detected');
  }

  // Block dangerous paths
  if (BLOCKED_PATHS.some(p => normalized.startsWith(p))) {
    throw new SecurityError('Access to this path is restricted');
  }

  return normalized;
}

/**
 * Validate a remote file path. Must be absolute and contain no traversal.
 * Boolean version for backward compatibility.
 */
export function validatePath(path: string): boolean {
  try {
    validateAndSanitizePath(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// ID / Name Validators (hardened)
// ---------------------------------------------------------------------------

/**
 * Validate a Docker container ID (hex characters only, 12-64 chars).
 */
export function validateContainerId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[a-f0-9]{12,64}$/.test(id);
}

/**
 * Validate a Docker image reference (name:tag or hex ID).
 * Allows: letters, digits, /, :, ., -, _, @
 */
export function validateDockerImageRef(ref: string): boolean {
  if (!ref || typeof ref !== 'string') return false;
  if (ref.length > 256) return false;
  // Block shell metacharacters
  if (/[;&|`$(){}\[\]!<>\\]/.test(ref)) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/.test(ref);
}

/**
 * Validate a PID (positive integer, 1-4194304 — max on 64-bit Linux).
 */
export function validatePid(pid: string): boolean {
  if (!pid || typeof pid !== 'string') return false;
  if (!/^\d+$/.test(pid)) return false;
  const num = parseInt(pid, 10);
  return num >= 1 && num <= 4194304;
}

/**
 * Validate a signal number (1-31).
 */
export function validateSignal(signal: number): boolean {
  return Number.isInteger(signal) && signal >= 1 && signal <= 31;
}

/**
 * Validate a service/unit name (alphanumeric + limited special chars, max 256 chars).
 * Allows @ for template units (e.g., getty@tty1.service).
 */
export function validateServiceName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 256) return false;
  return /^[a-zA-Z0-9@._-]+$/.test(name);
}

/**
 * Validate an ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS with optional timezone).
 */
export function validateISODate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?)?$/.test(dateStr);
}

/**
 * Validate a log source (whitelist).
 */
export function validateLogSource(source: string): source is 'journal' | 'dmesg' | 'syslog' {
  return source === 'journal' || source === 'dmesg' || source === 'syslog';
}

/**
 * Validate a positive integer string (e.g. for line counts).
 */
export function validatePositiveInt(value: string, max: number = 10000): boolean {
  if (!value || typeof value !== 'string') return false;
  if (!/^\d+$/.test(value)) return false;
  const num = parseInt(value, 10);
  return num >= 1 && num <= max;
}

// ---------------------------------------------------------------------------
// Shell Escaping
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe use in shell commands.
 * Uses the single-quote wrapping method — the safest approach.
 */
export function shellEscape(str: string): string {
  if (typeof str !== 'string') return "''";
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Sanitize an error message to avoid leaking sensitive system info.
 * Removes file paths, usernames, and other sensitive data from error strings.
 */
export function sanitizeErrorMessage(error: string): string {
  if (!error || typeof error !== 'string') return 'An unknown error occurred';

  let sanitized = error;

  // Remove absolute file paths
  sanitized = sanitized.replace(/\/[\w/.-]+/g, '[path]');

  // Remove potential usernames after "user" or "User"
  sanitized = sanitized.replace(/\b(user|User)\s+\S+/g, '$1 [redacted]');

  // Remove IP addresses
  sanitized = sanitized.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip]');

  // Limit length
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500) + '...';
  }

  return sanitized;
}
