// EX2.2: Shared Command Allowlists
// @see docs/phases/phase-ex2.md — EX2.2
//
// EX9.1 (ADR-024): the read-only allowlist for model-written commands is gone —
// agents run catalog actions (agent/actions/). What remains guards the
// owner-driven form write-back (agent/writeback.ts) and the unregistered
// EX2 write tools until EX9.2 replaces them with change actions.

// ── Write Allowlist ─────────────────────────────────────

export const AGENT_WRITE_ALLOWLIST: RegExp[] = [
  // Docker write operations
  /^docker\s+(start|stop|restart|pause|unpause)\s+[a-zA-Z0-9_.-]+$/,
  /^docker\s+compose\s+(up|down|restart|pull)(\s+-d)?$/,

  // Systemd write operations
  /^systemctl\s+(start|stop|restart|reload|enable|disable)\s+[a-zA-Z0-9_@.-]+$/,

  // Nginx test & reload
  /^nginx\s+-t$/,
  /^nginx\s+-s\s+reload$/,

  // Package managers (update/install)
  /^apt\s+(update|upgrade|install)\s+/,
  /^apt-get\s+(update|upgrade|install)\s+/,
  /^yum\s+(update|install)\s+/,
  /^dnf\s+(update|install)\s+/,

  // Process signals
  /^kill\s+-\d+\s+\d+$/,
  /^kill\s+-s\s+\w+\s+\d+$/,
  /^killall\s+[a-zA-Z0-9_.-]+$/,
];

// ── Blocked Patterns (always denied) ────────────────────

export const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+(-[rfdi]+\s+)*\//,
  /mkfs/,
  /dd\s+if=/,
  /shutdown/,
  /reboot/,
  /init\s+[06]/,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,
  /chmod\s+(-R\s+)?777\s+\//,
  />\s*\/dev\/sd/,
  /wget.*\|\s*(sh|bash)/,
  /curl.*\|\s*(sh|bash)/,
  /\brm\b.*--no-preserve-root/,
  />\s*\/etc\//,
  /sudo\s+su/,
  /passwd/,
  // Escalations that bypass the read-only intent (H2):
  /\s-exec(dir)?\b/,                 // find … -exec/-execdir → arbitrary exec
  /\bnsenter\b/,                     // host namespace escape
  /\btar\b[\s\S]*--to-command/,     // tar --to-command → arbitrary exec
  /\bawk\b[\s\S]*system\s*\(/,      // awk system() → exec
  /\bawk\b[\s\S]*\|\s*&/,           // awk getline from a coprocess/pipe
  /\bgetline\b/,                     // awk getline cmd
  /\bdocker\s+run\b[\s\S]*(--privileged|--cap-add|--pid[ =]host|--network[ =]host|--ipc[ =]host|--device\b|--volume[= ]\/:|-v\s+\/:|\/var\/run\/docker\.sock)/,
];

// ── Write-Allowed Paths (for SFTP write) ────────────────

export const WRITE_ALLOWED_PATHS: RegExp[] = [
  /^\/home\/[^/]+\//,                // User home directories
  /^\/tmp\//,                        // Temp directory
  /^\/var\/www\//,                   // Web roots
  /^\/etc\/nginx\/sites-(available|enabled)\//,  // Nginx configs
  /^\/opt\//,                        // Optional software
];

// Files that must NEVER be written, even inside an allowed root — writing these
// creates a persistent backdoor or privilege escalation (M3).
const WRITE_DENIED_PATTERNS: RegExp[] = [
  /(^|\/)\.ssh(\/|$)/,               // ~/.ssh (authorized_keys, config, keys)
  /(^|\/)authorized_keys2?$/,
  /(^|\/)\.(bashrc|bash_profile|bash_login|bash_logout|profile|zshrc|zprofile|zlogin|zshenv|kshrc|cshrc|tcshrc|login|logout|inputrc|netrc|pgpass|git-credentials)$/,
  /(^|\/)sudoers(\.d)?(\/|$)/,
  /(^|\/)crontab$/,
];

// ── Validation Functions ────────────────────────────────

/**
 * Check if a command is in the write allowlist.
 * Write commands do NOT support piped commands for safety.
 */
export function isWriteCommandAllowed(cmd: string): boolean {
  const trimmed = cmd.trim();

  for (const blocked of BLOCKED_PATTERNS) {
    if (blocked.test(trimmed)) return false;
  }

  // Write commands must not contain pipes
  if (trimmed.includes('|')) return false;

  return AGENT_WRITE_ALLOWLIST.some(re => re.test(trimmed));
}

/**
 * Check if a path is in the write-allowed paths list.
 */
export function isWritePathAllowed(path: string): boolean {
  const normalized = path.replace(/\/+/g, '/');

  // Block path traversal
  if (normalized.includes('..')) return false;

  // Block sensitive files even inside allowed roots (persistence/backdoor).
  if (WRITE_DENIED_PATTERNS.some(re => re.test(normalized))) return false;

  return WRITE_ALLOWED_PATHS.some(re => re.test(normalized));
}
