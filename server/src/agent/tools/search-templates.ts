// EX2.2: search_templates tool (LOCAL tier)
// @see docs/phases/phase-ex2.md — EX2.2

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';

const SearchTemplatesParams = z.object({
  query: z.string().optional()
    .describe('Free-text search query to match against template names and descriptions'),
  tag: z.string().optional()
    .describe('Filter templates by tag (e.g., "docker", "system", "nginx")'),
  command: z.string().optional()
    .describe('Match templates by the command pattern they handle'),
});

export const searchTemplatesTool: AgentTool = {
  name: 'search_templates',
  description: 'Search the template library for UI templates. Templates are pre-built DynamicView layouts for common server views. Use this to find relevant templates before generating a new schema from scratch.',
  parameters: SearchTemplatesParams,
  securityTier: 'local',

  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const args = SearchTemplatesParams.parse(rawArgs);
      const { query, tag, command } = args;

      if (!query && !tag && !command) {
        return {
          success: false,
          output: '',
          error: 'At least one of query, tag, or command must be provided',
        };
      }

      let results: Array<{ id: string; name?: string; description?: string; tags?: string[] }> = [];

      if (tag) {
        const tagResults = context.templateRegistry.searchByTag(tag);
        results.push(...tagResults.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          tags: t.tags,
        })));
      }

      if (query) {
        const queryResults = context.templateRegistry.search(query);
        const existingIds = new Set(results.map(r => r.id));
        for (const t of queryResults) {
          if (!existingIds.has(t.id)) {
            results.push({
              id: t.id,
              name: t.name,
              description: t.description,
              tags: t.tags,
            });
          }
        }
      }

      if (command) {
        const matchResults = context.templateRegistry.matchCommand(command);
        const existingIds = new Set(results.map(r => r.id));
        for (const match of matchResults) {
          if (!existingIds.has(match.template.id)) {
            results.push({
              id: match.template.id,
              name: match.template.name,
              description: match.template.description,
              tags: match.template.tags,
            });
          }
        }
      }

      if (results.length === 0) {
        return {
          success: true,
          output: 'No matching templates found.',
          metadata: { count: 0 },
        };
      }

      const output = results.map(t =>
        `- ${t.id}: ${t.name || '(unnamed)'}${t.description ? ` — ${t.description}` : ''}${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}`
      ).join('\n');

      return {
        success: true,
        output: `Found ${results.length} template(s):\n${output}`,
        metadata: {
          count: results.length,
          templateIds: results.map(t => t.id),
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `search_templates failed: ${(err as Error).message}`,
      };
    }
  },
};
