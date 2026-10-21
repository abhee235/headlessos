// EX2.5: Reactive Executor
// EX10.3: the system prompt is sized to the model's window tier (full / lean / minimal)
// @see docs/phases/phase-ex2.md — EX2.5, docs/phases/phase-ex10.md §4
//
// A reactive tool-calling loop where the LLM decides which tools to call
// dynamically based on observed results. Uses native OpenAI function calling.
// Inspired by Roo Code (stack-based loop, consecutive mistake detection,
// tool repetition detection) and Aider (Zod validation as "linter").

import { DynamicViewSchema, type DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import type { ModelRouter } from '../llm/model-router.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import { toolsToOpenAIFunctions } from './tools/tool-converter.js';
import type { ToolContext, AgentTool } from './tools/types.js';
import { checkGuardrails } from './guardrails.js';
import { ToolRepetitionDetector } from './safety/tool-repetition-detector.js';
import type { PlannerHints } from './planner.js';
// Canonical ReflectionIssue (derived from reflector's Zod schema); re-exported below
// so existing importers of it from this module keep working and both modules share one type.
import type { ReflectionIssue } from './reflector.js';
import type { ChatMessage } from '../llm/provider.js';
import { withSpan, withSpanGen, setSpanAttributes } from '../observatory/context.js';
import { getDefaultCatalog } from './actions/catalog/index.js';
import { extractProseToolCalls, malformedArgsMessage, parseToolArgs } from './loop/tool-input.js';
import { markUntrusted, UNTRUSTED_RULE } from './actions/tools.js';
import type { PromptTier } from './context/plan.js';

/** EX9.2: change actions a generated button may name (params only; the server adds the reason) */
const CHANGE_ACTION_LINES = getDefaultCatalog()
  .list({ risk: 'change' })
  .map((a) => `- ${a.id}(${Object.keys(a.params.shape).join(', ')}) — ${a.description}`)
  .join('\n');

// ── EX10.3: prompt blocks per window tier (full = the EX2–EX9 prompt, unchanged) ──

const SCHEMA_REFERENCE_FULL = `## DynamicViewSchema Reference

The final JSON you pass to generate_schema() MUST conform to this structure exactly:

\`\`\`
{
  "title": "string (required)",
  "description": "string | null (optional)",
  "icon": "string | null (optional, Lucide icon name, PascalCase)",
  "sidebarItems": [{"id":"string","label":"string","icon":"string|null"}],
  "sections": { "sidebarItemId": <LayoutObject> },
  "meta": { "tool": "string?", "command": "string?", "generatedAt": "string?", "templateId": "string?" } | null
}
\`\`\`

**IMPORTANT**: \`sidebarItems\` and \`sections\` are TOP-LEVEL fields. There is NO \`root\` field. Each section maps a sidebar item ID to a Layout (stack/grid/tabs). Every sidebar item MUST have a matching section key.

### Layout Objects (layout is the discriminator)

Each section value MUST be one of these 3 layout types. The discriminator key is \`layout\` (NOT \`type\`). Layouts are **nestable** — a tab's children can contain other layouts.

1. **Stack** (vertical list of children — widgets or sub-layouts):
   \`{ "layout": "stack", "gap": "sm"|"md"|"lg", "children": [<Widget|Layout>, ...] }\`

2. **Grid** (columns of children — widgets or sub-layouts):
   \`{ "layout": "grid", "columns": 1-4, "children": [<Widget|Layout>, ...] }\`

3. **Tabs** (tabbed sections — each tab has children that can be widgets or sub-layouts):
   \`{ "layout": "tabs", "tabs": [{ "id": "str", "label": "str", "icon": "LucideIconName?", "count": number?, "children": [<Widget|Layout>, ...] }] }\`
   - **icon**: Lucide icon name shown before the tab label (e.g. "Radio", "Activity", "Cable")
   - **count**: Number shown as a badge after the tab label (e.g. number of items)

NOTE: There is NO sidebar layout type. The sidebar is rendered by the window chrome from the top-level sidebarItems. Do NOT try to create a layout with \`layout: "sidebar"\`.

### Widget Objects (type is the discriminator)

Each widget has a \`type\` discriminator. Valid types:

- **stat-card**: \`{ "type": "stat-card", "title": "str", "value": "str", "unit": "str?", "description": "str?", "trend": "up"|"down"|"neutral"|null, "icon": "LucideIconName?" }\`

- **table**: Supports columns, rows, filters, actions, and empty state.
  \`\`\`
  { "type": "table", "title": "str?",
    "columns": [{
      "key": "str", "label": "str",
      "type": "text"|"number"|"badge"|"date"|"bytes"|"percent"|"code"|"mono"|"rich",
      "sortable": false, "width": "80px?",
      "badgeVariant": {"value":"variant"}?,  // when type="badge"
      "segments": [<RichCellSegment>, ...]?   // when type="rich"
    }],
    "rows": [{column_key: value, ...}, ...],
    "footer": "str?",
    "actions": [{"id":"str","label":"str","icon":"str?","action":{"id":"<catalog action id>","params":{"<param>":"{column_key}"}},"variant":"destructive"?}]?,  // see "Row buttons" below
    "actionStyle": "buttons"|"dropdown"?,  // dropdown shows actions behind a ⋯ menu
    "filters": {
      "search": true, "searchPlaceholder": "str?",
      "dropdowns": [{"key":"str","label":"str","icon":"str?","options":[{"label":"str","value":"str"}]}]
    }?,
    "emptyState": {"icon":"str?","title":"str","message":"str?"}?  // shown when rows is empty
  }
  \`\`\`
  **Column types**:
  - text: plain text
  - number: numeric
  - badge: colored status badge — MUST include badgeVariant map
  - mono: monospace text (for IPs, hashes, ports)
  - code: code-formatted
  - rich: compound cell with multiple segments
  - date, bytes, percent: formatted display

  **Rich cell segments** (for type="rich" columns):
  - \`{"segment":"text", "key":"fieldName", "className":"font-mono text-sm"}\` — display a row field as text
  - \`{"segment":"badge", "key":"fieldName", "variant":"secondary"}\` — badge with fixed variant
  - \`{"segment":"badge", "key":"fieldName", "badgeVariant":{"Running":"success","DNS":"secondary"}}\` — badge with dynamic variant map
  - \`{"segment":"icon", "icon":"Lock", "key":"isSecure"}\` — show icon when row[key] is truthy
  - \`{"segment":"dot", "key":"isPublic", "color":"amber"}\` — colored dot when row[key] is truthy

- **key-value**: \`{ "type": "key-value", "title": "str?", "pairs": [{"key":"str","value":"str","icon":"LucideIconName?","copyable":false}], "layout": "vertical"|"grid-2"|"grid-3"|"grid-4" }\`

- **badge-grid**: \`{ "type": "badge-grid", "title": "str?", "badges": [{"label":"str","value":"str","variant":"default"|"secondary"|"destructive"|"outline"|"success"|"warning"}] }\`

- **progress-bar**: \`{ "type": "progress-bar", "title": "str?", "value": 0-100, "label": "str?", "variant": "default"|"success"|"warning"|"destructive" }\`

- **code-block**: \`{ "type": "code-block", "title": "str?", "code": "str", "language": "str", "maxHeight": "300px?" }\`

- **alert**: \`{ "type": "alert", "title": "str?", "message": "str", "variant": "default"|"destructive"|"success"|"warning" }\`

- **card-list**: Cards with icon, title, status badge (with optional dot), and detail rows.
  \`{ "type": "card-list", "title": "str?", "items": [{"icon":"str?","title":"str","subtitle":"str?","badge":{"label":"str","variant":"success","dot":true}?,"details":[{"label":"str","value":"str"}]?}] }\`
  Use for: network interfaces, services, hardware devices — anything that's an "entity with status and properties".

- **chart**: \`{ "type": "chart", "title": "str?", "chartType": "bar"|"line"|"area"|"pie"|"donut", "data": [...], "xKey": "str", "yKeys": [{"key":"str","label":"str?","color":"str?"}], "height": 300 }\`

- **tree**: \`{ "type": "tree", "title": "str?", "nodes": [{"label":"str","value":"str?","icon":"str?","children":[...]}] }\`

- **log-viewer**: \`{ "type": "log-viewer", "title": "str?", "lines": [{"timestamp":"str?","level":"debug"|"info"|"warn"|"error"|null,"message":"str"}], "maxHeight": "400px" }\`

- **form**: \`{ "type": "form", "title": "str?", "fields": [{"key":"str","label":"str","type":"text"|"number"|"boolean"|"select"|"textarea","value":...,"options":[{"label":"str","value":"str"}]?}], "groups":[{"label":"str","fieldKeys":["str"]}]?, "submitLabel": "Save", "readOnly": false }\`

IMPORTANT:
- The section values use \`layout\` as their discriminator key. Widgets use \`type\` as their discriminator key. Do NOT confuse them.
- Badge variants map: success=running/active/up, destructive=error/failed/down, warning=degraded/pending, secondary=inactive/neutral, outline=neutral
- Icon names are Lucide PascalCase: Network, Lock, Shield, Radio, Activity, Cable, Route, Globe, etc.
- For tables with 0 rows, always include emptyState with a meaningful message.
- Use actionStyle:"dropdown" when a table has 3+ actions (keeps the UI clean).

`;

/** lean: the full reference without the column-type and rich-cell details */
const SCHEMA_REFERENCE_LEAN = (() => {
  const from = SCHEMA_REFERENCE_FULL.indexOf('  **Column types**:');
  const to = SCHEMA_REFERENCE_FULL.indexOf('- **key-value**:');
  return `${SCHEMA_REFERENCE_FULL.slice(0, from)}  Column types: text, number, badge (needs badgeVariant), mono (IPs, hashes, ports), code, date, bytes, percent.\n\n${SCHEMA_REFERENCE_FULL.slice(to)}`;
})();

/** minimal: one line per shape */
const SCHEMA_REFERENCE_MINIMAL = `## DynamicViewSchema (short reference)
Top level: {"title":"str","description":"str?","icon":"Lucide icon?","sidebarItems":[{"id":"str","label":"str","icon":"str?"}],"sections":{"<sidebar item id>":<Layout>}}. Every sidebar item needs a section with the same id. There is no "root" field.
Layouts (key "layout", nestable): {"layout":"stack","gap":"sm|md|lg","children":[...]} · {"layout":"grid","columns":1-4,"children":[...]} · {"layout":"tabs","tabs":[{"id":"str","label":"str","children":[...]}]}
Widgets (key "type"):
- stat-card {"title","value","unit"?,"description"?,"icon"?}
- table {"title"?,"columns":[{"key","label","type":"text|number|badge|mono|date|bytes|percent"}],"rows":[{...}],"emptyState"?:{"title","message"?}}
- key-value {"title"?,"pairs":[{"key","value"}]}
- progress-bar {"title"?,"value":0-100,"label"?,"variant":"default|success|warning|destructive"}
- alert {"title"?,"message","variant":"default|destructive|success|warning"}
- code-block {"title"?,"code","language"}
- log-viewer {"title"?,"lines":[{"timestamp"?,"level"?,"message"}]}
- also: badge-grid, card-list, chart, tree, form
Widgets use "type", layouts use "layout". Icons are Lucide PascalCase names (Cpu, HardDrive, Network, Container).

`;

function schemaReference(tier: PromptTier): string {
  return tier === 'full' ? SCHEMA_REFERENCE_FULL : tier === 'lean' ? SCHEMA_REFERENCE_LEAN : SCHEMA_REFERENCE_MINIMAL;
}

const ROW_BUTTONS = `## Row buttons (actions that change the server)
A table button names a catalog action; it never carries a shell command. Fill params from the row with {column_key} placeholders. When the owner clicks it, the server shows an approval card with the exact command first — do not add confirm/confirmMessage.
${CHANGE_ACTION_LINES}
Example: {"id":"restart","label":"Restart","icon":"RotateCw","action":{"id":"container_restart","params":{"container":"{name}"}}}

`;

const WORKFLOW_FULL = `## Workflow — Progressive Rendering (MANDATORY)

You MUST follow this exact workflow. The user sees the UI window build up LIVE as you work.

### Step-by-step:

1. **get_server_context()** — Understand the server (OS, installed tools, etc.)

2. **update_view() with SKELETON** — Immediately send a skeleton layout. This opens the UI window for the user right away. The skeleton has the full structure but empty sections. Example:
   \`\`\`json
   {"title":"My View","icon":"Server","description":"Loading...","sidebarItems":[{"id":"sys","label":"System","icon":"Cpu"},{"id":"docker","label":"Docker","icon":"Container"}],"sections":{"sys":{"layout":"stack","gap":"md","children":[]},"docker":{"layout":"stack","gap":"md","children":[]}}}
   \`\`\`
   The frontend shows animated skeleton placeholders for empty sections.

3. **Action tools — gather data for FIRST section** — Call the server actions (e.g. disk_usage, service_status, docker_containers) needed for the first section. You cannot write shell commands; each action is a tool with typed parameters.

4. **update_view() with first section filled** — Send the full view with the first section populated and other sections still empty. Include ALL data gathered so far.

5. **Action tools — gather data for NEXT section** — Call the actions for the next section.

6. **update_view() with next section filled** — Send the full view with all gathered sections. Each update_view() must include ALL previously gathered data PLUS the new section.

7. **Repeat steps 5-6** for each remaining section.

8. **generate_schema() with COMPLETE view** — When ALL sections are populated, call generate_schema() with the FINAL complete JSON. This validates against DynamicViewSchema and terminates the loop.

### Critical Rules:
- ALWAYS send a skeleton update_view() BEFORE gathering any data. The user must see something immediately.
- Every update_view() call must be CUMULATIVE — include all previously gathered data plus new data.
- Do NOT skip update_view() calls between sections — the progressive feel depends on frequent updates.
- generate_schema() is the LAST tool you call. It validates strictly and ends the session.
- update_view() accepts partial/incomplete JSON — generate_schema() does NOT.
- Pass view JSON as a STRING to both update_view() and generate_schema().

`;

const WORKFLOW_SHORT = `## Workflow — build the view live
1. get_server_context() once.
2. update_view() with a skeleton: every sidebar item and its section, children empty.
3. Call the actions for one section, then update_view() with that section filled. Each update_view() includes everything gathered so far.
4. Repeat step 3 for each section.
5. generate_schema() with the complete view. It is checked strictly and ends the run.
You cannot write shell commands; each action is a tool with typed parameters.

`;

// ── Agent Event Types ──

/** EX3-C.2: Layout update phases for progressive rendering */
export type LayoutUpdatePhase = 'skeleton' | 'widget' | 'complete' | 'error';

export type AgentEvent =
  | { type: 'thinking'; message: string }
  | { type: 'tool_result'; tool: string; success: boolean; outputPreview: string; latencyMs: number }
  | { type: 'tool_blocked'; tool: string; reason: string }
  | { type: 'partial_view'; view: Record<string, unknown> }
  | { type: 'generation_complete'; view: DynamicView }
  | { type: 'reflection'; feedback: string; action: 'approve' | 'fix' }
  | { type: 'safety_warning'; warning: 'consecutive_mistakes' | 'tool_repetition'; tool?: string; message?: string }
  | { type: 'error'; message: string }
  | { type: 'layout_update'; phase: LayoutUpdatePhase; view: DynamicView; widgetId?: string; progress?: number };

// ── Executor Config ──

export interface ExecutorConfig {
  /** Maximum loop iterations (default: 30 — progressive rendering needs more steps) */
  maxSteps: number;
  /** Consecutive turns without tool calls before abort (default: 3, from Roo Code) */
  maxConsecutiveMistakes: number;
  /** Same tool call N times before warning (default: 8, higher because update_view is called often) */
  maxToolRepetitions: number;
}

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxSteps: 30,
  maxConsecutiveMistakes: 3,
  maxToolRepetitions: 8,
};

