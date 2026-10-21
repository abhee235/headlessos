// EX2.2: Agent Tools — Index
// @see docs/phases/phase-ex2.md — EX2.2, docs/phases/phase-ex9.md (EX9.0, EX9.1)

// ── Types ───────────────────────────────────────────────
export type { AgentTool, ToolContext, ToolResult, SecurityTier } from './types.js';

// ── Registry ────────────────────────────────────────────
export { ToolRegistry, createDefaultToolRegistry } from './tool-registry.js';

// ── Converter ───────────────────────────────────────────
export { toolsToOpenAIFunctions } from './tool-converter.js';

// ── Individual Tools ────────────────────────────────────
export { searchTemplatesTool } from './search-templates.js';
export { validateSchemaTool } from './validate-schema.js';
export { generateSchemaTool } from './generate-schema.js';
export { grepOutputTool } from './grep-output.js';
export { getServerContextTool, clearServerContextCache } from './get-server-context.js';
export { updateViewTool } from './update-view.js';

// ── All Default Tools ───────────────────────────────────
import { searchTemplatesTool } from './search-templates.js';
import { validateSchemaTool } from './validate-schema.js';
import { generateSchemaTool } from './generate-schema.js';
import { grepOutputTool } from './grep-output.js';
import { getServerContextTool } from './get-server-context.js';
import { updateViewTool } from './update-view.js';
import { readActionTools } from '../actions/tools.js';
import type { AgentTool } from './types.js';

/** Tools that never touch a server (plus get_server_context, which runs actions). */
export const LOCAL_AGENT_TOOLS: AgentTool[] = [
  searchTemplatesTool,
  validateSchemaTool,
  generateSchemaTool,
  grepOutputTool,
  getServerContextTool,
  updateViewTool,
];

/**
 * The default agent tools, registered by the UI Agent route.
 *
 * EX9.0/EX9.2: the EX2 write tools (exec_write_command, sftp_write) are gone —
 * nothing may change a server without the owner's approval (ADR-024); changes are
 * catalog change actions behind the approval gate.
 *
 * EX9.1: the free-form exec_command / sftp_read / sandbox_exec tools are gone.
 * Every read action in the catalog is a tool of its own; each run offers a
 * selected subset (ToolContext.offeredActions).
 */
export const ALL_AGENT_TOOLS: AgentTool[] = [
  ...LOCAL_AGENT_TOOLS,
  ...readActionTools(),
];
