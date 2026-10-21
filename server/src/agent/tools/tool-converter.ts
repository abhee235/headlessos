// EX2.2: Tool-to-OpenAI Converter
// @see docs/phases/phase-ex2.md — EX2.2

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ChatCompletionTool } from '../../llm/provider.js';
import type { AgentTool } from './types.js';

/**
 * Convert AgentTool[] to OpenAI ChatCompletionTool[] format for function calling.
 * Each tool's Zod schema is converted to JSON Schema via zod-to-json-schema.
 */
export function toolsToOpenAIFunctions(tools: AgentTool[]): ChatCompletionTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toolParameters(tool),
    },
  }));
}

function toolParameters(tool: AgentTool): Record<string, unknown> {
  // EX9.1: action params keep plain JSON Schema — optional fields stay optional and
  // defaults stay visible. The 'openAi' target marks every field required-but-nullable,
  // which makes models send null for every default.
  const schema = zodToJsonSchema(tool.parameters, {
    $refStrategy: 'none',
    target: tool.securityTier === 'action' ? 'jsonSchema7' : 'openAi',
  }) as Record<string, unknown>;
  // Strip $schema and other top-level metadata for cleaner output
  delete schema.$schema;
  return schema;
}
