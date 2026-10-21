// EX2.6: Post-Generation Reflector
// @see docs/phases/phase-ex2.md — EX2.6
//
// Optional reasoning-model quality review for complex UIs. Runs AFTER
// the reactive executor produces a schema. Skipped for simple display-only UIs.
// Inspired by Aider's typed reflection errors (actualData, didYouMean).

import { z } from 'zod';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import type { ModelRouter } from '../llm/model-router.js';
import type { PlannerHints } from './planner.js';
import { withSpan } from '../observatory/context.js';
import type { ContextPlan } from './context/plan.js';
import { headAndTail } from './actions/tools.js';

/** EX10.3: the most of one tool output the reviewer sees */
const REVIEW_CHARS_PER_OUTPUT = 2_000;

// ── Reflection Schema ──

export const ReflectionIssueSchema = z.object({
  severity: z.enum(['critical', 'minor', 'suggestion']),
  widget: z.string().nullable().optional().describe('Which widget has the issue (by title or index)'),
  description: z.string(),
  fix: z.string().describe('Specific instruction for fixing this issue'),
  actualData: z.string().nullable().optional().describe('What the data actually looks like'),
  didYouMean: z.string().nullable().optional().describe('Suggested correction — "did you mean X?"'),
});

export const ReflectionSchema = z.object({
  approved: z.boolean().describe('Is the schema good enough to show the user?'),
  issues: z.array(ReflectionIssueSchema).describe('Issues found with the schema. Empty if approved.'),
  summary: z.string().describe('One-line quality summary'),
});

export type Reflection = z.infer<typeof ReflectionSchema>;
export type ReflectionIssue = z.infer<typeof ReflectionIssueSchema>;

// ── System Prompt ──

const REFLECTOR_SYSTEM_PROMPT = `You are the quality reviewer for HeadlessOS's UI Generation Agent.
You evaluate whether a generated DynamicViewSchema is good enough to show the user.

NOTE: The schema has ALREADY passed Zod validation. You are checking semantic quality, not syntax.

## Check for:
1. Does the schema accurately represent the collected data?
2. Are widget types appropriate? (tables for lists, stat-cards for metrics, card-list for entity cards, forms for editable configs)
3. If the user requested an interactive/editable UI, are there form widgets with writeBack configs?
4. Are there any missing data points that were in the collected output but not in the schema?
5. Is the layout sensible? (not too many widgets, logical grouping, good use of tabs for complex data within sections)
6. Are badge variants correct? (success for running/active, destructive for error/failed)
7. Are table features used well? (filters for large tables, emptyState for potentially-empty tables, actionStyle:"dropdown" for 3+ actions, rich columns for compound cells)
8. Are card-list items used for entity-like data (network interfaces, services, devices) instead of plain tables?
9. Do tabs items have appropriate icons?
10. Does the schema have correctly structured sidebarItems and sections? Every section should have a matching sidebarItem.
11. Are ALL collected data sections represented in the schema? Every action result should appear in at least one widget — missing data is a critical issue.

## Typed Feedback (inspired by Aider)
When reporting issues, include:
- actualData: what the data actually looks like (e.g., "CPU shows 85%")
- didYouMean: a specific suggestion (e.g., "widget.type should be 'form' not 'table' since user wants to edit")

## When to REJECT:
- Widget type doesn't match the data (e.g., chart for non-numeric data)
- User asked for editable UI but no form widgets generated
- Critical data missing from the output
- writeBack config incorrect or missing for interactive UIs
- Schema is mostly empty or has placeholder data despite data being collected

## When to APPROVE:
- Widgets match the data types
- Layout is reasonable
- Most data is represented
- Minor imperfections are OK (suggest improvements but still approve)`;

// ── Reflector ──

export interface ReflectorOptions {
  /** Override system prompt for testing */
  systemPrompt?: string;
}

export class PostGenerationReflector {
  private modelRouter: ModelRouter;
  private systemPrompt: string;

