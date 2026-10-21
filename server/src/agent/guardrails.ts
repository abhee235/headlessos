// EX2.3: Three-Tier Security Guardrails
// @see docs/phases/phase-ex2.md — EX2.3
//
// Enforces read/write/deny tiers on all agent tool calls.
// Checked at tool execution layer — cannot be bypassed by LLM output.
//
// EX9.1 (ADR-024): tools that touch a server are catalog actions ('action' tier);
// the ActionRunner validates them, so they pass here. The free-form exec_command
// and sftp_read tools, and the read allowlist they used, are gone.

import type { AgentTool } from './tools/types.js';

// ── Types ───────────────────────────────────────────────

export type SecurityTier = 'read' | 'write' | 'deny';

export interface GuardrailResult {
  allowed: boolean;
  tier: SecurityTier;
  reason?: string;
}

// ── DENY Lists (always blocked — hardcoded, no override) ─

const DENY_COMMANDS: RegExp[] = [
  // Filesystem destruction
  /\brm\s+(-[rRfdi]+\s+)*\//,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/sd/,
  /\brm\b.*--no-preserve-root/,

  // System shutdown
  /\bshutdown\b/,
  /\breboot\b/,
  /\binit\s+[06]\b/,
  /\bhalt\b/,
  /\bpoweroff\b/,

  // Dangerous permissions
  /\bchmod\s+(-R\s+)?777\s+\//,
  /\bchown\s+-R\s+.*\s+\//,

  // Remote code execution
  /\bwget\b.*\|\s*(sh|bash)/,
  /\bcurl\b.*\|\s*(sh|bash)/,

  // User/auth modification
  /\bpasswd\b/,
  /\busermod\b/,
  /\buserdel\b/,
  /\bsudo\s+su\b/,
  /\bvisudo\b/,

  // Fork bomb
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,

  // Critical system files
  />\s*\/etc\/(passwd|shadow|sudoers|fstab)/,

  // iptables flush (would lock out SSH)
  /\biptables\s+-F\b/,
  /\bufw\s+disable\b/,
];

const DENY_PATHS: RegExp[] = [
  /^\/etc\/(passwd|shadow|sudoers)$/,
  /^\/etc\/ssh\/sshd_config$/,
  /^\/boot\//,
  /^\/proc\//,
  /^\/sys\//,
  /^\/dev\//,
];

// ── WRITE Allowlists ────────────────────────────────────

const WRITE_COMMAND_ALLOWLIST: RegExp[] = [
  // Service management
  /^systemctl\s+(restart|reload|start|stop|enable|disable)\s+[\w@.-]+$/,
  /^service\s+[\w.-]+\s+(restart|reload|start|stop)$/,

  // Nginx
  /^nginx\s+-s\s+(reload|reopen|stop|quit)$/,

  // Docker
  /^docker\s+(start|stop|restart|pause|unpause)\s+[\w.-]+$/,
  /^docker\s+compose\s+(up|down|restart|stop)\s+/,

  // Package management (install/update only, not remove)
  /^apt\s+(install|update|upgrade)\s+/,
  /^apt-get\s+(install|update|upgrade)\s+/,
  /^yum\s+(install|update)\s+/,
  /^dnf\s+(install|update)\s+/,

  // Cron
  /^crontab\s+-l$/,
  /^crontab\s+-e$/,

  // Process signals
  /^kill\s+-\d+\s+\d+$/,
  /^kill\s+-s\s+\w+\s+\d+$/,
  /^killall\s+[\w.-]+$/,
];

const WRITE_PATH_ALLOWLIST: RegExp[] = [
  // Config directories
  /^\/etc\/nginx\//,
  /^\/etc\/apache2\//,
  /^\/etc\/systemd\//,
  /^\/etc\/cron\.d\//,
  /^\/etc\/logrotate\.d\//,
  /^\/etc\/supervisor\//,

  // Docker configs
  /^\/opt\/[\w.-]+\/docker-compose\.ya?ml$/,
  /^\/home\/[\w.-]+\/[\w.-]+\/docker-compose\.ya?ml$/,

  // Application configs (in user home or /opt)
  /^\/home\/[\w.-]+\/\.[\w.-]+/,
  /^\/opt\/[\w.-]+\/config/,

  // Temp directory
  /^\/tmp\//,

  // Web roots
  /^\/var\/www\//,
];

// ── Internal Check Functions ────────────────────────────

function isDeniedCommand(command: string): boolean {
  return DENY_COMMANDS.some(re => re.test(command));
}

function isDeniedPath(path: string): boolean {
  const normalized = path.replace(/\/+/g, '/');
  if (normalized.includes('..')) return true;
  // Block control characters (newlines, tabs, null bytes, etc.)
  if (/[\x00-\x1f\x7f]/.test(normalized)) return true;
  return DENY_PATHS.some(re => re.test(normalized));
}

