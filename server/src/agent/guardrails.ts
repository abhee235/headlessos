// EX2.3: Three-Tier Security Guardrails
// @see docs/phases/phase-ex2.md — EX2.3
//
// Enforces read/write/deny tiers on all agent tool calls.
// Checked at tool execution layer — cannot be bypassed by LLM output.
//
// EX9.1 (ADR-024): tools that touch a server are catalog actions ('action' tier);
// the ActionRunner validates them, so they pass here. The free-form exec_command
// and sftp_read tools, and the read allowlist they used, are gone.
// EX9.2: the write tier is retired too — changes are change actions that wait for
// the owner's approval, so any 'write'-tier tool is refused here.

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

// ── Public API ──────────────────────────────────────────

/**
 * Check if a tool call is allowed by the three-tier guardrails.
 *
 * Flow: DENY → LOCAL → READ → WRITE
 *
 * 1. DENY check first — always checked, overrides everything
 * 2. Local tools — always allowed (no SSH involved)
 * 3. Read tier — check read allowlist
 * 4. Write tier — refused (EX9.2: changes go through change actions and approvals)
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

  // 4. Write tier — retired (EX9.2): changes are catalog change actions behind approvals
  if (tool.securityTier === 'write') {
    return {
      allowed: false,
      tier: 'write',
      reason: 'Write tools are retired; changes go through change actions that the owner approves',
    };
  }

  return { allowed: false, tier: 'deny', reason: 'Unknown security tier' };
}

// ── Exports for testing ─────────────────────────────────

export {
  DENY_COMMANDS,
  DENY_PATHS,
};
