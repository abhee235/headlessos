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

// ── All Default Tools ───────────────────────────────────
import { execCommandTool } from './exec-command.js';
import { execWriteCommandTool } from './exec-write.js';
import { sftpReadTool } from './sftp-read.js';
import { sftpWriteTool } from './sftp-write.js';
import { searchTemplatesTool } from './search-templates.js';
import { validateSchemaTool } from './validate-schema.js';
import { generateSchemaTool } from './generate-schema.js';
import { grepOutputTool } from './grep-output.js';
import { getServerContextTool } from './get-server-context.js';
import type { AgentTool } from './types.js';

/**
 * All 9 default agent tools.
 * Register these in a ToolRegistry for use by the orchestrator.
 */
export const ALL_AGENT_TOOLS: AgentTool[] = [
  execCommandTool,
  execWriteCommandTool,
  sftpReadTool,
  sftpWriteTool,
  searchTemplatesTool,
  validateSchemaTool,
  generateSchemaTool,
  grepOutputTool,
  getServerContextTool,
];