// ── Reactive Executor ──

export class ReactiveExecutor {
  private modelRouter: ModelRouter;
  private toolRegistry: ToolRegistry;
  private config: ExecutorConfig;

  constructor(
    modelRouter: ModelRouter,
    toolRegistry: ToolRegistry,
    config: Partial<ExecutorConfig> = {},
  ) {
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
  }

  /**
   * Reactive execution loop with native function calling.
   *
   * The LLM sees all tool definitions and calls them dynamically.
   * When it has enough data, it calls `generate_schema` to produce the final output.
   *
   * Inline self-correction: Zod validation failures, SSH errors, and tool blocks
   * are sent back as tool results — the LLM sees them and self-corrects.
   */
  async *execute(
    hints: PlannerHints,
    context: ToolContext,
  ): AsyncGenerator<AgentEvent> {
    yield* this.executeInternal(hints, context);
  }

  /**
   * Re-execute with fix instructions from the post-generation reflector.
   * Injects reflection issues into the system prompt so the LLM can fix them.
   */
  async *executeWithFixes(
    hints: PlannerHints,
    reflectionIssues: ReflectionIssue[],
    context: ToolContext,
  ): AsyncGenerator<AgentEvent> {
    yield* this.executeInternal(hints, context, reflectionIssues);
  }

