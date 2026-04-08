// EX2.2: generate_schema tool (LOCAL tier)
// @see docs/phases/phase-ex2.md — EX2.2
//
// The "terminal tool" — when the agent calls this, it signals
// that the final DynamicViewSchema has been produced. The executor
// extracts this and returns it as the agent's output.

import { z } from 'zod';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { AgentTool, ToolContext, ToolResult } from './types.js';

const GenerateSchemaParams = z.object({
  schema: z.string().describe(
    'The FINAL complete DynamicViewSchema as a JSON string. Must be valid against DynamicViewSchema. ' +
    'This MUST contain ALL data from all sections — it is the complete, finished view. ' +
    'Call this ONLY after all update_view() calls and all data gathering is done.'
  ),
});

export const generateSchemaTool: AgentTool = {
  name: 'generate_schema',
  description:
    'Submit the FINAL complete DynamicViewSchema. This is the TERMINAL tool — calling it ends the session. ' +
    'The schema must contain ALL gathered data (every section fully populated). ' +
    'Only call this AFTER you have: (1) sent skeleton via update_view, (2) gathered all data, ' +
    '(3) sent progressive updates via update_view for each section. ' +
    'The schema is validated against DynamicViewSchema with Zod — if it fails, fix the errors and retry.',
  parameters: GenerateSchemaParams,
  securityTier: 'local',

  async execute(rawArgs: unknown, _context: ToolContext): Promise<ToolResult> {
    try {
      const args = GenerateSchemaParams.parse(rawArgs);

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(args.schema);
      } catch {
        return {
          success: false,
          output: '',
          error: 'Invalid JSON: could not parse the schema string. Use validate_schema to check for issues.',
        };
      }

      // Final validation against DynamicViewSchema
      const result = DynamicViewSchema.safeParse(parsed);

      if (!result.success) {
        const errors = result.error.issues.map(issue => {
          const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
          return `  - ${path}: ${issue.message} (${issue.code})`;
        });

        return {
          success: false,
          output: `Schema validation failed — cannot generate. Fix these errors:\n${errors.join('\n')}`,
          metadata: {
            errorCount: result.error.issues.length,
          },
          error: 'Schema validation failed',
        };
      }

      // Schema is valid — return it as the output
      // The executor will detect generate_schema calls and extract the result
      // IMPORTANT: metadata.schema MUST be set for the executor to detect completion
      return {
        success: true,
        output: JSON.stringify(result.data),
        metadata: {
          title: (result.data as Record<string, unknown>).title,
          isTerminalTool: true,
          schema: result.data,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `generate_schema failed: ${(err as Error).message}`,
      };
    }
  },
};
