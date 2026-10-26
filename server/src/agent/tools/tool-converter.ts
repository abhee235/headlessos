// EX2.2: Tool-to-OpenAI Converter
// @see docs/phases/phase-ex2.md — EX2.2

import { jsonSchemaOf } from '../../llm/json-schema.js';
import type { ChatCompletionTool } from '../../llm/provider.js';
import type { AgentTool } from './types.js';

/**
 * Convert AgentTool[] to OpenAI ChatCompletionTool[] format for function calling.
 * Each tool's Zod schema is converted to JSON Schema (M14.2: zod 4's own converter).
 */
export function toolsToOpenAIFunctions(tools: AgentTool[]): ChatCompletionTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      // EX10.5 follow-up: a tool may show the model a narrower schema than it accepts
      parameters: tool.inputSchema ?? toolParameters(tool),
    },
  }));
}

function toolParameters(tool: AgentTool): Record<string, unknown> {
  // EX9.1 / EX10.6: plain JSON Schema for every tool — optional fields stay optional and
  // defaults stay visible. The 'openAi' target marks every field required-but-nullable,
  // which makes models send null for every default (EX10.6: search_templates failed so).
  return jsonSchemaOf(tool.parameters);
}
