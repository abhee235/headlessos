// M12.1: CommandPolicy — central enforcement chokepoint for SSH command execution
// @see docs/phases/phase-12.md, docs/DECISIONS.md (ADR-023)
//
// Wraps the existing ALLOWED_COMMANDS / BLOCKED_COMMANDS from security/validators.ts
// and exposes them as a service so ConnectionManager.exec() can enforce policy in
// exactly one place. This eliminates per-route bypass risk.
//
// Modes (set via HEADLESS_POLICY_MODE env var or ServiceContainer registration):
//   - "enforce" : reject unknown commands (allowlist required) AND block dangerous ones
//   - "audit"   : block dangerous commands; LOG (not block) unknown commands.
//                 This is the default during the M7 migration so existing routes
//                 keep working while we incrementally tighten allowlist coverage.
//   - "off"     : block dangerous commands only (no allowlist check, no logs).
//                 For tests that need to run arbitrary commands.
//
// Blocked commands are ALWAYS rejected, regardless of mode.

import { BaseService } from '../base-service.js';
import {
  ALLOWED_COMMANDS,
  BLOCKED_COMMANDS,
  isBlockedCommand,
  matchAllowedCommand,
  SecurityError,
  type CommandRule,
  type RiskLevel,
} from '../../security/validators.js';

export type PolicyMode = 'enforce' | 'audit' | 'off';

export interface PolicyDecision {
  allowed: boolean;
  /** Reason for rejection, when `allowed === false` */
  reason?: 'blocked' | 'not-in-allowlist' | 'invalid-input';
  message?: string;
  /** Risk level when matched against the allowlist */
  risk?: RiskLevel;
  /** Internal name of the matched allowlist rule, useful for audit logs */
  matchedRule?: string;
}

export interface PolicyAuditEvent {
  command: string;
  decision: PolicyDecision;
  serverId?: string;
  timestamp: string;
}

const DEFAULT_MODE: PolicyMode = (() => {
  const raw = process.env.HEADLESS_POLICY_MODE?.toLowerCase();
  if (raw === 'enforce' || raw === 'audit' || raw === 'off') return raw;
  // Strict shortcut: HEADLESS_POLICY_STRICT=true → enforce
  if (process.env.HEADLESS_POLICY_STRICT === 'true') return 'enforce';
  return 'audit';
})();

/**
 * CommandPolicy — single source of truth for "is this SSH command allowed?".
 *
 * Used by ConnectionManager.exec() to gate every outbound command. Domain
 * services should NOT call this directly; they should pass commands through
 * exec() and trust the chokepoint.
 */
export class CommandPolicy extends BaseService {
  private mode: PolicyMode = DEFAULT_MODE;
  private auditLog: PolicyAuditEvent[] = [];
  private auditLogCap = 500;
  /** Commands that triggered an audit-mode warning, deduped to keep logs clean */
  private warnedCommands = new Set<string>();

  protected async _construct(): Promise<void> {
    // No cross-service deps. Mode is read from env at construction time.
  }

  /** Override the mode (mainly for tests). */
  setMode(mode: PolicyMode): void {
    this.mode = mode;
  }

  getMode(): PolicyMode {
    return this.mode;
  }

  /**
   * Evaluate a command without throwing. Useful for previews / dry-runs.
   */
  evaluate(command: string): PolicyDecision {
    if (!command || typeof command !== 'string') {
      return {
        allowed: false,
        reason: 'invalid-input',
        message: 'Command must be a non-empty string',
      };
    }

    const trimmed = command.trim();

    // Blocklist always wins, in every mode.
    if (isBlockedCommand(trimmed)) {
      return {
        allowed: false,
        reason: 'blocked',
        message: `Blocked command pattern: ${truncate(trimmed)}`,
      };
    }

    if (this.mode === 'off') {
      return { allowed: true };
    }

    const matched = matchAllowedCommand(trimmed);
    if (matched) {
      return {
        allowed: true,
        risk: matched.risk,
        matchedRule: findRuleName(matched),
      };
    }

    if (this.mode === 'enforce') {
      return {
        allowed: false,
        reason: 'not-in-allowlist',
        message: `Command not in allowlist: ${truncate(trimmed)}`,
      };
    }

    // audit mode: allow but flag
    return {
      allowed: true,
      risk: 'low',
      message: 'Not in allowlist (audit mode — logged)',
    };
  }

  /**
   * Throws SecurityError if the command should be rejected.
   * Records every call in the audit log.
   */
  assertAllowed(command: string, serverId?: string): CommandRule | null {
    const decision = this.evaluate(command);

    // Defensive: avoid TypeError on non-string input when recording.
    const safeCommand =
      typeof command === 'string'
        ? command.length > 200
          ? command.slice(0, 200) + '...'
          : command
        : String(command);

    this.recordAudit({
      command: safeCommand,
      decision,
      serverId,
      timestamp: new Date().toISOString(),
    });

    if (!decision.allowed) {
      throw new SecurityError(decision.message ?? 'Command rejected by policy');
    }

    // In audit mode, warn once per unique command that's not allowlisted.
    if (
      this.mode === 'audit' &&
      decision.message?.startsWith('Not in allowlist') &&
      !this.warnedCommands.has(command)
    ) {
      this.warnedCommands.add(command);
      // eslint-disable-next-line no-console
      console.warn(
        `[CommandPolicy] audit: command not in allowlist (will be required in enforce mode): ${truncate(command)}`,
      );
    }

    return decision.risk
      ? ({ pattern: /./, risk: decision.risk } as CommandRule)
      : null;
  }

  /** Quick boolean check. */
  isAllowed(command: string): boolean {
    return this.evaluate(command).allowed;
  }

  /** Risk level for an allowed command. Returns 'high' for unknown rejects. */
  getRiskLevel(command: string): RiskLevel {
    const d = this.evaluate(command);
    if (!d.allowed) return 'high';
    return d.risk ?? 'low';
  }

  /** Bounded audit log for diagnostics. */
  getAuditLog(): readonly PolicyAuditEvent[] {
    return this.auditLog;
  }

  getStats(): {
    mode: PolicyMode;
    totalEvaluations: number;
    rejections: number;
    auditWarnings: number;
    allowlistSize: number;
    blocklistSize: number;
  } {
    let rejections = 0;
    let auditWarnings = 0;
    for (const event of this.auditLog) {
      if (!event.decision.allowed) rejections++;
      else if (event.decision.message?.startsWith('Not in allowlist'))
        auditWarnings++;
    }
    return {
      mode: this.mode,
      totalEvaluations: this.auditLog.length,
      rejections,
      auditWarnings,
      allowlistSize: ALLOWED_COMMANDS.size,
      blocklistSize: BLOCKED_COMMANDS.length,
    };
  }

  private recordAudit(event: PolicyAuditEvent): void {
    this.auditLog.push(event);
    if (this.auditLog.length > this.auditLogCap) {
      this.auditLog.splice(0, this.auditLog.length - this.auditLogCap);
    }
  }
}

function truncate(s: string): string {
  return s.length > 80 ? s.slice(0, 80) + '...' : s;
}

function findRuleName(rule: CommandRule): string | undefined {
  for (const [name, r] of ALLOWED_COMMANDS) {
    if (r === rule) return name;
  }
  return undefined;
}