function isWriteCommand(command: string): boolean {
  const trimmed = command.trim();
  // Write commands must not contain pipes for safety
  if (trimmed.includes('|')) return false;
  return WRITE_COMMAND_ALLOWLIST.some(re => re.test(trimmed));
}

function isWritePath(path: string): boolean {
  const normalized = path.replace(/\/+/g, '/');
  if (normalized.includes('..')) return false;
  return WRITE_PATH_ALLOWLIST.some(re => re.test(normalized));
}

// ── Tool Argument Extraction ────────────────────────────

function extractCommand(args: unknown): string | null {
  if (typeof args === 'object' && args !== null && 'command' in args) {
    const cmd = (args as Record<string, unknown>).command;
    return typeof cmd === 'string' ? cmd : null;
  }
  return null;
}

function extractPath(args: unknown): string | null {
  if (typeof args === 'object' && args !== null && 'path' in args) {
    const p = (args as Record<string, unknown>).path;
    return typeof p === 'string' ? p : null;
  }
  return null;
}

// ── Guardrail Check (DENY → LOCAL → READ → WRITE) ──────

function isDenied(tool: AgentTool, args: unknown): { denied: boolean; reason: string } {
  const command = extractCommand(args);
  const path = extractPath(args);

  // Check command against deny list
  if (command && isDeniedCommand(command)) {
    return { denied: true, reason: `Denied command: matches deny pattern` };
  }

  // Check path against deny list
  if (path && isDeniedPath(path)) {
    return { denied: true, reason: `Denied path: ${path} is in protected paths` };
  }

  return { denied: false, reason: '' };
}

function isReadAllowed(tool: AgentTool, _args: unknown): { allowed: boolean; reason: string } {
  // get_server_context → always allowed (it runs catalog actions)
  if (tool.name === 'get_server_context') {
    return { allowed: true, reason: '' };
  }

  return { allowed: false, reason: `Unknown read tool: ${tool.name}` };
}

function isWriteAllowed(tool: AgentTool, args: unknown): { allowed: boolean; reason: string } {
  // exec_write_command → check write command allowlist
  if (tool.name === 'exec_write_command') {
    const command = extractCommand(args);
    if (!command) return { allowed: false, reason: 'No command provided' };
    if (isWriteCommand(command)) return { allowed: true, reason: '' };
    return { allowed: false, reason: `Command not in write allowlist: ${command}` };
  }

  // sftp_write → check write path allowlist
  if (tool.name === 'sftp_write') {
    const path = extractPath(args);
    if (!path) return { allowed: false, reason: 'No path provided' };
    if (!path.startsWith('/')) return { allowed: false, reason: 'Path must be absolute' };
    if (path.includes('..')) return { allowed: false, reason: 'Path traversal not allowed' };
    if (isWritePath(path)) return { allowed: true, reason: '' };
    return { allowed: false, reason: `Path not in write allowlist: ${path}` };
  }

  return { allowed: false, reason: `Unknown write tool: ${tool.name}` };
}

// ── Public API ──────────────────────────────────────────

/**
 * Check if a tool call is allowed by the three-tier guardrails.
 *
 * Flow: DENY → LOCAL → READ → WRITE
 *
 * 1. DENY check first — always checked, overrides everything
 * 2. Local tools — always allowed (no SSH involved)
 * 3. Read tier — check read allowlist
 * 4. Write tier — check write allowlist
 */
export function checkGuardrails(tool: AgentTool, args: unknown): GuardrailResult {
  // 0. EX9.1: catalog actions — the ActionRunner validates params and builds the command
  if (tool.securityTier === 'action') {
    return { allowed: true, tier: 'read' };
  }

  // 1. DENY check first — always checked, overrides everything
  const denyResult = isDenied(tool, args);
  if (denyResult.denied) {
    return { allowed: false, tier: 'deny', reason: denyResult.reason };
  }

  // 2. Local tools — always allowed (template search, schema validate/generate, grep)
  if (tool.securityTier === 'local') {
    return { allowed: true, tier: 'read' };
  }

  // 3. Read tier — check read allowlist
  if (tool.securityTier === 'read') {
    const readResult = isReadAllowed(tool, args);
    return readResult.allowed
      ? { allowed: true, tier: 'read' }
      : { allowed: false, tier: 'read', reason: readResult.reason };
  }

  // 4. Write tier — check write allowlist
  if (tool.securityTier === 'write') {
    const writeResult = isWriteAllowed(tool, args);
    return writeResult.allowed
      ? { allowed: true, tier: 'write' }
      : { allowed: false, tier: 'write', reason: writeResult.reason };
  }

  return { allowed: false, tier: 'deny', reason: 'Unknown security tier' };
}

// ── Exports for testing ─────────────────────────────────

export {
  DENY_COMMANDS,
  DENY_PATHS,
  WRITE_COMMAND_ALLOWLIST,
  WRITE_PATH_ALLOWLIST,
};
