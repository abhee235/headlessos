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
      parameters: zodToJsonSchema(tool.parameters, {
        // Strip $schema and other top-level metadata for cleaner output
        $refStrategy: 'none',
        target: 'openAi',
      }) as Record<string, unknown>,
    },
  }));
}
