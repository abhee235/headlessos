// Progressive Rendering: update_view tool (LOCAL tier, non-terminal)
// EX10.5: the view is a JSON object (a string still works, repaired when broken); the
// answer is short and never echoes the view back into the model's context
// @see docs/PROGRESSIVE_RENDERING.md, docs/phases/phase-ex10.md §6
//
// Sends a partial DynamicView to the frontend during generation.
// Unlike generate_schema (terminal), this tool does NOT end the loop —
// the agent continues gathering data and calling update_view multiple
// times to progressively fill the UI.

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';
import { describeCounts, readViewArg, viewArgSchema, viewCounts, viewInputSchema } from './view-arg.js';

const VIEW_DESCRIPTION =
  'The DynamicViewSchema view as a JSON object (not a string). Sections may be empty (children: []) — ' +
  'the frontend shows skeleton placeholders for them. ' +
  'Each call MUST include ALL previously gathered data plus any new data (cumulative). ' +
  'Call pattern: skeleton → +section1 → +section2 → ... → generate_schema(final).';

const UpdateViewParams = z.object({
  view: viewArgSchema(VIEW_DESCRIPTION),
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
  inputSchema: viewInputSchema('view', VIEW_DESCRIPTION),
  securityTier: 'local',

  async execute(rawArgs: unknown, _context: ToolContext): Promise<ToolResult> {
    try {
      const args = UpdateViewParams.parse(rawArgs);

      // EX10.5: an object, or a string that parses (or can be repaired)
      const arg = readViewArg(args.view, 'view');
      if (!arg.ok) return { success: false, output: '', error: arg.error };
      const parsed = arg.value;

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
        output: `View updated: ${describeCounts(viewCounts(parsed))}.${arg.repaired ? ' (Its JSON was broken and has been repaired; send an object next time.)' : ''} Gather the next section, or call generate_schema when every section is filled.`,
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
