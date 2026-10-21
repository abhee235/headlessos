// EX2.2: validate_schema tool (LOCAL tier)
// EX10.5: the schema is a JSON object (a string still works, repaired when broken)
// @see docs/phases/phase-ex2.md — EX2.2, docs/phases/phase-ex10.md §6
//
// Acts as an inline "linter" (from Aider's auto-lint pattern):
// validates a JSON object against DynamicViewSchema and returns
// detailed error messages so the LLM can fix issues.

import { z } from 'zod';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { AgentTool, ToolContext, ToolResult } from './types.js';
import { readViewArg, viewArgSchema } from './view-arg.js';

const ValidateSchemaParams = z.object({
  schema: viewArgSchema('The view to check against DynamicViewSchema, as a JSON object'),
});

export const validateSchemaTool: AgentTool = {
  name: 'validate_schema',
  description: 'Validate a JSON string against the DynamicViewSchema. Returns detailed error messages if validation fails, so you can fix issues before calling generate_schema. Use this as a "linter" to check your work before finalizing.',
  parameters: ValidateSchemaParams,
  securityTier: 'local',

  async execute(rawArgs: unknown, _context: ToolContext): Promise<ToolResult> {
    try {
      const args = ValidateSchemaParams.parse(rawArgs);

      // EX10.5: an object, or a string that parses (or can be repaired)
      const arg = readViewArg(args.schema, 'schema');
      if (!arg.ok) return { success: false, output: '', error: arg.error };
      const parsed = arg.value;

      // Validate against DynamicViewSchema
      const result = DynamicViewSchema.safeParse(parsed);

      if (result.success) {
        return {
          success: true,
          output: 'Schema is valid! All fields match DynamicViewSchema.',
          metadata: {
            title: (result.data as Record<string, unknown>).title,
          },
        };
      }

      // Format errors for the LLM
      const errors = result.error.issues.map(issue => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `  - ${path}: ${issue.message} (${issue.code})`;
      });

      return {
        success: false,
        output: `Schema validation failed with ${result.error.issues.length} error(s):\n${errors.join('\n')}`,
        metadata: {
          errorCount: result.error.issues.length,
          errors: result.error.issues.map(i => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `validate_schema failed: ${(err as Error).message}`,
      };
    }
  },
};
