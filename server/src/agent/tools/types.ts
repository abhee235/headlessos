// EX2.2: Agent Tool System — Types
// @see docs/phases/phase-ex2.md — EX2.2

import type { z } from 'zod';
import type { ConnectionManager } from '../../ssh/connection-manager.js';
import type { TemplateRegistry } from '../../dynamic-ui/template-registry.js';
import type { SandboxManager } from '../sandbox-manager.js';
import type { ActionRunner, ApprovalEvent } from '../actions/runner.js';
import type { ContextPlan } from '../context/plan.js';
import type { WorkingView } from '../../dynamic-ui/working-view.js';

/** EX10.10: one action result of the run, for widgets bound to it (ADR-026) */
export interface ActionResultRecord {
  action: string;
  params: Record<string, unknown>;
  ok: boolean;
  /** parse() result (EX10.8), when the action has a parser and it succeeded */
  data?: unknown;
  /** redacted, control characters stripped */
  stdout: string;
}

// ── Security Tier ───────────────────────────────────────

/** EX9.1: 'action' tools run catalog actions; the ActionRunner does the checking */
export type SecurityTier = 'read' | 'write' | 'local' | 'action';

// ── Tool Context ────────────────────────────────────────

/**
 * Shared context passed to every tool execution.
 * Contains the SSH connection manager, template registry, and cached outputs.
 */
export interface ToolContext {
  /** Active server ID for SSH operations */
  serverId: string;
  /** SSH connection manager for exec/sftp */
  ssh: ConnectionManager;
  /** Template registry for searching UI templates */
  templateRegistry: TemplateRegistry;
  /** Cached command outputs for grep_output (command → output) */
  previousOutputs: Map<string, string>;
  /** Optional sandbox manager for isolated CLI discovery (EX5-B.2) */
  sandboxManager?: SandboxManager;
  /** Active sandbox ID — set when sandbox mode is active */
  activeSandboxId?: string;
  /** EX9.1: runs catalog actions; action tools build one from `ssh` when absent */
  actions?: ActionRunner;
  /** EX9.1: agent run id (audit, approvals) */
  runId?: string;
  /** EX9.1: action ids offered to the model this run (others still run if called) */
  offeredActions?: ReadonlySet<string>;
  /** EX9.2: where approval cards for change actions go */
  onApproval?: (event: ApprovalEvent) => void;
  /** EX9.2: this run may propose change actions (each still waits for the owner) */
  allowChange?: boolean;
  /** EX9.4: characters of one result the model sees (EX10.3: the plan's resultChars) */
  modelOutputChars?: number;
  /** EX10.3: every budget of this run, from the model's window */
  plan?: ContextPlan;
  /** EX10.10: every action result of the run; widgets read their values from it */
  actionResults?: ActionResultRecord[];
  /** EX10.10: the view being built widget by widget (start_view, or the last update_view) */
  workingView?: WorkingView;
  /** EX10.9: this run refines the open view (loaded as workingView); the request that built it */
  followUp?: { prompt: string };
}

// ── Tool Result ─────────────────────────────────────────

/**
 * Standardized result returned by every tool execution.
 * Even failed/blocked tools return a ToolResult (never throw to caller).
 */
export interface ToolResult {
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

// ── Agent Tool Interface ────────────────────────────────

/**
 * Interface that all agent tools must implement.
 * Tools are registered in the ToolRegistry and converted to
 * OpenAI ChatCompletionTool format for function calling.
 */
export interface AgentTool {
  /** Unique tool name (matches OpenAI function name) */
  name: string;
  /**
   * EX10.5 follow-up: the JSON Schema shown to the model, when it should be narrower than
   * what `parameters` accepts at runtime (view tools show an object; a string still works).
   */
  inputSchema?: Record<string, unknown>;
  /** Human-readable description (sent to LLM) */
  description: string;
  /** Zod schema for tool arguments — converted to JSON Schema for the LLM */
  parameters: z.ZodType;
  /** Security tier: determines which guardrail checks apply */
  securityTier: SecurityTier;
  /** EX9.4: the tool changes the server (a change action); the loop guard resets after it */
  mutating?: boolean;
  /**
   * Execute the tool with validated arguments.
   * Must always return a ToolResult — never throw.
   * Blocked/failed calls return { success: false, error: '...' }.
   */
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}
