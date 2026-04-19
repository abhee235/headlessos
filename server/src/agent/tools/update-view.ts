// Progressive Rendering: update_view tool (LOCAL tier, non-terminal)
// @see docs/PROGRESSIVE_RENDERING.md
//
// Sends a partial DynamicView to the frontend during generation.
// Unlike generate_schema (terminal), this tool does NOT end the loop —
// the agent continues gathering data and calling update_view multiple
// times to progressively fill the UI.

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';

const UpdateViewParams = z.object({
  view: z.string().describe(
    'A DynamicViewSchema JSON string. Does NOT need to be complete — sections can be empty ' +
    '(empty arrays) and the frontend shows animated skeleton placeholders for them. ' +
    'Each call MUST include ALL previously gathered data plus any new data (cumulative). ' +
    'Call pattern: skeleton → +section1 → +section2 → ... → generate_schema(final).'
  ),
});

export const updateViewTool: AgentTool = {
  name: 'update_view',
  description:
    'Send a partial/in-progress view to the frontend for live progressive rendering. ' +
    'MUST be called at least once BEFORE gathering data (skeleton with empty sections). ' +
    'Then call again after EACH data-gathering batch to show the section filling in live. ' +
    'Each call is CUMULATIVE: include all previous data plus the newly gathered section. ' +
    'This is NOT the final output — use generate_schema() when all sections are complete.',
  parameters: UpdateViewParams,
  securityTier: 'local',

  async execute(rawArgs: unknown, _context: ToolContext): Promise<ToolResult> {
    try {
      const args = UpdateViewParams.parse(rawArgs);

      // Parse JSON loosely — we accept partial/incomplete views
      let parsed: unknown;
      try {
        parsed = JSON.parse(args.view);
      } catch {
        return {
          success: false,
          output: '',
          error: 'Invalid JSON: could not parse the view string. Check your JSON syntax.',
        };
      }

      // Basic shape check — must have at least a title or root
      if (typeof parsed !== 'object' || parsed === null) {
        return {
          success: false,
          output: '',
          error: 'View must be a JSON object with at least a "title" field.',
        };
      }

      const view = parsed as Record<string, unknown>;
      if (!view.title && !view.sidebarItems && !view.sections) {
        return {
          success: false,
          output: '',
          error: 'View must have at least a "title", "sidebarItems", or "sections" field.',
        };
      }

      // Return the partial view in metadata for the executor to detect
      // IMPORTANT: metadata.partialView MUST be set for the executor to emit partial_view event
      return {
        success: true,
        output: 'Partial view sent to frontend. Continue gathering data and call update_view again, or call generate_schema when done.',
        metadata: {
          partialView: parsed,
          isProgressiveUpdate: true,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `update_view failed: ${(err as Error).message}`,
      };
    }
  },
};
