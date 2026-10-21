// EX2.2: generate_schema tool (LOCAL tier)
// EX10.5: the schema is a JSON object (a string still works); the answer does not echo it
// @see docs/phases/phase-ex2.md — EX2.2, docs/phases/phase-ex10.md §6
//
// The "terminal tool" — when the agent calls this, it signals
// that the final DynamicViewSchema has been produced. The executor
// extracts this and returns it as the agent's output.

import { z } from 'zod';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { AgentTool, ToolContext, ToolResult } from './types.js';
import { describeCounts, readViewArg, viewArgSchema, viewCounts } from './view-arg.js';

const GenerateSchemaParams = z.object({
  schema: viewArgSchema(
    'The FINAL complete DynamicViewSchema view as a JSON object. Must be valid against DynamicViewSchema. ' +
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

      // EX10.5: an object, or a string that parses (or can be repaired)
      const arg = readViewArg(args.schema, 'schema');
      if (!arg.ok) return { success: false, output: '', error: arg.error };
      const parsed = arg.value;

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
        output: `Schema accepted: ${describeCounts(viewCounts(result.data))}.`,
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
