// EX2.2: validate_schema tool (LOCAL tier)
// @see docs/phases/phase-ex2.md — EX2.2
//
// Acts as an inline "linter" (from Aider's auto-lint pattern):
// validates a JSON object against DynamicViewSchema and returns
// detailed error messages so the LLM can fix issues.

import { z } from 'zod';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { AgentTool, ToolContext, ToolResult } from './types.js';

const ValidateSchemaParams = z.object({
  schema: z.string().describe('JSON string to validate against DynamicViewSchema'),
});

export const validateSchemaTool: AgentTool = {
  name: 'validate_schema',
  description: 'Validate a JSON string against the DynamicViewSchema. Returns detailed error messages if validation fails, so you can fix issues before calling generate_schema. Use this as a "linter" to check your work before finalizing.',
  parameters: ValidateSchemaParams,
  securityTier: 'local',

  async execute(rawArgs: unknown, _context: ToolContext): Promise<ToolResult> {
    try {
      const args = ValidateSchemaParams.parse(rawArgs);

      // Parse the JSON string first
      let parsed: unknown;
      try {
        parsed = JSON.parse(args.schema);
      } catch {
        return {
          success: false,
          output: '',
          error: 'Invalid JSON: could not parse the schema string. Check for syntax errors.',
        };
      }

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
