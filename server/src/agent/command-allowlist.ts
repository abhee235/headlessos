// EX2.2: Shared Command Allowlists
// @see docs/phases/phase-ex2.md — EX2.2
//
// Extracted from investigation-agent.ts so both the investigation agent
// and the new tool system can reuse the same allowlists.

// ── Read-Only Allowlist (ADR-014) ───────────────────────

export const AGENT_READ_ONLY_ALLOWLIST: RegExp[] = [
  // System info
  /^cat\s+\/proc\/(cpuinfo|meminfo|loadavg|version|stat|uptime|filesystems|mounts|swaps)$/,
  /^cat\s+\/etc\/(os-release|hostname|hosts|resolv\.conf|fstab|passwd|group|shadow|sudoers)$/,
  /^head\s+-n\s+\d+\s+/,
  /^tail\s+-n\s+\d+\s+/,
  /^tail\s+-f?\s+-n\s+\d+\s+/,
  /^wc\s+(-[lcw]\s+)?/,
  /^grep\s+(-[rinlcEP]+\s+)*('|")?.+\2\s+/,
  /^find\s+\/[^\s;|&]*\s+/,
  /^ls\s+(-[laRhtr1]+\s+)*(\/[^\s;|&]*)?$/,
  /^stat\s+/,
  /^file\s+/,

  // Disk & storage
  /^df\s+(-[hHTPi]+\s*)+((--output=\S+\s*)*(-x\s+\S+\s*)*)?$/,
  /^du\s+(-[shx]+\s+)*(\/[^\s;|&]*)?$/,
  /^lsblk(\s+(-[flo]+))?$/,
  /^findmnt(\s+(-[lnr]+))?/,
  /^swapon\s+--show/,

  // Memory & CPU
  /^free\s+(-[mhgb]+\s*)+$/,
  /^vmstat(\s+\d+\s+\d+)?$/,
  /^iostat(\s+-[dxc]+)?(\s+\d+\s+\d+)?$/,
  /^top\s+-b\s*-?n\s*1/,
  /^top\s+-bn\s*1/,
  /^uptime$/,
  /^lscpu$/,
  /^nproc$/,
  /^lshw(\s+-short)?$/,
  /^lspci(\s+-[v]+)?$/,
  /^sensors$/,

  // Processes
  /^ps\s+(aux|ef|axo\s+|-eo\s+)/,
  /^pgrep\s+/,

  // Network
  /^ip\s+((-brief|-br|-o|-j)\s+)*(-[46]\s+)*(a(ddr(ess)?)?|r(oute)?|l(ink)?|n(eigh)?)(\s+show)?/,
  /^ss\s+(-[tlunpa46]+\s*)+/,
  /^netstat\s+(-[tlunpa]+\s*)+$/,
  /^ifconfig(\s+(-a|[a-z0-9]+))?$/,
  /^nslookup\s+/,
  /^dig\s+/,
  /^ping\s+-c\s*[1-5]\s+/,
  /^curl\s+(-[sISLkvH]+\s+)*https?:\/\//,
  /^wget\s+(-q\s+)?-O\s*-\s+/,

  // System
  /^hostname$/,
  /^uname\s+-[a-z]+$/,
  /^who(\s+-[a-z]+)*$/,
  /^w$/,
  /^id(\s+\S+)?$/,
  /^timedatectl(\s+status)?$/,
  /^hostnamectl(\s+status)?$/,
  /^last(\s+-\d+)?(\s+-[a-z]+)*$/,
  /^dmesg(\s+--time-format=\S+)?(\s+\|\s+tail\s+-n\s+\d+)?$/,

  // Logs
  /^journalctl\s+--no-pager/,
  /^journalctl\s+(-b|--boot)(\s+--no-pager)?/,
  /^journalctl\s+-u\s+\S+/,
  /^tail\s+-n\s+\d+\s+\/var\/log\//,
  /^cat\s+\/var\/log\//,

  // Docker (read-only)
  /^docker\s+ps(\s+-[aq]+)*(\s+--format\s+['"]?[^;|&]*['"]?)?(\s+--no-trunc)?$/,
  /^docker\s+images(\s+--format\s+['"]?[^;|&]*['"]?)?$/,
  /^docker\s+info(\s+--format\s+['"]?[^;|&]*['"]?)?$/,
  /^docker\s+inspect\s+/,
  /^docker\s+logs\s+(--tail\s+\d+\s+)?/,
  /^docker\s+stats\s+--no-stream/,
  /^docker\s+version(\s+--format\s+['"]?[^;|&]*['"]?)?$/,
  /^docker\s+compose\s+(ps|ls|config)/,
  /^docker\s+network\s+(ls|inspect)(\s+--format\s+['"]?[^;|&]*['"]?)?/,
  /^docker\s+volume\s+ls(\s+--format\s+['"]?[^;|&]*['"]?)?$/,

  // Systemd (read-only)
  /^systemctl\s+(status|list-units|list-unit-files|is-active|is-enabled|show)\s+/,
  /^systemctl\s+list-units(\s+--type=\S+)?(\s+--state=\S+)?(\s+--no-pager)?(\s+--no-legend)?$/,
  /^systemctl\s+--failed(\s+--no-pager)?(\s+--no-legend)?$/,
  /^systemctl\s+list-units\s+--state=failed(\s+--no-pager)?(\s+--no-legend)?$/,

  // Nginx (read-only)
  /^nginx\s+-t/,
  /^nginx\s+-T$/,

  // Git (read-only)
  /^git\s+(log|status|branch|remote|diff|show)/,
];

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
];

// ── Safe Pipe Filters ───────────────────────────────────

export const PIPE_FILTERS: RegExp[] = [
  /^grep\s+/,
  /^head\s+/,
  /^tail\s+/,
  /^sort(\s+-[a-zA-Z0-9]+)*$/,
  /^uniq(\s+-[cd]+)?$/,
  /^wc\s+/,
  /^awk\s+/,
  /^sed\s+/,
  /^cut\s+/,
  /^tr\s+/,
  /^column\s+/,
  /^less$/,
  /^cat$/,
];

// ── Write-Allowed Paths (for SFTP write) ────────────────

export const WRITE_ALLOWED_PATHS: RegExp[] = [
  /^\/home\/[^/]+\//,                // User home directories
  /^\/tmp\//,                        // Temp directory
  /^\/var\/www\//,                   // Web roots
  /^\/etc\/nginx\/sites-(available|enabled)\//,  // Nginx configs
  /^\/opt\//,                        // Optional software
];

// ── Validation Functions ────────────────────────────────

/**
 * Check if a command is in the read-only allowlist.
 * Supports piped commands: each segment must be allowed or a safe filter.
 */
export function isReadCommandAllowed(cmd: string): boolean {
  const trimmed = cmd.trim();

  if (!trimmed) return false;

  for (const blocked of BLOCKED_PATTERNS) {
    if (blocked.test(trimmed)) return false;
  }

  // Split on && and ; first (each chained command is validated independently)
  const chainedCommands = trimmed.split(/\s*(?:&&|;)\s*/).filter(Boolean);

  if (chainedCommands.length === 0) return false;

  for (const chainCmd of chainedCommands) {
    const segments = chainCmd.trim().split(/\s*\|\s*/);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!.trim();
      if (i === 0) {
        const allowed = AGENT_READ_ONLY_ALLOWLIST.some(re => re.test(seg));
        if (!allowed) return false;
      } else {
        const isFilter = PIPE_FILTERS.some(re => re.test(seg));
        if (!isFilter) return false;
      }
    }
  }

  return true;
}

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

  return WRITE_ALLOWED_PATHS.some(re => re.test(normalized));
}
