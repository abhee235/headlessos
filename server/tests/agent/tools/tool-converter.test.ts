// EX2.2: Tool Converter Tests
// @see docs/phases/phase-ex2.md — EX2.2

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toolsToOpenAIFunctions } from '../../../src/agent/tools/tool-converter.js';
import type { AgentTool, ToolResult } from '../../../src/agent/tools/types.js';

function makeTool(name: string, params: z.ZodType): AgentTool {
  return {
    name,
    description: `Tool: ${name}`,
    parameters: params,
    securityTier: 'read',
    execute: async (): Promise<ToolResult> => ({ success: true, output: '' }),
  };
}

describe('toolsToOpenAIFunctions', () => {
  it('converts a single tool to ChatCompletionTool format', () => {
    const tool = makeTool('test_tool', z.object({
      command: z.string(),
      timeout: z.number().optional(),
    }));

    const result = toolsToOpenAIFunctions([tool]);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('function');
    expect(result[0]!.function.name).toBe('test_tool');
    expect(result[0]!.function.description).toBe('Tool: test_tool');
    expect(result[0]!.function.parameters).toBeDefined();
    expect(typeof result[0]!.function.parameters).toBe('object');
  });

  it('converts multiple tools', () => {
    const tools = [
      makeTool('a', z.object({ x: z.string() })),
      makeTool('b', z.object({ y: z.number() })),
      makeTool('c', z.object({ z: z.boolean() })),
    ];

    const result = toolsToOpenAIFunctions(tools);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.function.name)).toEqual(['a', 'b', 'c']);
  });

  it('produces valid JSON Schema for parameters', () => {
    const tool = makeTool('cmd', z.object({
      command: z.string().describe('The command to run'),
      timeout: z.number().int().positive().optional().describe('Timeout in ms'),
    }));

    const result = toolsToOpenAIFunctions([tool]);
    const params = result[0]!.function.parameters as Record<string, unknown>;

    expect(params).toHaveProperty('type', 'object');
    expect(params).toHaveProperty('properties');

    const props = params.properties as Record<string, unknown>;
    expect(props).toHaveProperty('command');
    expect(props).toHaveProperty('timeout');
  });

  it('handles empty tool array', () => {
    expect(toolsToOpenAIFunctions([])).toEqual([]);
  });

  it('preserves tool descriptions', () => {
    const tool: AgentTool = {
      name: 'described_tool',
      description: 'A tool with a long description for the LLM',
      parameters: z.object({}),
      securityTier: 'local',
      execute: async () => ({ success: true, output: '' }),
    };

    const result = toolsToOpenAIFunctions([tool]);
    expect(result[0]!.function.description).toBe('A tool with a long description for the LLM');
  });
});
