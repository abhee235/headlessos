// EX2.5: Reactive Executor
// EX10.3: the system prompt is sized to the model's window tier (full / lean / minimal)
// EX10.4: a context manager runs before every call (compaction, cut-offs, overflow), and a run
// that cannot go on finishes with its last valid partial view and the reason
// EX10.11: the EX9.4 loop guard (warn → refuse → stop); a stuck run finishes with a full
// partial view or one generate_schema-only turn; reminders ride on the last tool result
// EX10.13: a garbled reply is asked again; a model that stopped answering ends the run
// @see docs/phases/phase-ex2.md — EX2.5, docs/phases/phase-ex10.md §4–§5, §8c
//
// A reactive tool-calling loop where the LLM decides which tools to call
// dynamically based on observed results. Uses native OpenAI function calling.
// Inspired by Roo Code (stack-based loop, consecutive mistake detection)
// and Aider (Zod validation as "linter").

import { DynamicViewSchema, type DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import type { ModelRouter } from '../llm/model-router.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import { toolsToOpenAIFunctions } from './tools/tool-converter.js';
import type { ToolContext, AgentTool } from './tools/types.js';
import { checkGuardrails } from './guardrails.js';
import type { PlannerHints } from './planner.js';
// Canonical ReflectionIssue (derived from reflector's Zod schema); re-exported below
// so existing importers of it from this module keep working and both modules share one type.
import type { ReflectionIssue } from './reflector.js';
import { isLLMIncomplete, isLLMTimeout, isUnusableReply, type ChatMessage } from '../llm/provider.js';
import { withSpan, withSpanGen, setSpanAttributes } from '../observatory/context.js';
import { getDefaultCatalog } from './actions/catalog/index.js';
import { checkToolArgs, dropNullArgs, extractProseToolCalls, malformedArgsMessage, parseToolArgs } from './loop/tool-input.js';
import { markUntrusted, UNTRUSTED_RULE } from './actions/tools.js';
import { planForProvider, type PromptTier } from './context/plan.js';
import { ContextManager, chatSummarizer, type CompactionEvent } from './context/manager.js';
import { estimateToolsTokens } from './context/tokens.js';
import { LoopGuard, type FoldedCall, type LoopFinding } from './loop/loop-guard.js';
import { appendNote } from './loop/notes.js';
import { sourceFor } from './tools/widget-source.js';

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

/** EX10.3 follow-up (phase-ex10 §8d item 11): the first filled view kept running past 8,192 tokens */
export const VIEW_SIZE_RULE =
  'Keep every view small: you write each character, and a reply past the output limit is lost. At most 30 log lines per log-viewer (the latest), 20 rows per table, short titles; never paste a whole file or command output.';

/** EX10.10: what a bound widget looks like (ADR-026); every tier shows these three */
const WIDGET_EXAMPLES = `   {"section":"cpu","widget":{"type":"stat-card","title":"CPU","unit":"%","source":{"action":"cpu_usage","path":"overallPercent"}}}
   {"section":"disk","widget":{"type":"table","title":"Filesystems","source":{"action":"disk_usage"}}}
   {"section":"logs","widget":{"type":"log-viewer","title":"dpkg.log","source":{"action":"file_tail","params":{"path":"/var/log/dpkg.log"}}}}`;

const SOURCE_FIELDS =
  'source fields: action (required; one you already called), params (which call, when there were several), path (into the JSON the action returned; "cores.*.percent" maps a list), reduce (count|sum|avg|max|min), limit (rows or lines). Without a source, write the widget\'s content yourself (alerts, notes).';

const WORKFLOW_FULL = `## Workflow — Build the View Widget by Widget (MANDATORY)

The user sees the UI window build up LIVE as you work. The server fills each widget's data from the actions you ran, so you never copy values, rows or log lines.

### Step-by-step:

1. **get_server_context()** — Understand the server (OS, installed tools, etc.)

2. **start_view()** — The title and the sections, e.g. \`{"title":"System Overview","icon":"Server","sections":[{"id":"cpu","label":"CPU","icon":"Cpu"},{"id":"disk","label":"Disk","icon":"HardDrive","layout":"grid"}]}\`. The window opens with one sidebar item per section.

3. **Action tools — gather data for the FIRST section** — e.g. cpu_usage, disk_usage, service_status. You cannot write shell commands; each action is a tool with typed parameters. Most return JSON: note its field names.

4. **add_widget() — once per widget**, with a "source" pointing at an action result:
${WIDGET_EXAMPLES}
   ${SOURCE_FIELDS}

5. **Repeat steps 3–4** for each remaining section.

6. **finish()** — When every section has its widgets. It validates the view and ends the session.

### Critical Rules:
- ALWAYS call start_view() BEFORE gathering data. The user must see something immediately.
- Bind widgets with "source" instead of writing data into them; a bad path gets an error that lists the fields.
- replace_widget() and remove_widget() change one widget by its position (0-based) in a section.
- To send a whole view at once instead, update_view() and generate_schema() still work: a JSON object, not a string.
- ${VIEW_SIZE_RULE}

`;

const WORKFLOW_SHORT = `## Workflow — build the view widget by widget
1. get_server_context() once.
2. start_view() with the title and sections (each: id, label, icon).
3. For each section: call its actions, then add_widget() once per widget. Give each widget a "source" and the server fills in its data from that action's result. Never copy values or log lines yourself:
${WIDGET_EXAMPLES}
   ${SOURCE_FIELDS}
4. finish() when every section has its widgets.
Each action result carries "widgetSource": put it in the widget as "source" to show that result. You cannot write shell commands; each action is a tool with typed parameters.
${VIEW_SIZE_RULE}

`;

// ── EX10.4: context handling ──

/** forced compactions + retries after a context-overflow error */
const MAX_OVERFLOW_RETRIES = 2;

export const VIEW_CUT_OFF =
  'Your last reply was cut off at the output limit. Send your next step as ONE tool call. Keep views compact: short titles, no descriptions, at most 20 table rows.';

/** EX10.4 follow-up: the reply was stopped for taking too long (LLMTimeoutError) */
export const VIEW_TIMED_OUT =
  'Your last reply took too long and was stopped. Send your next step as ONE tool call. Keep views small: at most 20 table rows or 30 log lines, short descriptions.';

/** EX10.11: steps before the limit at which the model is told to finish */
const STEPS_LEFT_WARNING = 3;
/** EX10.11: the UI Agent's way out, in the loop guard's messages */
const VIEW_FINISH = 'build the view with what you have (add_widget, then finish)';
/** EX10.11: the wrap-up turn of a stuck run (EX10.10: finish, or a whole view) */
export function viewStuck(tool: string): string {
  return `You are stuck repeating ${tool}. Stop gathering data. Call finish now with the widgets you have (or generate_schema with a whole view); leave out what you could not get.`;
}
/** EX10.11: the wrap-up turn at the step limit */
export const VIEW_OUT_OF_STEPS =
  'You have used all your steps. Call finish now with the widgets you have (or generate_schema with a whole view); leave out what you could not get.';
/** EX10.13: a reply that broke down into repeated characters is dropped and asked again (twice) */
export const VIEW_GARBLED =
  'Your last reply broke down into repeated characters and was discarded. Send your next step again as ONE tool call.';
/** EX10.13 follow-up: Ollama closed the reply before it was finished (LLMIncompleteError) */
export const VIEW_UNFINISHED =
  'Your last reply ended before it was finished and was discarded. Send your next step again as ONE tool call, with plain values.';
const MAX_GARBLED = 2;

function compactionNote(e: CompactionEvent): string {
  const how = {
    collapse: 'dropped older copies of the view',
    mask: 'shortened long old results',
    microcompact: 'shortened old results',
    summarize: 'summarized earlier steps',
    drop: 'removed the oldest steps',
    survival: 'kept only the latest step',
  }[e.layer];
  return `Made room in the model’s context: ${how} (${e.before.toLocaleString('en-US')} → ${e.after.toLocaleString('en-US')} tokens)`;
}

/** Sidebar labels whose section has nothing in it yet */
export function emptySections(view: DynamicView): string[] {
  const isEmpty = (layout: unknown): boolean => {
    const l = layout as { children?: unknown[]; tabs?: Array<{ children?: unknown[] }> } | undefined;
    if (!l) return true;
    if (Array.isArray(l.tabs)) return l.tabs.every((t) => !t.children?.length);
    return !l.children?.length;
  };
  return view.sidebarItems.filter((item) => isEmpty(view.sections[item.id])).map((item) => item.label);
}

/** EX10.11: the last partial view, when it is valid and every section has content. */
function completeView(partial: Record<string, unknown> | null): DynamicView | null {
  const parsed = partial ? DynamicViewSchema.safeParse(partial) : null;
  if (!parsed?.success || parsed.data.sidebarItems.length === 0) return null;
  return emptySections(parsed.data).length === 0 ? parsed.data : null;
}

/**
 * EX10.4: the run cannot go on. If the last partial view is a valid view, finish with it
 * and say why; otherwise report the reason as the error.
 */
function* finishEarly(partial: Record<string, unknown> | null, reason: string): Generator<AgentEvent> {
  const parsed = partial ? DynamicViewSchema.safeParse(partial) : null;
  if (parsed?.success) {
    yield { type: 'generation_incomplete', view: parsed.data, reason, emptySections: emptySections(parsed.data) };
    return;
  }
  yield { type: 'error', message: `Stopped: ${reason}, before any complete view was built.` };
}

// ── Agent Event Types ──

/** EX3-C.2: Layout update phases for progressive rendering */
export type LayoutUpdatePhase = 'skeleton' | 'widget' | 'complete' | 'error';

export type AgentEvent =
  | { type: 'thinking'; message: string }
  | { type: 'tool_result'; tool: string; success: boolean; outputPreview: string; latencyMs: number }
  | { type: 'tool_blocked'; tool: string; reason: string }
  | { type: 'partial_view'; view: Record<string, unknown> }
  | { type: 'generation_complete'; view: DynamicView }
  /** EX10.4: stopped early; the last valid partial view, why, and which sections are still empty */
  | { type: 'generation_incomplete'; view: DynamicView; reason: string; emptySections: string[] }
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
}

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxSteps: 30,
  maxConsecutiveMistakes: 3,
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

    // EX10.11: warn → refuse → stop on repeats, as in the investigation agent
    const guard = new LoopGuard({ finish: VIEW_FINISH });

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
    // EX10.4: context handling from the run's plan (EX10.2), and the last view worth keeping
    const plan = context.plan ?? planForProvider(this.modelRouter.toolProvider ?? null);
    const ctx = new ContextManager({ plan, summarize: chatSummarizer((input) => this.modelRouter.chat(input)) });
    const overhead = estimateToolsTokens(openAITools);
    let lastPartialView: Record<string, unknown> | null = null;
    let overflowRetries = 0;
    let forceCompaction = false;
    let garbledRetries = 0;
    /** EX10.11: the tool the run got stuck repeating */
    let stuckOn: string | null = null;

    // ── REACTIVE LOOP ──
    while (stepCount < this.config.maxSteps && !stuckOn) {
      stepCount++;

      yield { type: 'thinking', message: `Step ${stepCount}...` };

      // EX10.11: say when the end is near, on the last tool result
      if (this.config.maxSteps > STEPS_LEFT_WARNING + 1 && stepCount === this.config.maxSteps - STEPS_LEFT_WARNING + 1) {
        appendNote(messages, `${STEPS_LEFT_WARNING} steps left: add your last widgets and call finish soon; leave out what you could not get.`);
      }

      // EX10.4: compact before the call when the history reached the plan's trigger
      const prepared = await ctx.prepare(messages, overhead, { force: forceCompaction });
      forceCompaction = false;
      if (prepared.messages !== messages) messages.splice(0, messages.length, ...prepared.messages);
      for (const e of prepared.events) yield { type: 'thinking', message: compactionNote(e) };
      // EX10.11 follow-up: a result read again after it was trimmed is not a repeat
      if (prepared.events.some((e) => e.layer !== 'collapse')) guard.reset();

      // Call LLM with native function calling
      let response: Awaited<ReturnType<ModelRouter['chat']>>;
      try {
        // EX10.4 follow-up: after a cut-off or timeout, a smaller cap for the retry
        const cap = ctx.replyCap();
        response = await this.modelRouter.chat({
          messages,
          tools: openAITools,
          tool_choice: 'auto',
          ...(cap ? { maxTokens: cap } : {}),
        });
      } catch (err) {
        // EX10.4 follow-up: the reply took too long — like a cut-off: a smaller step (3 times), then stop
        // EX10.13: a model that stopped answering altogether is not asked again
        if (isLLMTimeout(err)) {
          if (err.alive !== false && ctx.lengthStrike()) {
            messages.push({ role: 'user', content: VIEW_TIMED_OUT });
            yield { type: 'thinking', message: `The model took too long (${err.message}); asking for a smaller step` };
            continue;
          }
          yield* finishEarly(lastPartialView, err.alive === false ? 'the model stopped answering' : 'the model kept taking too long to answer');
          return;
        }
        // EX10.13: a garbled or unfinished reply is dropped and asked again (twice), then stop
        if (isUnusableReply(err)) {
          const unfinished = isLLMIncomplete(err);
          if (garbledRetries++ < MAX_GARBLED) {
            appendNote(messages, unfinished ? VIEW_UNFINISHED : VIEW_GARBLED);
            yield {
              type: 'thinking',
              message: unfinished ? 'Ollama ended the model’s reply before it was finished; asking again' : 'The model’s reply broke down into repeated characters; asking again',
            };
            continue;
          }
          yield* finishEarly(lastPartialView, unfinished ? 'Ollama kept ending the model’s replies before they were finished' : 'the model’s replies kept breaking down into repeated characters');
          return;
        }
        // EX10.4: the provider refused the prompt as too long — compact harder and retry (twice)
        if (!ContextManager.isOverflowError(err)) {
          // EX10.4 follow-up: a call that still fails after the provider's own retries ends the
          // run with what was built, not with a bare error
          yield* finishEarly(lastPartialView, `the model call failed (${err instanceof Error ? err.message : String(err)})`);
          return;
        }
        if (overflowRetries++ < MAX_OVERFLOW_RETRIES) {
          forceCompaction = true;
          stepCount--;
          continue;
        }
        yield* finishEarly(lastPartialView, 'the model’s context window is full');
        return;
      }
      ctx.observe(response.tokensUsed.input, messages);
      setSpanAttributes({
        attributes: {
          contextUsed: response.tokensUsed.input || ctx.used(messages, overhead),
          contextWindow: plan.window,
          contextTrigger: plan.trigger,
        },
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

      // EX10.4: a reply cut off at the output limit is not "text only" — remind (3 times), then stop
      if (response.finishReason === 'length' && !assistantMessage.tool_calls?.length) {
        if (ctx.lengthStrike()) {
          messages.push({ role: 'user', content: VIEW_CUT_OFF });
          yield { type: 'thinking', message: 'The model’s reply was cut off at its output limit; asking for a smaller step' };
          continue;
        }
        yield* finishEarly(lastPartialView, 'the model’s replies kept getting cut off at its output limit');
        return;
      }
      ctx.resetLength();

      // Append assistant message to history
      messages.push(assistantMessage);

      // ── Case 1: LLM called tools ──
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        consecutiveMistakes = 0; // Reset — LLM is doing something

        let didToolFailInCurrentTurn = false;
        let schemaCallResult: { toolCallId: string; schema: unknown } | null = null;
        // EX10.11: each call and the text the model got back, for the loop guard
        const folded: FoldedCall[] = [];
        const findings: LoopFinding[] = [];

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const tool = this.toolRegistry.get(toolName);
          // EX9.3: repair broken JSON before giving up (small models)
          const parsedArgs = parseToolArgs(toolCall.function.arguments);
          // EX10.6: a null is "not given" for every tool
          const toolArgs = parsedArgs.via === 'raw' ? null : (dropNullArgs(parsedArgs.input) as Record<string, unknown>);
          // EX10.11: unparseable arguments repeat as the same text
          const guardInput = toolArgs ?? { raw: parsedArgs.raw ?? '' };
          const answer = (content: string, ok: boolean) => {
            messages.push({ role: 'tool', content, tool_call_id: toolCall.id });
            folded.push({ name: toolName, input: guardInput, ok, output: content, mutating: !!tool?.mutating });
          };

          // EX10.11: a call already warned about, repeated from the previous turn, is not run
          if (guard.blocked(toolName, guardInput)) {
            const finding = guard.refused(toolName, guardInput);
            findings.push(finding);
            const error = finding.kind === 'stop' ? `Not run: ${toolName} with this input already returned the same result.` : finding.message;
            messages.push({ role: 'tool', content: JSON.stringify({ success: false, error }), tool_call_id: toolCall.id });
            yield { type: 'tool_result', tool: toolName, success: false, outputPreview: error.slice(0, 200), latencyMs: 0 };
            continue;
          }

          if (toolArgs === null) {
            const shape = (tool?.parameters as { shape?: Record<string, unknown> } | undefined)?.shape;
            answer(JSON.stringify({
              success: false,
              error: malformedArgsMessage(toolName, parsedArgs.raw ?? '', shape ? Object.keys(shape) : []),
            }), false);
            yield { type: 'error', message: `${toolName}: invalid JSON arguments` };
            didToolFailInCurrentTurn = true;
            continue;
          }

          if (!tool) {
            answer(JSON.stringify({
              success: false,
              error: `Unknown tool: ${toolName}. Available tools: ${this.toolRegistry.getNames().join(', ')}`,
            }), false);
            yield { type: 'error', message: `Unknown tool: ${toolName}` };
            didToolFailInCurrentTurn = true;
            continue;
          }

          // Guardrail check
          const verdict = checkGuardrails(tool, toolArgs);
          if (!verdict.allowed) {
            answer(JSON.stringify({
              success: false,
              error: `Tool blocked by guardrails: ${verdict.reason}`,
            }), false);
            yield { type: 'tool_blocked', tool: toolName, reason: verdict.reason ?? 'Blocked' };
            didToolFailInCurrentTurn = true;
            continue;
          }

          // EX10.6: after the guardrails, other tools' arguments are checked here, in one line; actions check their own (aliases, coercion)
          if (tool.securityTier !== 'action') {
            const checked = checkToolArgs(tool, toolArgs);
            if (!checked.ok) {
              answer(JSON.stringify({ success: false, error: checked.error }), false);
              yield { type: 'tool_result', tool: toolName, success: false, outputPreview: checked.error.slice(0, 200), latencyMs: 0 };
              didToolFailInCurrentTurn = true;
              continue;
            }
          }

          // Execute tool — wrapped in Observatory TOOL span (EX4-B.2)
          const startTime = Date.now();
          try {
            const result = await withSpan(`tool:${toolName}`, 'TOOL', async () => {
              return tool.execute(toolArgs, context);
            }, { input: toolArgs });
            const latencyMs = Date.now() - startTime;

            // EX9.5: server output reaches the model marked as data
            // EX10.5: metadata (partialView, schema, action details) stays server-side
            // EX10.10: in a run that builds widgets, each result says how to show it
            const bindable = tool.securityTier === 'action' && result.success && !!this.toolRegistry.get('add_widget');
            const forModel = {
              success: result.success,
              output: tool.securityTier === 'action' && result.metadata?.command ? markUntrusted(toolName, result.output) : result.output,
              ...(result.error ? { error: result.error } : {}),
              ...(bindable ? { widgetSource: sourceFor(toolName, toolArgs) } : {}),
            };
            answer(JSON.stringify(forModel), result.success);
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

            // Cache output for grep_output tool (EX10.11: not its own results, which would
            // snowball into every later search and never repeat for the loop guard)
            if (result.success && result.output && toolName !== 'grep_output') {
              context.previousOutputs.set(
                `${toolName}:${JSON.stringify(toolArgs)}`,
                result.output,
              );
            }

            // Progressive rendering: update_view, and EX10.10's widget tools, send a snapshot
            if (result.success && result.metadata?.partialView) {
              lastPartialView = result.metadata.partialView as Record<string, unknown>;
              yield {
                type: 'partial_view',
                view: result.metadata.partialView as Record<string, unknown>,
              };
            }

            // The final view: generate_schema, or EX10.10's finish
            if (result.success && result.metadata?.schema && result.metadata?.isTerminalTool) {
              schemaCallResult = { toolCallId: toolCall.id, schema: result.metadata.schema };
            }
          } catch (err) {
            const latencyMs = Date.now() - startTime;
            answer(JSON.stringify({
              success: false,
              error: `Tool execution failed: ${(err as Error).message}`,
            }), false);
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

        // EX10.11: warnings ride on the last tool result; a stop ends the loop
        findings.push(...guard.fold(folded));
        for (const f of findings) {
          const message = f.kind === 'stop' ? viewStuck(f.tool ?? 'the same call') : f.message;
          yield { type: 'safety_warning', warning: 'tool_repetition', ...(f.tool ? { tool: f.tool } : {}), message };
        }
        const stop = findings.find((f) => f.kind === 'stop');
        if (stop) {
          stuckOn = stop.tool ?? 'the same call';
        } else {
          const notes = findings.filter((f) => f.rule !== 'refused').map((f) => f.message);
          if (notes.length) appendNote(messages, notes.join('\n'));
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
          // EX10.4: keep what was built so far
          yield* finishEarly(lastPartialView, 'the model stopped calling tools');
          return;
        }

        // Nudge the LLM to use tools (EX10.11: as a note)
        appendNote(messages, 'Please use the available tools: call the actions you need, add widgets with add_widget, then call finish. Do not just respond with text.');
      }
    }

    // EX10.11: stuck, or out of steps. A stuck run whose view is already full ends with it.
    if (stuckOn) {
      const view = completeView(lastPartialView);
      if (view) {
        yield { type: 'thinking', message: `Stopped repeating ${stuckOn}; every section of the view has content, so it is used as is` };
        yield { type: 'generation_complete', view };
        return;
      }
    }
    // Otherwise one turn to build the view from what was gathered
    const wrapped = yield* this.wrapUp(messages, context, ctx, overhead, stuckOn ? viewStuck(stuckOn) : VIEW_OUT_OF_STEPS);
    if (wrapped) {
      yield { type: 'generation_complete', view: wrapped };
      return;
    }
    // EX10.4: keep what was built so far
    yield* finishEarly(lastPartialView, stuckOn
      ? `the model kept repeating ${stuckOn} without getting anything new`
      : `it reached the maximum step limit (${this.config.maxSteps})`);
  }

  /**
   * EX10.11: one last turn offering only generate_schema, after a stuck run or at the step
   * limit. The view when the model sends a valid one; otherwise (any failure) null.
   */
  private async *wrapUp(
    messages: ChatMessage[],
    context: ToolContext,
    ctx: ContextManager,
    overhead: number,
    note: string,
  ): AsyncGenerator<AgentEvent, DynamicView | null> {
    const tool = this.toolRegistry.get('generate_schema');
    if (!tool) return null;
    // EX10.10: with a working view, finish ends the run with what was built
    const finish = context.workingView ? this.toolRegistry.get('finish') : undefined;
    appendNote(messages, note);
    yield { type: 'thinking', message: 'Asking the model to build the view from what it has' };
    try {
      const prepared = await ctx.prepare(messages, overhead);
      const response = await this.modelRouter.chat({
        messages: prepared.messages,
        tools: toolsToOpenAIFunctions(finish ? [finish, tool] : [tool]),
        tool_choice: 'auto',
      });
      // a small model may still send update_view, though it is not offered: the same view
      const call = response.message.tool_calls?.find((tc) => [tool.name, 'update_view', ...(finish ? [finish.name] : [])].includes(tc.function.name));
      if (!call) return null;
      const parsed = parseToolArgs(call.function.arguments);
      if (parsed.via === 'raw') return null;
      const input = dropNullArgs(parsed.input) as Record<string, unknown>;
      const chosen = finish && call.function.name === finish.name ? finish : tool;
      const args = chosen === finish ? {} : call.function.name === tool.name ? input : { schema: input.view };
      const started = Date.now();
      let result = await withSpan(`tool:${chosen.name}`, 'TOOL', async () => chosen.execute(args, context), { input: args });
      // a finish that met empty sections leaves them out the second time
      if (chosen === finish && !result.success && context.workingView?.emptySectionIds().length) result = await chosen.execute(args, context);
      yield { type: 'tool_result', tool: chosen.name, success: result.success, outputPreview: (result.output || result.error || '').substring(0, 200), latencyMs: Date.now() - started };
      const view = result.success ? DynamicViewSchema.safeParse(result.metadata?.schema) : null;
      return view?.success ? view.data : null;
    } catch {
      return null;
    }
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
Your job is to gather data from a Linux server via tools and build a DynamicViewSchema view.
The user sees the UI build up LIVE: every start_view and add_widget shows at once.

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
- Call an action before you bind a widget to it; finish() (or generate_schema()) comes last
- Use specific actions over broad ones (service_status for one unit rather than service_list)
- If an action fails, try another one (e.g. nginx_test failed → file_read /etc/nginx/nginx.conf)
- To read a file, use file_read (or file_tail for the end of a log)
- ${UNTRUSTED_RULE}
- update_view() and generate_schema() take the view as a JSON object, not a string
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

    const ids = sections.map((s) => s.toLowerCase().replace(/\s+/g, '-'));
    const startArgs = JSON.stringify({ title: hints.intent.substring(0, 30), icon: 'Server', sections: sections.map((s, i) => ({ id: ids[i], label: s, icon: this.pickIconForSection(s) })) });
    return `## Example: Progressive Sections Pattern

Here is exactly how to build this multi-section view. Follow this pattern:

\`\`\`
Step 1: get_server_context()
Step 2: start_view(${startArgs})
  → User sees the sidebar with ${sections.length} empty sections (skeleton placeholders)
${sections.map((s, i) => `Step ${3 + i * 2}: action tools x N — gather data for "${s}"
Step ${4 + i * 2}: add_widget({"section":"${ids[i]}","widget":{..., "source":{"action":"<the action>", "path":"<a field>"}}}) — once per widget
  → User sees ${s} fill with real data`).join('\n')}
Final: finish() — every section has its widgets
\`\`\`
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
