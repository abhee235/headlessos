// EX2.4: Planner Phase
// @see docs/phases/phase-ex2.md
//
// Reasoning model parses user intent and produces high-level hints
// that guide the reactive executor. The planner is the "Architect"
// (from Aider's pattern) — it thinks about WHAT is needed, not HOW.

import { z } from 'zod';
import type { ModelRouter } from '../llm/model-router.js';
import type { TemplateRegistry } from '../dynamic-ui/template-registry.js';

// ── Schemas ──

export const SecurityRequirementsSchema = z.object({
  needsWrite: z.boolean().describe('Will the UI need write-back capability?'),
  needsSFTP: z.boolean().describe('Will the UI need to read/write files?'),
  sensitiveData: z.boolean().describe('Does this involve passwords, keys, or secrets?'),
});

export const PlannerHintsSchema = z.object({
  intent: z.string().describe('What the user wants, in one clear sentence'),
  interactivityLevel: z.enum(['display-only', 'interactive', 'full-management']).describe(
    'display-only = just show data; interactive = editable fields + save; full-management = CRUD operations',
  ),
  expectedWidgets: z.array(z.string()).describe(
    'Widget types we expect in the final UI (e.g., table, stat-card, form, code-block, log-viewer)',
  ),
  templateHint: z.string().nullable().optional().describe(
    'Template ID to use as a starting point, if known. null if no template is applicable.',
  ),
  dataSourceHints: z.array(z.string()).describe(
    'Types of information needed (e.g., "nginx config", "process list", "disk usage"). NOT specific commands — the executor decides commands.',
  ),
  suggestedLayout: z.enum(['stack', 'grid', 'tabs']).describe(
    'The layout type to use inside each section\'s content area. ' +
    'tabs = multiple views of same domain (e.g. Overview + Logs + Config). ' +
    'grid = side-by-side metrics or cards. ' +
    'stack = simple vertical list for single-topic data.',
  ),
  suggestedSections: z.array(z.string()).describe(
    'Names of the sidebar sections to create (e.g. ["System", "Docker", "Network"]). ' +
    'The window always has a sidebar — each section is a separate nav item. ' +
    'Even simple requests need at least 1 section (e.g. ["Disk Usage"]). ' +
    'The executor will create a skeleton with these sections and fill them progressively.',
  ),
  securityRequirements: SecurityRequirementsSchema,
  estimatedComplexity: z.enum(['simple', 'medium', 'complex']).describe(
    'simple = 1-2 commands, single widget; medium = 3-5 commands, multi-widget; complex = 6+ commands, tabs, forms',
  ),
  skipPostReflection: z.boolean().describe(
    'If true, Zod validation in the executor loop is sufficient — skip the post-generation reflector. True for simple display-only UIs.',
  ),
});

export type PlannerHints = z.infer<typeof PlannerHintsSchema>;
export type SecurityRequirements = z.infer<typeof SecurityRequirementsSchema>;

// ── System Prompt ──

const PLANNER_SYSTEM_PROMPT = `You are the planning module of HeadlessOS's UI Generation Agent.
Your job is to analyze a user's request and produce HIGH-LEVEL HINTS that guide the executor.

## IMPORTANT: You are the "Architect" — you think about WHAT, not HOW
- You do NOT produce a step-by-step tool list
- You do NOT name specific commands to run
- You describe what INFORMATION is needed, and what WIDGETS to expect
- The executor (a separate LLM with tool access) will decide which specific tools/commands to use

## Your Output
- Intent: what the user wants (one clear sentence)
- Expected widgets: what UI components should appear
- Data source hints: what categories of data are needed (not specific commands)
- Security requirements: does this need write access, SFTP, or involve secrets?
- Complexity estimate: simple / medium / complex
- Whether to skip post-generation reflection

## Widget Types Available
table, key-value, badge-grid, stat-card, progress-bar, code-block, alert, chart, tree, log-viewer, form, card-list

## Layout Types Available
stack (vertical), grid (columns), tabs (tabbed sections with icon+count)
Layouts are nestable: tabs inside stacks, grids inside stacks, etc.
Note: sidebar layout does NOT exist — the sidebar is always part of the window chrome.

## Layout Selection Guide (for suggestedLayout)
This controls the layout INSIDE each section's content area, NOT the sidebar.
- **stack**: Simple vertical list — best for single-topic, 1-2 widgets (e.g. "show disk usage")
- **grid**: Side-by-side columns — best for comparing metrics or dashboard cards
- **tabs**: Tabbed sections with icon+count — best for multiple views of the same domain (e.g. Overview + Logs + Config)

## Section Planning (for suggestedSections)
ALWAYS provide suggestedSections — the window always has a sidebar with at least 1 section.
Each section becomes a sidebar nav item. The FIRST section is the primary operation.
For simple requests: 1 section (e.g. ["Disk Usage"])
For complex requests: multiple sections (e.g. ["System", "Docker", "Network"])
These map 1:1 with dataSourceHints. Each section gets its own data-gathering phase.

## Interactivity Levels
- display-only: User just wants to see data (monitoring, logs, status)
- interactive: User wants to edit values and save back (configs, settings)
- full-management: User wants CRUD operations (create/delete users, manage containers)

## Template Matching
If the request clearly matches a known template, set templateHint to the template ID.
Available templates will be listed below. If no template fits, set templateHint to null.

## Examples
User: "Show me disk usage"
→ simple, display-only, suggestedLayout: "stack", suggestedSections: ["Disk Usage"],
  expectedWidgets: ["stat-card", "table"],
  dataSourceHints: ["filesystem usage"], skipPostReflection: true

User: "Show me a system overview"
→ complex, display-only, suggestedLayout: "stack", suggestedSections: ["System", "Docker", "Network"],
  expectedWidgets: ["alert", "key-value", "stat-card", "progress-bar", "table"],
  dataSourceHints: ["system health and resources", "docker containers", "network ports and interfaces"],
  skipPostReflection: false

User: "Show nginx config and let me edit it"
→ medium, interactive, suggestedLayout: "stack", suggestedSections: ["Config", "Status"],
  expectedWidgets: ["form", "code-block"], needsWrite: true, needsSFTP: true,
  dataSourceHints: ["nginx configuration", "nginx status"], skipPostReflection: false

User: "Manage Docker containers"
→ complex, full-management, suggestedLayout: "stack", suggestedSections: ["Containers", "Images", "Networks"],
  expectedWidgets: ["table", "stat-card", "form"],
  dataSourceHints: ["container list", "docker stats", "container logs"],
  skipPostReflection: false`;

