// EX2.2: grep_output tool (LOCAL tier)
// @see docs/phases/phase-ex2.md — EX2.2
//
// Operates on previously fetched command outputs (stored in context.previousOutputs).
// No SSH needed — purely local regex search.

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './types.js';

const GrepOutputParams = z.object({
  pattern: z.string().describe('Regex pattern to search for in previously fetched command output'),
  command: z.string().optional()
    .describe('Search within output of a specific command. If omitted, searches all cached outputs.'),
  caseInsensitive: z.boolean().optional()
    .describe('Whether the regex match should be case insensitive (default: true)'),
});

export const grepOutputTool: AgentTool = {
  name: 'grep_output',
  description: 'Search within previously fetched command outputs using a regex pattern. This does not run any SSH commands — it searches the cached outputs from prior exec_command calls. Use this to find specific information without re-running commands.',
  parameters: GrepOutputParams,
  securityTier: 'local',

  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const args = GrepOutputParams.parse(rawArgs);
      const { pattern, command, caseInsensitive = true } = args;

      // Build regex
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g');
      } catch {
        return {
          success: false,
          output: '',
          error: `Invalid regex pattern: ${pattern}`,
        };
      }

      // Determine which outputs to search
      const outputs: Array<{ command: string; output: string }> = [];
      if (command) {
        const output = context.previousOutputs.get(command);
        if (!output) {
          return {
            success: false,
            output: '',
            error: `No cached output for command: ${command}. Run exec_command first.`,
            metadata: {
              availableCommands: Array.from(context.previousOutputs.keys()),
            },
          };
        }
        outputs.push({ command, output });
      } else {
        for (const [cmd, output] of context.previousOutputs.entries()) {
          outputs.push({ command: cmd, output });
        }
      }

      if (outputs.length === 0) {
        return {
          success: false,
          output: '',
          error: 'No cached command outputs available. Run exec_command first to gather data.',
        };
      }

      // Search
      const matches: Array<{ command: string; line: string; lineNumber: number }> = [];
      for (const { command: cmd, output } of outputs) {
        const lines = output.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i]!)) {
            matches.push({ command: cmd, line: lines[i]!, lineNumber: i + 1 });
          }
          // Reset regex lastIndex since we're using global flag
          regex.lastIndex = 0;
        }
      }

      if (matches.length === 0) {
        return {
          success: true,
          output: `No matches found for pattern: ${pattern}`,
          metadata: {
            matchCount: 0,
            searchedCommands: outputs.map(o => o.command),
          },
        };
      }

      // Format output (limit to first 50 matches to avoid overwhelming the LLM)
      const maxMatches = 50;
      const limited = matches.slice(0, maxMatches);
      const output = limited.map(m =>
        `[${m.command}:${m.lineNumber}] ${m.line}`
      ).join('\n');

      const truncatedNote = matches.length > maxMatches
        ? `\n... (${matches.length - maxMatches} more matches truncated)`
        : '';

      return {
        success: true,
        output: `${output}${truncatedNote}`,
        metadata: {
          matchCount: matches.length,
          searchedCommands: outputs.map(o => o.command),
          truncated: matches.length > maxMatches,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `grep_output failed: ${(err as Error).message}`,
      };
    }
  },
};
