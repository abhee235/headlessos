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

  // Package management
  ['apt list', { pattern: /^apt\s+list\s+--installed/, risk: 'none' }],
  ['apt list upgradable', { pattern: /^apt\s+list\s+--upgradable/, risk: 'none' }],
  ['dpkg-query', { pattern: /^dpkg-query\s+-W/, risk: 'none' }],
  ['apt update', { pattern: /^(sudo\s+)?apt\s+update$/, risk: 'medium' }],
  ['apt install', { pattern: /^(sudo\s+)?apt\s+install\s+-y\s+[a-zA-Z0-9][a-zA-Z0-9.+\-:]*$/, risk: 'high' }],
  ['apt remove', { pattern: /^(sudo\s+)?apt\s+remove\s+-y\s+[a-zA-Z0-9][a-zA-Z0-9.+\-:]*$/, risk: 'high' }],
  ['apt upgrade', { pattern: /^(sudo\s+)?apt\s+upgrade\s+-y$/, risk: 'high' }],
  ['apt search', { pattern: /^apt\s+search\s+[a-zA-Z0-9][a-zA-Z0-9.+\-]*\s*/, risk: 'none' }],

  // Cron
  ['crontab', { pattern: /^crontab\s+-l(\s+-u\s+[\w.-]+)?$/, risk: 'none' }],
  ['crontab list 2>&1', { pattern: /^crontab\s+-l\s+2>&1$/, risk: 'none' }],
  ['cat /etc/crontab', { pattern: /^cat\s+\/etc\/crontab$/, risk: 'none' }],
  // NOTE: cron add/edit is performed directly by the serveradmin cron routes
  // (which build + shell-escape their own commands), NOT through validateCommand.
  // The old permissive `echo '…'` and `(crontab -l …` allowlist entries were only
  // reachable via dynamic-ui execute-action and let arbitrary `echo '…'` through —
  // removed to shrink that attack surface.

  // Nginx
  ['nginx -t', { pattern: /^(sudo\s+)?nginx\s+-t(\s+2>&1)?$/, risk: 'low' }],
  ['nginx sites', { pattern: /^ls\s+-1?a?\s+\/etc\/nginx\/sites-(available|enabled)\/?\s*(2>\/dev\/null)?$/, risk: 'none' }],
  ['nginx reload', { pattern: /^(sudo\s+)?nginx\s+-s\s+reload$/, risk: 'medium' }],
  ['nginx restart', { pattern: /^(sudo\s+)?systemctl\s+restart\s+nginx$/, risk: 'medium' }],
  ['nginx site enable', { pattern: /^(sudo\s+)?ln\s+-sf\s+\/etc\/nginx\/sites-available\/[\w.-]+\s+\/etc\/nginx\/sites-enabled\/[\w.-]+$/, risk: 'medium' }],
  ['nginx site disable', { pattern: /^(sudo\s+)?rm\s+\/etc\/nginx\/sites-enabled\/[\w.-]+$/, risk: 'medium' }],
  ['nginx site config', { pattern: /^(sudo\s+)?cat\s+\/etc\/nginx\/sites-available\/[\w.-]+$/, risk: 'low' }],

  // SSH config (read-only)
  ['sshd_config', { pattern: /^(sudo\s+)?cat\s+\/etc\/ssh\/sshd_config$/, risk: 'none' }],

  // UFW
  ['ufw status', { pattern: /^(sudo\s+)?ufw\s+status(\s+verbose)?(\s+numbered)?$/, risk: 'none' }],
  ['ufw allow', { pattern: /^(sudo\s+)?ufw\s+allow\s+\d{1,5}(\/[a-z]+)?(\s+comment\s+'[^']*')?$/, risk: 'medium' }],
  ['ufw deny', { pattern: /^(sudo\s+)?ufw\s+deny\s+\d{1,5}(\/[a-z]+)?(\s+comment\s+'[^']*')?$/, risk: 'medium' }],
  ['ufw advanced', { pattern: /^(sudo\s+)?ufw\s+(allow|deny)\s+from\s+[\d.\/]+\s+to\s+any(\s+port\s+[\d:]+)?(\s+proto\s+(tcp|udp))?(\s+comment\s+'[^']*')?$/, risk: 'medium' }],
  ['ufw app list', { pattern: /^(sudo\s+)?ufw\s+app\s+list$/, risk: 'none' }],
  ['ufw app allow', { pattern: /^(sudo\s+)?ufw\s+(allow|deny)\s+'[\w .\/-]+'$/, risk: 'medium' }],
  ['ufw delete', { pattern: /^(sudo\s+)?ufw\s+delete\s+\d{1,3}$/, risk: 'high' }],
  ['ufw enable', { pattern: /^(sudo\s+)?ufw\s+--force\s+enable$/, risk: 'high' }],
  ['ufw disable', { pattern: /^(sudo\s+)?ufw\s+--force\s+disable$/, risk: 'high' }],

  // Fail2ban (read + management)
  ['fail2ban status', { pattern: /^(sudo\s+)?fail2ban-client\s+status(\s+[\w.-]+)?$/, risk: 'none' }],
  ['fail2ban ban', { pattern: /^(sudo\s+)?fail2ban-client\s+set\s+[\w.-]+\s+banip\s+[\d.:a-fA-F]+$/, risk: 'high' }],
  ['fail2ban unban', { pattern: /^(sudo\s+)?fail2ban-client\s+set\s+[\w.-]+\s+unbanip\s+[\d.:a-fA-F]+$/, risk: 'high' }],
  ['fail2ban reload', { pattern: /^(sudo\s+)?fail2ban-client\s+reload$/, risk: 'high' }],

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

  // File search (read-only, limited depth)
  ['find', { pattern: /^find\s+\/[\w.\/\- ]*\s+-maxdepth\s+\d{1,2}\s+/, risk: 'low' }],
  // Trash management (HeadlessOS trash dir only)
  ['rm trash', { pattern: /^rm\s+-rf\s+'\/tmp\/\.headlessos-trash(\/[^']*)?'$/, risk: 'medium' }],
  ['mkdir trash', { pattern: /^mkdir\s+-p\s+'\/tmp\/\.headlessos-trash'$/, risk: 'low' }],]);

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
  // Metacharacter-free escalations (not caught by the chaining check):
  /\s-exec(dir)?\b/,            // find … -exec/-execdir → arbitrary exec
  /\bnsenter\b/,                // enter host namespaces (container escape)
  /\btar\b[\s\S]*--to-command/, // tar --to-command → arbitrary exec
  /\|\s*(ba|z|k|c|a)?sh\b/,     // pipe to a shell (generalizes curl|sh, wget|sh)
  // Dangerous `docker run` flags → host root / container escape:
  /\bdocker\s+run\b[\s\S]*(--privileged|--cap-add|--pid[ =]host|--network[ =]host|--ipc[ =]host|--device\b|--volume[= ]\/:|-v\s+\/:|\/var\/run\/docker\.sock)/,
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

  // Reject shell constructs that enable command chaining or substitution. No
  // allowlisted command legitimately uses these — they only appear in injection
  // attempts (e.g. `docker logs x; id`). Single `|`, `>`, and `2>&1` remain allowed.
  if (/[;`\r\n]/.test(trimmed) || /\$\(|\$\{/.test(trimmed) || /&&|\|\|/.test(trimmed)) {
    throw new SecurityError('Command contains disallowed shell metacharacters');
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

/**
 * Validate an IPv4 or IPv6 address.
 * Accepts standard dotted quad (1.2.3.4) and colon-hex IPv6 (::1, 2001:db8::1).
 */
export function validateIpAddress(ip: string): boolean {
  if (!ip || typeof ip !== 'string' || ip.length > 45) return false;
  // IPv4
  const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  if (ipv4.test(ip)) return true;
  // IPv6 (simplified — allows standard forms)
  const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6.test(ip);
}

/**
 * Validate a fail2ban jail name (alphanumeric + hyphen + underscore + dot).
 */
export function validateJailName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  return /^[\w.-]{1,64}$/.test(name);
}

/**
 * Validate CIDR notation (e.g. 192.168.1.0/24, 10.0.0.0/8).
 */
export function validateCidr(cidr: string): boolean {
  if (!cidr || typeof cidr !== 'string') return false;
  const match = cidr.match(/^([\d.]+)\/([\d]+)$/);
  if (!match) return false;
  const ip = match[1]!;
  const prefix = parseInt(match[2]!, 10);
  if (prefix < 0 || prefix > 32) return false;
  return validateIpAddress(ip);
}

/**
 * Validate a port range string (e.g. "8000:9000") or single port.
 */
export function validatePortRange(portRange: string): boolean {
  if (!portRange || typeof portRange !== 'string') return false;
  // single port
  if (/^\d+$/.test(portRange)) {
    const p = parseInt(portRange, 10);
    return p >= 1 && p <= 65535;
  }
  // range format: start:end
  const rangeMatch = portRange.match(/^(\d+):(\d+)$/);
  if (!rangeMatch) return false;
  const start = parseInt(rangeMatch[1]!, 10);
  const end = parseInt(rangeMatch[2]!, 10);
  return start >= 1 && start <= 65535 && end >= 1 && end <= 65535 && start < end;
}

/**
 * Validate a cron schedule string.
 * Accepts: numbers, asterisk, ranges (1-5), lists (1,3,5), steps, specials like @reboot.
 */
export function validateCronSchedule(schedule: string): boolean {
  if (!schedule || typeof schedule !== 'string' || schedule.trim().length === 0) return false;
  const s = schedule.trim();
  // Special strings
  if (/^@(reboot|hourly|daily|weekly|monthly|yearly|annually)$/.test(s)) return true;
  // Standard 5-field cron expression
  const fields = s.split(/\s+/);
  if (fields.length !== 5) return false;
  const fieldPattern = /^(\*|\d{1,3})([-/]\d{1,3})?(,(\*|\d{1,3})([-/]\d{1,3})?)*$/;
  return fields.every(f => fieldPattern.test(f!));
}

/**
 * Validate a cron command string.
 * Blocks dangerous patterns but allows typical cron commands.
 */
export function validateCronCommand(cmd: string): boolean {
  if (!cmd || typeof cmd !== 'string' || cmd.trim().length === 0 || cmd.length > 1024) return false;
  // Block extremely dangerous standalone commands
  const dangerous = /^\s*(rm\s+-rf\s+\/|mkfs\b|dd\s+if=|:\(\)\s*\{|shutdown\b|reboot\b|init\s+0|halt\b)/;
  return !dangerous.test(cmd);
}

/**
 * Validate a cron job index (0-based, integer).
 */
export function validateCronIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < 1000;
}

/**
 * Validate a Linux username.
 * Lowercase alphanumeric + hyphen + underscore, 1-32 chars, must start with letter or underscore.
 */
export function validateUsername(name: string): boolean {
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 32) return false;
  // Standard Linux username rules: start with letter or _, then alphanumeric + _ + -
  return /^[a-z_][a-z0-9_-]*$/.test(name);
}

/**
 * Validate a TTY name (e.g., pts/0, tty1).
 */
export function validateTty(tty: string): boolean {
  if (!tty || typeof tty !== 'string' || tty.trim().length === 0 || tty.length > 32) return false;
  return /^[a-zA-Z0-9/]+$/.test(tty);
}

/**
 * Validate a Linux group name.
 */
export function validateGroupName(name: string): boolean {
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 32) return false;
  return /^[a-z_][a-z0-9_-]*$/.test(name);
}

/**
 * Validate a Debian/Ubuntu package name.
 * Allows alphanumeric, hyphen, dot, plus, colon (for arch qualifiers like libc6:amd64).
 */
export function validatePackageName(name: string): boolean {
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 200) return false;
  // Must not contain shell metacharacters, path separators, or spaces
  if (/[\s\/\\;|&$`(){}\[\]!#~<>?*'"\\]/.test(name)) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9.+\-:]*$/.test(name);
}

/**
 * Validate a package search query.
 * Alphanumeric, hyphen, dot, plus only. Max 100 chars.
 */
export function validateSearchQuery(query: string): boolean {
  if (!query || typeof query !== 'string' || query.trim().length === 0 || query.length > 100) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9.+\-]*$/.test(query);
}

/**
 * Validate an nginx site name (alphanumeric + hyphen + dot only, no path traversal).
 */
export function validateNginxSiteName(name: string): boolean {
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 128) return false;
  // No path separators, no traversal, no shell metacharacters
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  return /^[\w.-]+$/.test(name);
}

/**
 * Validate a UFW app profile name (alphanumeric + space + dot + slash + hyphen).
 */
export function validateUfwAppName(name: string): boolean {
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 128) return false;
  return /^[\w .\/-]+$/.test(name);
}

// ── M8.7: Network Management validators ─────────────────────────────────

/**
 * Validate a hostname per RFC 1123.
 * Up to 253 chars, labels separated by dots, each label 1-63 chars, alphanumeric + hyphen,
 * no leading/trailing hyphens.
 */
export function validateHostname(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string' || hostname.length === 0 || hostname.length > 253) return false;
  const labels = hostname.split('.');
  return labels.every(label =>
    label.length >= 1 && label.length <= 63 &&
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label),
  );
}

/**
 * Validate a Linux network interface name (e.g., eth0, ens33, wlan0, docker0, lo, br-abc123).
 * Alphanumeric + hyphen + dot + underscore, 1-15 chars (IFNAMSIZ limit).
 */
export function validateInterfaceName(name: string): boolean {
  if (!name || typeof name !== 'string' || name.length === 0 || name.length > 15) return false;
  return /^[a-zA-Z0-9][\w.-]*$/.test(name);
}

// ═══════════════════════════════════════════════════════════════════════════
// M8.8: Log Enhancement Validators
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a journalctl priority level (0-7).
 * 0=emerg, 1=alert, 2=crit, 3=err, 4=warning, 5=notice, 6=info, 7=debug
 */
export function validateLogPriority(priority: string): boolean {
  if (!priority || typeof priority !== 'string') return false;
  return /^[0-7]$/.test(priority);
}

/**
 * Validate a grep pattern for log search — must be safe for shell usage.
 * Allows alphanumeric, spaces, basic punctuation. No shell metacharacters.
 * Max 200 chars.
 */
export function validateGrepPattern(pattern: string): boolean {
  if (!pattern || typeof pattern !== 'string') return false;
  if (pattern.length > 200) return false;
  // Reject shell injection characters
  if (/[;|&`$(){}!<>\\]/.test(pattern)) return false;
  // Must have at least one non-whitespace char
  if (!/\S/.test(pattern)) return false;
  return true;
}

/**
 * Validate an ISO date string or journalctl-accepted date format.
 * Accepts: "2025-01-15", "2025-01-15T10:30:00", "today", "yesterday", "1 hour ago", etc.
 * Max 50 chars, no shell injection.
 */
export function validateDateParam(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  if (value.length > 50) return false;
  // Reject shell injection characters
  if (/[;|&`$(){}!<>\\]/.test(value)) return false;
  // Must match ISO date, or relative time words
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) return true;
  if (/^(today|yesterday)$/i.test(value)) return true;
  if (/^\d+\s+(second|minute|hour|day|week|month)s?\s+ago$/i.test(value)) return true;
  return false;
}