  constructor(modelRouter: ModelRouter, options?: ReflectorOptions) {
    this.modelRouter = modelRouter;
    this.systemPrompt = options?.systemPrompt ?? REFLECTOR_SYSTEM_PROMPT;
  }

  /**
   * Evaluate a generated DynamicViewSchema for semantic quality.
   *
   * Returns a Reflection with approval status, issues, and summary.
   * The schema has already passed Zod validation in the executor loop —
   * this checks whether the schema makes sense for the user's request.
   *
   * @param originalRequest - The user's original natural language request
   * @param hints - PlannerHints from the planning phase
   * @param collectedData - Map of tool outputs collected during generation
   * @param generatedSchema - The DynamicView JSON to review
   * @param plan - EX10.3: the run's context plan; bounds what the reviewer is sent
   */
  async reflect(
    originalRequest: string,
    hints: PlannerHints,
    collectedData: Map<string, string>,
    generatedSchema: DynamicView,
    plan?: ContextPlan,
  ): Promise<Reflection> {
    return withSpan('PostReflector.reflect', 'CHAIN', async () => {
      const inputPayload = JSON.stringify({
        request: originalRequest,
        hints: {
          intent: hints.intent,
          interactivityLevel: hints.interactivityLevel,
          expectedWidgets: hints.expectedWidgets,
          securityRequirements: hints.securityRequirements,
          suggestedLayout: hints.suggestedLayout,
          suggestedSections: hints.suggestedSections,
        },
        dataCollected: this.summarizeCollectedData(collectedData, plan, JSON.stringify(generatedSchema).length),
        generatedSchema,
      });

      const result = await this.modelRouter.reason<Reflection>({
        rawOutput: inputPayload,
        command: 'agent-reflect',
        schema: ReflectionSchema,
        systemPrompt: this.systemPrompt,
      });

      return this.normalizeReflection(result.data);
    }, { input: originalRequest });
  }

  /**
   * Quick check: should post-reflection be skipped?
   * Based on PlannerHints.skipPostReflection and complexity.
   */
  shouldSkip(hints: PlannerHints): boolean {
    return hints.skipPostReflection === true;
  }

  // ── Internal ──

  /**
   * Summarize collected data for the reflector prompt.
   * EX10.3: each output keeps up to 2,000 chars (60% head / 40% tail), and all of them
   * together fit in half the plan's effective window, less the view under review.
   * Without a plan, 500 chars each (EX2).
   */
  private summarizeCollectedData(data: Map<string, string>, plan?: ContextPlan, schemaChars = 0): Record<string, string> {
    const summary: Record<string, string> = {};
    if (data.size === 0) return summary;
    const total = plan ? Math.max(4_000, Math.floor(plan.effectiveWindow * 4 * 0.5) - schemaChars) : Infinity;
    const each = plan ? Math.max(300, Math.min(REVIEW_CHARS_PER_OUTPUT, Math.floor(total / data.size))) : 500;

    for (const [key, value] of data) {
      if (value.length <= each) {
        summary[key] = value;
      } else if (plan) {
        summary[key] = `${headAndTail(value, each).text} (${value.length} chars total)`;
      } else {
        summary[key] = value.substring(0, each) + `... (${value.length} chars total)`;
      }
    }

    return summary;
  }

  /**
   * Normalize the reflection response:
   * - If approved, ensure issues array is empty or only has suggestions/minor
   * - If rejected, ensure at least one issue exists
   */
  private normalizeReflection(reflection: Reflection): Reflection {
    const normalized = { ...reflection };

    if (normalized.approved) {
      // If approved, filter out any accidental critical issues
      normalized.issues = normalized.issues.filter(
        (issue) => issue.severity !== 'critical',
      );
    } else {
      // If rejected, ensure at least one issue exists
      if (normalized.issues.length === 0) {
        normalized.issues = [{
          severity: 'critical',
          description: 'Schema rejected but no specific issues provided',
          fix: 'Review and regenerate the schema',
        }];
      }
    }

    return normalized;
  }
}

// ── Export for test access ──
export { REFLECTOR_SYSTEM_PROMPT };
