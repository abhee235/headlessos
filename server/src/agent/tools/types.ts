// EX2.2: Agent Tool System — Types
// @see docs/phases/phase-ex2.md — EX2.2

import type { z } from 'zod';
import type { ConnectionManager } from '../../ssh/connection-manager.js';
import type { TemplateRegistry } from '../../dynamic-ui/template-registry.js';
import type { SandboxManager } from '../sandbox-manager.js';

// ── Security Tier ───────────────────────────────────────

export type SecurityTier = 'read' | 'write' | 'local';

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
  /** Human-readable description (sent to LLM) */
  description: string;
  /** Zod schema for tool arguments — converted to JSON Schema for the LLM */
  parameters: z.ZodType;
  /** Security tier: determines which guardrail checks apply */
  securityTier: SecurityTier;
  /**
   * Execute the tool with validated arguments.
   * Must always return a ToolResult — never throw.
   * Blocked/failed calls return { success: false, error: '...' }.
   */
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}