// ── Planner ──

export interface PlannerOptions {
  /** Override system prompt for testing */
  systemPrompt?: string;
}

export class Planner {
  private modelRouter: ModelRouter;
  private templateRegistry: TemplateRegistry;
  private systemPrompt: string;

  constructor(
    modelRouter: ModelRouter,
    templateRegistry: TemplateRegistry,
    options?: PlannerOptions,
  ) {
    this.modelRouter = modelRouter;
    this.templateRegistry = templateRegistry;
    this.systemPrompt = options?.systemPrompt ?? PLANNER_SYSTEM_PROMPT;
  }

  /**
   * Generate high-level planning hints from a user request.
   *
   * Uses the reasoning model to understand intent, identify expected widgets,
   * classify interactivity level, and estimate complexity. Does NOT produce
   * step-by-step tool execution plans.
   */
  async plan(userRequest: string, serverContext?: string): Promise<PlannerHints> {
    // Build the prompt with template context
    const templateContext = this.buildTemplateContext();
    const systemPrompt = this.buildSystemPrompt(templateContext);
    const userPrompt = this.buildUserPrompt(userRequest, serverContext);

    // Call reasoning model
    const result = await this.modelRouter.reason<PlannerHints>({
      rawOutput: userPrompt,
      command: 'planner',
      schema: PlannerHintsSchema,
      systemPrompt,
    });

    // Post-process: validate and enrich hints
    const hints = this.enrichHints(result.data, userRequest);

    return hints;
  }

  // ── Internal ──

  /**
   * Build template context listing available templates for the system prompt.
   */
  private buildTemplateContext(): string {
    const templates = this.templateRegistry.listAll();
    if (templates.length === 0) {
      return 'No templates are currently registered.';
    }

    const entries = templates.map(
      (t) => `- ${t.id}: ${t.name} — ${t.description} [tags: ${t.tags.join(', ')}]`,
    );
    return `Available templates:\n${entries.join('\n')}`;
  }

  /**
   * Combine base system prompt with template context.
   */
  private buildSystemPrompt(templateContext: string): string {
    return `${this.systemPrompt}\n\n## Templates\n${templateContext}`;
  }

  /**
   * Build the user prompt with the request and optional server context.
   */
  private buildUserPrompt(userRequest: string, serverContext?: string): string {
    let prompt = `User request: "${userRequest}"`;
    if (serverContext) {
      prompt += `\n\nServer context:\n${serverContext}`;
    }
    return prompt;
  }

  /**
   * Enrich and validate hints post-LLM.
   * - Attempt to match templateHint against registry
   * - Ensure widget types are valid
   * - Set reasonable defaults for missing fields
   */
  private enrichHints(hints: PlannerHints, userRequest: string): PlannerHints {
    const enriched = { ...hints };

    // Validate template hint against registry
    if (enriched.templateHint) {
      const template = this.templateRegistry.getById(enriched.templateHint);
      if (!template) {
        // Template not found — try matching by command
        const matches = this.templateRegistry.matchCommand(userRequest);
        if (matches.length > 0 && matches[0].confidence >= 0.5) {
          enriched.templateHint = matches[0].template.id;
        } else {
          // No valid match — clear the hint
          enriched.templateHint = null;
        }
      }
    } else {
      // LLM didn't suggest a template — try matching automatically
      const matches = this.templateRegistry.matchCommand(userRequest);
      if (matches.length > 0 && matches[0].confidence >= 0.7) {
        enriched.templateHint = matches[0].template.id;
      }
    }

    // Normalize widget types to known set
    const KNOWN_WIDGETS = new Set([
      'table', 'key-value', 'badge-grid', 'stat-card', 'progress-bar',
      'code-block', 'alert', 'chart', 'tree', 'log-viewer', 'form',
    ]);
    enriched.expectedWidgets = enriched.expectedWidgets.filter((w) =>
      KNOWN_WIDGETS.has(w),
    );

    // Ensure at least one widget
    if (enriched.expectedWidgets.length === 0) {
      enriched.expectedWidgets = ['table'];
    }

    // Ensure at least one data source hint
    if (enriched.dataSourceHints.length === 0) {
      enriched.dataSourceHints = [enriched.intent];
    }

    // skipPostReflection should be true for simple display-only requests
    if (enriched.estimatedComplexity === 'simple' && enriched.interactivityLevel === 'display-only') {
      enriched.skipPostReflection = true;
    }

    return enriched;
  }
}

// ── Export for test access ──
export { PLANNER_SYSTEM_PROMPT };
