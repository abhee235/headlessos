// EX2.2: Agent Tools — Index
// @see docs/phases/phase-ex2.md — EX2.2

// ── Types ───────────────────────────────────────────────
export type { AgentTool, ToolContext, ToolResult, SecurityTier } from './types.js';

// ── Registry ────────────────────────────────────────────
export { ToolRegistry, createDefaultToolRegistry } from './tool-registry.js';

// ── Converter ───────────────────────────────────────────
export { toolsToOpenAIFunctions } from './tool-converter.js';

// ── Individual Tools ────────────────────────────────────
export { execCommandTool } from './exec-command.js';
export { execWriteCommandTool } from './exec-write.js';
export { sftpReadTool } from './sftp-read.js';
export { sftpWriteTool } from './sftp-write.js';
export { searchTemplatesTool } from './search-templates.js';
export { validateSchemaTool } from './validate-schema.js';
export { generateSchemaTool } from './generate-schema.js';
export { grepOutputTool } from './grep-output.js';
export { getServerContextTool, clearServerContextCache } from './get-server-context.js';
export { updateViewTool } from './update-view.js';
export { sandboxExecTool } from './sandbox-exec.js';

// ── All Default Tools ───────────────────────────────────
import { execCommandTool } from './exec-command.js';
import { sftpReadTool } from './sftp-read.js';
import { searchTemplatesTool } from './search-templates.js';
import { validateSchemaTool } from './validate-schema.js';
import { generateSchemaTool } from './generate-schema.js';
import { grepOutputTool } from './grep-output.js';
import { getServerContextTool } from './get-server-context.js';
import { updateViewTool } from './update-view.js';
import type { AgentTool } from './types.js';

/**
 * The default agent tools, registered by the UI Agent route.
 *
 * EX9.0: the write tools (exec_write_command, sftp_write) are not registered —
 * nothing may change a server without the owner's approval (ADR-024). EX9.2
 * replaces them with change actions behind an approval gate.
 */
export const ALL_AGENT_TOOLS: AgentTool[] = [
  execCommandTool,
  sftpReadTool,
  searchTemplatesTool,
  validateSchemaTool,
  generateSchemaTool,
  grepOutputTool,
  getServerContextTool,
  updateViewTool,
];
