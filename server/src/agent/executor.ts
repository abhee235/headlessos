// EX2.5: Reactive Executor
// @see docs/phases/phase-ex2.md — EX2.5
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
import type { ChatMessage } from '../llm/provider.js';

// ── Agent Event Types ──

export type AgentEvent =
  | { type: 'thinking'; message: string }
  | { type: 'tool_result'; tool: string; success: boolean; outputPreview: string; latencyMs: number }
  | { type: 'tool_blocked'; tool: string; reason: string }
  | { type: 'generation_complete'; view: DynamicView }
  | { type: 'reflection'; feedback: string; action: 'approve' | 'fix' }
  | { type: 'safety_warning'; warning: 'consecutive_mistakes' | 'tool_repetition'; tool?: string; message?: string }
  | { type: 'error'; message: string };

// ── Executor Config ──

export interface ExecutorConfig {
  /** Maximum loop iterations (default: 20) */
  maxSteps: number;
  /** Consecutive turns without tool calls before abort (default: 3, from Roo Code) */
  maxConsecutiveMistakes: number;
  /** Same tool call N times before warning (default: 5, from Roo Code) */
  maxToolRepetitions: number;
}

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxSteps: 20,
  maxConsecutiveMistakes: 3,
  maxToolRepetitions: 5,
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
    const tools = this.toolRegistry.getAll();
    const openAITools = toolsToOpenAIFunctions(tools);

    const toolRepetitionDetector = new ToolRepetitionDetector(this.config.maxToolRepetitions);

    // Build initial messages
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.buildExecutorSystemPrompt(hints, reflectionIssues),
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

      // Append assistant message to history
      messages.push(assistantMessage);

      // ── Case 1: LLM called tools ──
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        consecutiveMistakes = 0; // Reset — LLM is doing something

        let didToolFailInCurrentTurn = false;
        let schemaCallResult: { toolCallId: string; schema: unknown } | null = null;

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: unknown;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            const errorResult = JSON.stringify({
              success: false,
              error: 'Invalid JSON in tool arguments',
            });
            messages.push({ role: 'tool', content: errorResult, tool_call_id: toolCall.id });
            yield { type: 'error', message: `${toolName}: invalid JSON arguments` };
            didToolFailInCurrentTurn = true;
            continue;
          }

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

          // Execute tool
          const startTime = Date.now();
          try {
            const result = await tool.execute(toolArgs, context);
            const latencyMs = Date.now() - startTime;

            messages.push({
              role: 'tool',
              content: JSON.stringify(result),
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
  ): string {
    let prompt = `You are HeadlessOS's UI Generation Agent (Executor).
Your job is to gather data from a Linux server via tools and produce a DynamicViewSchema.

## User's Intent
${hints.intent}

## Expected Output
A DynamicViewSchema JSON object with these widgets: ${hints.expectedWidgets.join(', ')}
Interactivity: ${hints.interactivityLevel}
${hints.templateHint ? `Template hint: Use "${hints.templateHint}" as a starting point.` : ''}

## Data Sources Needed
${hints.dataSourceHints.map((h) => `- ${h}`).join('\n')}

## DynamicViewSchema Reference

The final JSON you pass to generate_schema() MUST conform to this structure exactly:

\`\`\`
{
  "title": "string (required)",
  "description": "string | null (optional)",
  "icon": "string | null (optional, Lucide icon name, PascalCase)",
  "root": <LayoutObject>,
  "meta": { "tool": "string?", "command": "string?", "generatedAt": "string?", "templateId": "string?" } | null
}
\`\`\`

### Layout Objects (root.layout is the discriminator)

The \`root\` field MUST be one of these 4 layout types. The discriminator key is \`layout\` (NOT \`type\`). Layouts are **nestable** — a tab's children or a sidebar's section values can contain other layouts.

1. **Stack** (vertical list of children — widgets or sub-layouts):
   \`{ "layout": "stack", "gap": "sm"|"md"|"lg", "children": [<Widget|Layout>, ...] }\`

2. **Grid** (columns of children — widgets or sub-layouts):
   \`{ "layout": "grid", "columns": 1-4, "children": [<Widget|Layout>, ...] }\`

3. **Tabs** (tabbed sections — each tab has children that can be widgets or sub-layouts):
   \`{ "layout": "tabs", "tabs": [{ "id": "str", "label": "str", "icon": "LucideIconName?", "count": number?, "children": [<Widget|Layout>, ...] }] }\`
   - **icon**: Lucide icon name shown before the tab label (e.g. "Radio", "Activity", "Cable")
   - **count**: Number shown as a badge after the tab label (e.g. number of items)

4. **Sidebar** (sidebar navigation + content sections — section values can be widgets or sub-layouts):
   \`{ "layout": "sidebar", "sidebarItems": [{"id":"str","label":"str","icon":"LucideIconName?"}], "sections": {"sectionId": [<Widget|Layout>, ...]} }\`
   - **icon**: Lucide icon name shown before the sidebar item label
   - Use sidebar for multi-page app UIs (Server Admin, Settings, etc.)
   - Sidebar section content can include nested tabs or other layouts

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
    "actions": [{"id":"str","label":"str","icon":"str?","command":"str","confirm":bool?,"confirmMessage":"str?","variant":"destructive"?}]?,
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
- The \`root\` object uses \`layout\` as its discriminator key. Widgets use \`type\` as their discriminator key. Do NOT confuse them.
- Badge variants map: success=running/active/up, destructive=error/failed/down, warning=degraded/pending, secondary=inactive/neutral, outline=neutral
- Icon names are Lucide PascalCase: Network, Lock, Shield, Radio, Activity, Cable, Route, Globe, etc.
- For tables with 0 rows, always include emptyState with a meaningful message.
- Use actionStyle:"dropdown" when a table has 3+ actions (keeps the UI clean).

## Workflow
1. Call get_server_context() to understand the server
2. Use exec_command() and sftp_read() to gather information
3. Optionally search_templates() for a matching template
4. When you have enough data, call generate_schema() with a complete DynamicViewSchema JSON string
5. If generate_schema() fails Zod validation, you'll see the errors — fix and retry

## Rules
- Gather all needed data BEFORE calling generate_schema()
- Use specific commands over broad ones
- If a command fails, try a fallback (e.g., nginx -T failed → try cat /etc/nginx/nginx.conf)
- If you need to read actual file content for editing, use sftp_read()
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

  private buildInitialUserMessage(hints: PlannerHints): string {
    return `Generate a ${hints.estimatedComplexity} ${hints.interactivityLevel} UI: ${hints.intent}`;
  }
}

// ── Reflection Issue type (shared with reflector) ──

export interface ReflectionIssue {
  severity: 'critical' | 'minor' | 'suggestion';
  widget?: string;
  description: string;
  fix: string;
  actualData?: string;
  didYouMean?: string;
}