  // ── Internal Loop ──

  private async *executeInternal(
    hints: PlannerHints,
    context: ToolContext,
    reflectionIssues?: ReflectionIssue[],
  ): AsyncGenerator<AgentEvent> {
    yield* withSpanGen<AgentEvent>(
      'ReactiveExecutor.execute',
      'CHAIN',
      () => this.executeLoop(hints, context, reflectionIssues),
      { input: hints.intent },
    );
  }

  private async *executeLoop(
    hints: PlannerHints,
    context: ToolContext,
    reflectionIssues?: ReflectionIssue[],
  ): AsyncGenerator<AgentEvent> {
    // EX9.1: offer only this run's selected actions (any catalog action still runs if called)
    const tools = this.toolRegistry.getAll().filter(
      (t) => t.securityTier !== 'action' || !context.offeredActions || context.offeredActions.has(t.name),
    );
    const openAITools = toolsToOpenAIFunctions(tools);

    const toolRepetitionDetector = new ToolRepetitionDetector(this.config.maxToolRepetitions);

    // Build initial messages
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.buildExecutorSystemPrompt(hints, reflectionIssues, context.plan?.tier),
      },
      {
        role: 'user',
        content: this.buildInitialUserMessage(hints),
      },
    ];

    let stepCount = 0;
    let consecutiveMistakes = 0;

    // ── REACTIVE LOOP ──
    while (stepCount < this.config.maxSteps) {
      stepCount++;

      yield { type: 'thinking', message: `Step ${stepCount}...` };

      // Call LLM with native function calling
      const response = await this.modelRouter.chat({
        messages,
        tools: openAITools,
        tool_choice: 'auto',
      });

      const assistantMessage = response.message;

      // EX9.3: a model that wrote its tool call as text gets it run (first offered tool it names)
      if (!assistantMessage.tool_calls?.length && assistantMessage.content) {
        const prose = extractProseToolCalls(assistantMessage.content, tools.map((t) => t.name));
        if (prose.length > 0) {
          assistantMessage.tool_calls = [{
            id: `prose_${stepCount}`,
            type: 'function',
            function: { name: prose[0]!.name, arguments: JSON.stringify(prose[0]!.input) },
          }];
          assistantMessage.content = null;
        }
      }

      // Append assistant message to history
      messages.push(assistantMessage);

      // ── Case 1: LLM called tools ──
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        consecutiveMistakes = 0; // Reset — LLM is doing something

        let didToolFailInCurrentTurn = false;
        let schemaCallResult: { toolCallId: string; schema: unknown } | null = null;

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          // EX9.3: repair broken JSON before giving up (small models)
          const parsedArgs = parseToolArgs(toolCall.function.arguments);
          if (parsedArgs.via === 'raw') {
            const shape = (this.toolRegistry.get(toolName)?.parameters as { shape?: Record<string, unknown> } | undefined)?.shape;
            const errorResult = JSON.stringify({
              success: false,
              error: malformedArgsMessage(toolName, parsedArgs.raw ?? '', shape ? Object.keys(shape) : []),
            });
            messages.push({ role: 'tool', content: errorResult, tool_call_id: toolCall.id });
            yield { type: 'error', message: `${toolName}: invalid JSON arguments` };
            didToolFailInCurrentTurn = true;
            continue;
          }
          const toolArgs = parsedArgs.input;

          const tool = this.toolRegistry.get(toolName);
          if (!tool) {
            const errorResult = JSON.stringify({
              success: false,
              error: `Unknown tool: ${toolName}. Available tools: ${this.toolRegistry.getNames().join(', ')}`,
            });
            messages.push({ role: 'tool', content: errorResult, tool_call_id: toolCall.id });
            yield { type: 'error', message: `Unknown tool: ${toolName}` };
            didToolFailInCurrentTurn = true;
            continue;
          }

          // Tool repetition detection (from Roo Code)
          const repetitionKey = JSON.stringify({ name: toolName, args: toolArgs });
          if (toolRepetitionDetector.isRepeating(repetitionKey)) {
            const warningResult = JSON.stringify({
              success: false,
              error: `You have called ${toolName} with the same arguments ${this.config.maxToolRepetitions} times. Please try a different approach.`,
            });
            messages.push({ role: 'tool', content: warningResult, tool_call_id: toolCall.id });
            yield { type: 'safety_warning', warning: 'tool_repetition', tool: toolName };
            continue;
          }

          // Guardrail check
          const guard = checkGuardrails(tool, toolArgs);
          if (!guard.allowed) {
            const denialResult = JSON.stringify({
              success: false,
              error: `Tool blocked by guardrails: ${guard.reason}`,
            });
            messages.push({ role: 'tool', content: denialResult, tool_call_id: toolCall.id });
            yield { type: 'tool_blocked', tool: toolName, reason: guard.reason ?? 'Blocked' };
            didToolFailInCurrentTurn = true;
            continue;
          }

          // Execute tool — wrapped in Observatory TOOL span (EX4-B.2)
          const startTime = Date.now();
          try {
            const result = await withSpan(`tool:${toolName}`, 'TOOL', async () => {
              return tool.execute(toolArgs, context);
            }, { input: toolArgs });
            const latencyMs = Date.now() - startTime;

            // EX9.5: server output reaches the model marked as data
            const forModel = tool.securityTier === 'action' && result.metadata?.command
              ? { ...result, output: markUntrusted(toolName, result.output) }
              : result;
            messages.push({
              role: 'tool',
              content: JSON.stringify(forModel),
              tool_call_id: toolCall.id,
            });
            yield {
              type: 'tool_result',
              tool: toolName,
              success: result.success,
              outputPreview: result.output.substring(0, 200),
              latencyMs,
            };

            if (!result.success) {
              didToolFailInCurrentTurn = true;
            }

            // Cache output for grep_output tool
            if (result.success && result.output) {
              context.previousOutputs.set(
                `${toolName}:${JSON.stringify(toolArgs)}`,
                result.output,
              );
            }

            // Track update_view calls (progressive rendering — non-terminal)
            if (toolName === 'update_view' && result.success && result.metadata?.partialView) {
              yield {
                type: 'partial_view',
                view: result.metadata.partialView as Record<string, unknown>,
              };
            }

            // Track generate_schema calls
            if (toolName === 'generate_schema' && result.success && result.metadata?.schema) {
              schemaCallResult = { toolCallId: toolCall.id, schema: result.metadata.schema };
            }
          } catch (err) {
            const latencyMs = Date.now() - startTime;
            const errorResult = JSON.stringify({
              success: false,
              error: `Tool execution failed: ${(err as Error).message}`,
            });
            messages.push({ role: 'tool', content: errorResult, tool_call_id: toolCall.id });
            yield {
              type: 'tool_result',
              tool: toolName,
              success: false,
              outputPreview: (err as Error).message.substring(0, 200),
              latencyMs,
            };
            didToolFailInCurrentTurn = true;
          }
        }

        // Handle generate_schema result (inline Zod validation — "linter" from Aider)
        if (schemaCallResult && !didToolFailInCurrentTurn) {
          const zodResult = DynamicViewSchema.safeParse(schemaCallResult.schema);
          if (zodResult.success) {
            yield { type: 'generation_complete', view: zodResult.data };
            return; // Exit loop — we have a valid schema
          } else {
            // Zod error becomes a tool result → LLM self-corrects
            const zodErrorResult = JSON.stringify({
              success: false,
              error: `Schema validation failed. Fix these issues:\n${zodResult.error.message}`,
              zodErrors: zodResult.error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
                code: i.code,
              })),
            });
            // Add correction context — the LLM will see this and fix
            messages.push({
              role: 'tool',
              content: zodErrorResult,
              tool_call_id: schemaCallResult.toolCallId,
            });
            yield {
              type: 'reflection',
              feedback: 'Zod validation failed, self-correcting...',
              action: 'fix',
            };
            // Loop continues — LLM will try to fix inline
          }
        }

      // ── Case 2: LLM responded with text only (no tool calls) ──
      } else {
        consecutiveMistakes++;

        // Consecutive mistake detection (from Roo Code)
        if (consecutiveMistakes >= this.config.maxConsecutiveMistakes) {
          yield {
            type: 'safety_warning',
            warning: 'consecutive_mistakes',
            message: `Agent has not called any tools for ${consecutiveMistakes} consecutive turns. Aborting.`,
          };
          yield {
            type: 'error',
            message: 'Agent stopped making progress. Please try rephrasing your request.',
          };
          return;
        }

        // Nudge the LLM to use tools
        messages.push({
          role: 'user',
          content: 'Please use the available tools to gather information and then call generate_schema to produce the final UI. Do not just respond with text.',
        });
      }
    }

    // Max steps reached
    yield {
      type: 'error',
      message: `Agent reached maximum step limit (${this.config.maxSteps}). Returning best available result.`,
    };
  }

  // ── Prompt Builders ──

  private buildExecutorSystemPrompt(
    hints: PlannerHints,
    reflectionIssues?: ReflectionIssue[],
    tier: PromptTier = 'full',
  ): string {
    // Build layout guidance from planner hints
    const layoutGuidance = this.buildLayoutGuidance(hints);
    // EX10.3: a small window gets the row-button catalog only when the view is interactive
    const rowButtons = tier === 'minimal' && hints.interactivityLevel === 'display-only' ? '' : ROW_BUTTONS;

    let prompt = `You are HeadlessOS's UI Generation Agent (Executor).
Your job is to gather data from a Linux server via tools and produce a DynamicViewSchema.
The user sees the UI build up LIVE — use update_view() to show progress as you work.

## User's Intent
${hints.intent}

## Expected Output
A DynamicViewSchema JSON object with these widgets: ${hints.expectedWidgets.join(', ')}
Interactivity: ${hints.interactivityLevel}
${hints.templateHint ? `Template hint: Use "${hints.templateHint}" as a starting point.` : ''}

## Layout Plan
${layoutGuidance}

## Data Sources Needed
${hints.dataSourceHints.map((h, i) => `${i + 1}. ${h}`).join('\n')}
${this.buildCLIIntrospectionGuidance(hints)}
${schemaReference(tier)}${rowButtons}${tier === 'full' ? WORKFLOW_FULL : WORKFLOW_SHORT}${tier === 'full' ? this.buildProgressiveExample(hints) : ''}

## General Rules
- Gather all needed data BEFORE calling generate_schema()
- Use specific actions over broad ones (service_status for one unit rather than service_list)
- If an action fails, try another one (e.g. nginx_test failed → file_read /etc/nginx/nginx.conf)
- To read a file, use file_read (or file_tail for the end of a log)
- ${UNTRUSTED_RULE}
- The schema JSON passed to generate_schema must be a STRING (JSON.stringify), not an object
${hints.securityRequirements.needsWrite ? '- This request may need write-back capability. Include writeBack config in form widgets.' : ''}
${hints.securityRequirements.sensitiveData ? '- This involves sensitive data. Mask passwords in the UI.' : ''}`;

    if (reflectionIssues && reflectionIssues.length > 0) {
      prompt += `\n\n## Fix Instructions (from Post-Generation Reflector)
The previous generated schema had quality issues. Please address:
${reflectionIssues.map((issue, i) => `${i + 1}. [${issue.severity}] ${issue.description}${issue.fix ? ` → Fix: ${issue.fix}` : ''}${issue.didYouMean ? ` (did you mean: ${issue.didYouMean})` : ''}`).join('\n')}`;
    }

    return prompt;
  }

  // EX5-A.3: CLI Introspection Prompt Engineering
  /**
   * Build CLI introspection guidance when dataSourceHints include 'cli-introspection'.
   * Returns an empty string when CLI introspection is not needed.
   */
  private buildCLIIntrospectionGuidance(hints: PlannerHints): string {
    const hasIntrospection = hints.dataSourceHints.some(
      (h) => h.toLowerCase().includes('cli-introspection'),
    );
    if (!hasIntrospection) return '\n';

    return `
## CLI Tool Introspection Workflow (MANDATORY for this request)

The user is asking you to build a management UI for a CLI tool. Follow this structured discovery pattern:

### Phase 1: Discovery (cli_* actions — they run in the sandbox when one is active)
1. **Check binary exists**: \`cli_locate({ program: "<tool>" })\`
   - If not found, tell the user via an alert widget: "Tool <tool> is not installed on this server"
2. **Get version**: \`cli_version({ program: "<tool>" })\`
   - Show as a key-value pair in the Overview section
3. **Parse top-level help**: \`cli_help({ program: "<tool>" })\` (or \`cli_manual\` for the man page)
   - Identify available subcommands and global flags
4. **Iterate key subcommands**: \`cli_help({ program: "<tool>", subcommands: ["<subcmd>"] })\` for each important subcommand
   - Parse available flags and options for each subcommand
   - Focus on the most useful subcommands (typically 3-6)

### Phase 2: UI Mapping
Map discovered CLI structure to DynamicView widgets:

| CLI Pattern | Widget Type | Example |
|-------------|------------|---------|
| Subcommand that lists items (e.g. \`list\`, \`ls\`, \`ps\`, \`status\`) | **table** | \`restic snapshots\` → table of snapshots |
| Subcommand that shows info (e.g. \`info\`, \`show\`, \`stats\`) | **key-value** | \`restic stats\` → key-value pairs |
| Subcommand that performs action (e.g. \`backup\`, \`restore\`, \`create\`, \`delete\`) | **form** with commandTemplate | \`restic backup\` → form with path + flags |
| Tool version + global info | **stat-card** or **key-value** | version, install path, config location |
| Config file content | **code-block** | \`/etc/<tool>/config.yaml\` |
| Log output | **log-viewer** | \`<tool> logs\` or \`journalctl -u <tool>\` |

### Phase 3: Form CommandTemplate Wiring
For action subcommands, create form widgets with \`commandTemplate\`:
- Map each CLI flag to a form field (text/number/boolean/select)
- Use \`{fieldName}\` placeholders in the template: e.g. \`"restic backup {--repo} {--exclude} {path}"\`
- Boolean flags: include flag name when true, omit when false
- Set \`confirmSubmit: true\` for destructive actions (delete, prune, etc.)
- Set \`confirmMessage\` to describe what the command will do

### Progressive Rendering During Discovery
- After Phase 1 step 1 (binary check): send update_view with Overview section showing tool name + version placeholder
- After Phase 1 step 3 (top-level help): update_view with sidebar sections for discovered subcommands
- After each subcommand discovery: update_view with that section's widgets filled in
- Call generate_schema() only after all sections are populated

### Meta Fields
Set \`meta.tool\` to the CLI tool name (e.g. "restic") — this enables the "Save as App" feature.
Set \`meta.command\` to the primary discovery command (e.g. "restic --help").
`;
  }

  /**
   * Build layout guidance section from planner hints.
   * Tells the executor which layout to use and what sections to create.
   */
  private buildLayoutGuidance(hints: PlannerHints): string {
    const layout = hints.suggestedLayout ?? 'stack';
    const sections = hints.suggestedSections;

    // Sections guidance — always present since top-level sidebarItems/sections are mandatory
    const sectionList = sections?.length
      ? sections.map((s, i) => `  ${i + 1}. "${s}" — data: ${hints.dataSourceHints[i] ?? 'general'}`).join('\n')
      : hints.dataSourceHints.map((d, i) => `  ${i + 1}. Section for: ${d}`).join('\n');

    let guidance = `Create these sidebar sections (top-level sidebarItems + sections fields):\n${sectionList}\n\nAdd an appropriate Lucide icon to each sidebar item.`;

    // Layout guidance — for the content inside each section
    switch (layout) {
      case 'tabs':
        guidance += `\n\nInside each section, use a **tabs** layout if the section has multiple sub-views.`;
        break;
      case 'grid':
        guidance += `\n\nInside each section, use a **grid** layout with ${Math.min(hints.expectedWidgets.length, 4)} columns for side-by-side widgets.`;
        break;
      case 'stack':
      default:
        guidance += `\n\nInside each section, use a **stack** layout (vertical) for a logical top-to-bottom flow.`;
        break;
    }

    return guidance;
  }

  /**
   * Build a concrete progressive rendering example based on the layout type.
   * This few-shot example teaches the LLM exactly what tool calls to make.
   */
  private buildProgressiveExample(hints: PlannerHints): string {
    const sections = hints.suggestedSections;

    // Only add the example when we have named sections
    if (!sections?.length) {
      return '';
    }

    const sidebarItems = sections.map((s) => {
      const id = s.toLowerCase().replace(/\s+/g, '-');
      return `{"id":"${id}","label":"${s}","icon":"${this.pickIconForSection(s)}"}`;
    });
    const emptySections = sections.map(s => {
      const id = s.toLowerCase().replace(/\s+/g, '-');
      return `"${id}":{"layout":"stack","gap":"md","children":[]}`;
    });

    return `## Example: Progressive Sections Pattern

Here is exactly how to build a multi-section view progressively. Follow this pattern:

\`\`\`
Step 1: get_server_context()
Step 2: update_view(${JSON.stringify(JSON.stringify({title: hints.intent.substring(0, 30), description: 'Loading...', icon: 'Server', sidebarItems: 'ITEMS', sections: 'SECTIONS'})).replace('"ITEMS"', `[${sidebarItems.join(',')}]`).replace('"SECTIONS"', `{${emptySections.join(',')}}`)})  
  → User sees the sidebar with ${sections.length} empty sections (skeleton placeholders)
Step 3: action tools x N — gather data for "${sections[0]}"
Step 4: update_view(...) — same JSON but "${sections[0].toLowerCase().replace(/\s+/g, '-')}" section now has widgets in its children
  → User sees ${sections[0]} section populate with real data
${sections.slice(1).map((s, i) => `Step ${5 + i * 2}: action tools x N — gather data for "${s}"
Step ${6 + i * 2}: update_view(...) — cumulative, "${s.toLowerCase().replace(/\s+/g, '-')}" section now filled too
  → User sees ${s} section populate`).join('\n')}
Final: generate_schema(...) — complete view with ALL sections filled
`;
  }

  /**
   * Pick a reasonable Lucide icon name for a section based on its label.
   */
  private pickIconForSection(label: string): string {
    const lower = label.toLowerCase();
    if (lower.includes('system') || lower.includes('health') || lower.includes('overview')) return 'Cpu';
    if (lower.includes('docker') || lower.includes('container')) return 'Container';
    if (lower.includes('network') || lower.includes('port')) return 'Network';
    if (lower.includes('disk') || lower.includes('storage')) return 'HardDrive';
    if (lower.includes('memory') || lower.includes('ram')) return 'MemoryStick';
    if (lower.includes('process') || lower.includes('task')) return 'Activity';
    if (lower.includes('log')) return 'FileText';
    if (lower.includes('config') || lower.includes('setting')) return 'Settings';
    if (lower.includes('user') || lower.includes('account')) return 'Users';
    if (lower.includes('service') || lower.includes('daemon')) return 'Cog';
    if (lower.includes('nginx') || lower.includes('web')) return 'Globe';
    if (lower.includes('ssh') || lower.includes('security')) return 'Shield';
    if (lower.includes('image')) return 'Layers';
    if (lower.includes('volume')) return 'Database';
    if (lower.includes('cron') || lower.includes('schedule')) return 'Clock';
    return 'LayoutDashboard';
  }

  private buildInitialUserMessage(hints: PlannerHints): string {
    const sections = hints.suggestedSections;

    let msg = `Generate a ${hints.estimatedComplexity} ${hints.interactivityLevel} UI: ${hints.intent}`;

    if (sections?.length) {
      msg += `\n\nCreate these sidebar sections: ${sections.join(', ')}.`;
      msg += `\nBuild it progressively: skeleton first (sidebarItems + empty sections) → fill each section after gathering its data → generate_schema last.`;
    }

    return msg;
  }
}

// ── Reflection Issue type ──
// Canonical definition lives in reflector.ts (derived from ReflectionIssueSchema).
// Re-exported so existing importers (tests, callers) keep resolving it from this module.
export type { ReflectionIssue };
