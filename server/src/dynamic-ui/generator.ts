// EX1.8 + EX3-A.1: DynamicUIGenerator Service — generates DynamicView JSON from command output
// Two-pass pipeline: classify (fast model) -> generate (structured-output model)
// @see docs/phases/phase-ex1.md, docs/phases/phase-ex3.md

import type { ZodSchema } from 'zod';
import type { DynamicView, DesignClassification } from 'headlessos-shared/schemas/dynamic-view';
import { DynamicViewSchema, DesignClassificationSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { LLMProvider, ParseResult } from '../llm/provider.js';
import type { LLMUsageTracker } from '../llm/usage-tracker.js';
import type { OutputCache } from '../cache/output-cache.js';
import type { DynamicUIDiskCache } from '../cache/dynamic-ui-cache.js';
import { TemplateRegistry } from './template-registry.js';
import { ALL_TEMPLATES } from './templates/index.js';
import { DesignClassifier } from './design-classifier.js';
import { getLayoutPattern, getPatternRulesText, generateDesignSystemRules } from './layout-patterns.js';
import stripAnsi from 'strip-ansi';
import { createHash } from 'node:crypto';
import { withTrace, withSpan, setSpanAttributes } from '../observatory/context.js';

// ── System Prompt ──────────────────────────────────────────────────

// EX3-B.1: Design rules are generated from the layout-patterns registry.
const DESIGN_SYSTEM_RULES = generateDesignSystemRules();

export const DYNAMIC_UI_SYSTEM_PROMPT = `You are a UI generator for HeadlessOS. Given terminal command output, generate a DynamicView JSON schema that best visualizes the data.

## Widget Selection Rules
- **table**: Lists of records. Use column type "badge" + badgeVariant map for statuses, "mono" for IPs/hashes, "rich" with segments for compound cells (dot+text+badges in one column). Add filters:{search:true, dropdowns:[...]} for filterable tables. Use actionStyle:"dropdown" for row actions behind a ⋯ menu. Set emptyState:{icon,title,message} for tables that may have 0 rows.
- **stat-card**: Single numeric metrics (CPU %, connection count, etc.)
- **badge-grid**: Status overviews (Running: 5, Stopped: 2)
- **key-value**: Config/info pairs. Use layout: "grid-2"/"grid-3"/"grid-4" for multi-column layout. Pairs can have icon and copyable.
- **progress-bar**: Utilization percentages (disk, memory, CPU). variant: default/success/warning/destructive
- **code-block**: Raw config/code output
- **log-viewer**: Log lines with timestamps and levels
- **chart**: Numeric series (bar/line/area/pie/donut) — USE SPARINGLY, only when stat-card/progress-bar are insufficient
- **alert**: Warnings, errors, important status messages
- **card-list**: Items as horizontal cards with icon, title, badge (with dot), and detail rows — ideal for network interfaces, services, etc.
- **form**: Editable configuration. Use when writeBack is needed.
- **tree**: Hierarchical recursive data (file trees, dependency trees)
- **gauge**: Percentage value as semicircle dial — ONLY when classifier approves (1-3 key percentages)
- **sparkline-stat**: Stat-card with inline micro chart trend — for time-series summary

${DESIGN_SYSTEM_RULES}

## Widget Selection Matrix
DATA TYPE -> WIDGET:
- Single number with label -> stat-card
- Percentage (1-3 values, severity matters) -> progress-bar (or gauge if classifier approves)
- Name:value pairs (< 10) -> key-value (grid-3 layout)
- Name:value pairs (10+) -> table (2-column)
- List of items with attributes -> table (with filters if >10 rows)
- Items with icon+status+actions -> card-list
- Status flags (on/off, enabled) -> badge-grid
- Raw config/script/log content -> code-block
- Hierarchical data -> tree
- Warning/error to highlight -> alert (above relevant content)
- Time-series trend (5+ points) -> sparkline-stat (if 1 metric) or chart line/area (RARE)
- Category comparison (3-7 items) -> chart bar (RARE, only if classifier approves)

## Anti-Patterns (NEVER DO)
- Stack stat-cards vertically (use grid with autoFit:true)
- Put multiple tables in one tab
- Add chart when stat-card + progress-bar suffices
- Create empty tabs for "future use"
- Use code-block for tabular data (use table)
- Put summary stats inside tabs (they go at root)
- Create more than 2 levels of nesting
- Use gauge for non-percentage data
- Use chart/gauge without classifier approval (useVisualization:true)

## Badge Variants
success = running/active/ok/up, destructive = error/failed/down/critical, warning = degraded/pending/slow, secondary = inactive/disabled/unknown, outline = neutral

## Table Rich Columns (type: "rich")
Use segments array for compound cells: [{segment:"dot",key:"isPublic",color:"amber"}, {segment:"text",key:"port",className:"font-mono"}, {segment:"badge",key:"tag",badgeVariant:{...}}, {segment:"icon",icon:"Lock",key:"isSecure"}]

## General Rules
- If a template hint is provided, use it as structural guidance but fill with real data from the output
- Maximum 10 widgets per view (avoid overwhelming the user)
- Extract REAL data from the terminal output — never invent values
- For numeric values, parse actual numbers from the output
- Icon names are Lucide icon names (PascalCase): Network, Lock, Shield, Radio, Activity, etc.`;

// ── Types ──────────────────────────────────────────────────────────

export interface GenerateInput {
  /** Tool/application name (e.g. "nginx", "docker", "df") */
  tool: string;
  /** The command that was run */
  command: string;
  /** Raw terminal output (may contain ANSI codes) */
  rawOutput: string;
  /** Server ID for caching */
  serverId: string;
  /** Bypass all caches and force regeneration */
  bypassCache?: boolean;
}

export interface GenerateResult {
  view: DynamicView;
  /** Where the result came from */
  source: 'cache' | 'llm';
  /** Template used as hint, if any */
  templateId?: string;
  /** EX3-A.1: Design classification from Pass 1 */
  classification?: DesignClassification;
  /** LLM stats (only when source === 'llm') */
  llmStats?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  };
}

/** WebSocket message types for streaming progress */
export type DynamicUIMessage =
  | { type: 'generating'; tool: string; templateId?: string }
  | { type: 'complete'; view: DynamicView; source: 'cache' | 'llm'; templateId?: string }
  | { type: 'error'; message: string; partialView?: Partial<DynamicView> };

// ── Generator ──────────────────────────────────────────────────────

export class DynamicUIGenerator {
  private registry: TemplateRegistry;
  private llmProvider: LLMProvider | null;
  private classifier: DesignClassifier | null;
  private usageTracker: LLMUsageTracker | null;
  private outputCache: OutputCache | null;
  private diskCache: DynamicUIDiskCache | null;

  constructor(opts?: {
    llmProvider?: LLMProvider;
    classifierProvider?: LLMProvider;
    usageTracker?: LLMUsageTracker;
    outputCache?: OutputCache;
    diskCache?: DynamicUIDiskCache;
  }) {
    this.registry = new TemplateRegistry();
    this.registry.registerAll(ALL_TEMPLATES);
    this.llmProvider = opts?.llmProvider ?? null;
    this.usageTracker = opts?.usageTracker ?? null;
    this.outputCache = opts?.outputCache ?? null;
    this.diskCache = opts?.diskCache ?? null;

    // EX3-A.1: Create classifier using fast/cheap model if available
    const classifierLLM = opts?.classifierProvider ?? opts?.llmProvider ?? null;
    this.classifier = classifierLLM
      ? new DesignClassifier({
          llmProvider: classifierLLM,
          usageTracker: opts?.usageTracker,
        })
      : null;
  }

  /** EX8.21: set or clear the LLM at runtime (Settings → AI), with the classifier on it */
  setLLMProvider(provider: LLMProvider | null): void {
    this.llmProvider = provider;
    this.classifier = provider
      ? new DesignClassifier({ llmProvider: provider, usageTracker: this.usageTracker ?? undefined })
      : null;
  }

  /** Get the template registry (for external search/listing). */
  getRegistry(): TemplateRegistry {
    return this.registry;
  }

  /**
   * Generate a DynamicView from command output.
   * 1. Check cache → return immediately if hit
   * 2. Find matching template
   * 3. If no LLM provider → return template as-is (or error)
   * 4. Call LLM with template hint → validate → cache → return
   */
  async generate(input: GenerateInput): Promise<GenerateResult> {
    return withTrace(`DynamicUI: ${input.tool || input.command}`, {
      trigger: 'dynamic-ui',
      serverId: input.serverId,
      kind: 'CHAIN',
    }, () => this.generateCore(input));
  }

  /**
   * Core generation logic extracted for Observatory tracing (EX4-B.3).
   */
  private async generateCore(input: GenerateInput): Promise<GenerateResult> {
    const { tool, command, rawOutput, serverId, bypassCache } = input;
    const cacheCommand = `dynamic-ui:${command}`;

    // Record the generation request as input on the root span
    setSpanAttributes({ input: { tool, command, serverId } });

    // 1. Check memory cache (unless bypassed, e.g. "Regenerate" button)
    if (!bypassCache && this.outputCache) {
      const cached = this.outputCache.get<DynamicView>(serverId, cacheCommand, rawOutput);
      if (cached) {
        return { view: cached, source: 'cache' };
      }
    }

    // 1b. Check disk cache (second level, survives restarts)
    if (!bypassCache && this.diskCache) {
      const diskCached = await this.diskCache.get(
        serverId,
        command,
        this.hashOutput(rawOutput),
      );
      if (diskCached) {
        // Promote to memory cache
        if (this.outputCache) {
          this.outputCache.set(serverId, cacheCommand, rawOutput, diskCached);
        }
        return { view: diskCached, source: 'cache' };
      }
    }

    // 2. Find matching template
    const matches = this.registry.matchCommand(command);
    const bestMatch = matches[0]; // highest confidence

    // 3. No LLM provider → return template directly (dev/offline mode)
    if (!this.llmProvider) {
      if (bestMatch) {
        return {
          view: bestMatch.template.schema,
          source: 'cache',
          templateId: bestMatch.template.id,
        };
      }
      throw new Error(
        'No LLM provider configured and no matching template found for command: ' + command,
      );
    }

    // 4. Clean output
    const cleanOutput = stripAnsi(rawOutput);

    // 5. EX3-A.1: Run two-pass classification (if classifier available)
    // Wrapped in Observatory CHAIN span (EX4-B.3)
    let classification: DesignClassification | null = null;
    if (this.classifier) {
      try {
        const raw = await withSpan('DesignClassifier.classify', 'CHAIN', async () => {
          return this.classifier!.classify({
            tool,
            command,
            cleanOutput: cleanOutput.slice(0, 2000),
          });
        }, { input: { tool, command } });
        // Validate the classification result has expected shape
        const parsed = DesignClassificationSchema.safeParse(raw);
        classification = parsed.success ? parsed.data : null;
      } catch {
        // Classification failure is non-fatal — generator works without it
        classification = null;
      }
    }

    // 6. Build prompt with template hint + classification constraints
    const userPrompt = this.buildUserPrompt(tool, command, cleanOutput, bestMatch?.template.schema, classification);

    // 6. Call LLM — wrapped in Observatory LLM span (EX4-B.3)
    const startTime = Date.now();
    let result: ParseResult<DynamicView>;
    try {
      result = await withSpan('LLMGenerate', 'LLM', async () => {
        const llmResult = await this.llmProvider!.parseText<DynamicView>({
          rawOutput: cleanOutput,
          command,
          // DynamicView === z.infer<typeof DynamicViewSchema>, but TS can't verify a
          // recursive z.record+union ZodObject is assignable to ZodSchema<DynamicView>.
          schema: DynamicViewSchema as ZodSchema<DynamicView>,
          systemPrompt: DYNAMIC_UI_SYSTEM_PROMPT,
          userPrompt,
        });
        setSpanAttributes({
          model: llmResult.model,
          tokenUsage: { inputTokens: llmResult.tokensUsed.input, outputTokens: llmResult.tokensUsed.output, totalTokens: llmResult.tokensUsed.input + llmResult.tokensUsed.output },
          input: { tool, command },
          output: llmResult.data,
        });
        return llmResult;
      });
    } catch (err) {
      // If LLM fails but we have a template, fall back to it
      if (bestMatch) {
        return {
          view: bestMatch.template.schema,
          source: 'cache',
          templateId: bestMatch.template.id,
        };
      }
      throw err;
    }
    const latencyMs = Date.now() - startTime;

    // 7. Track LLM usage
    if (this.usageTracker) {
      this.usageTracker.recordCall({
        command: `dynamic-ui:${command}`,
        model: result.model,
        inputTokens: result.tokensUsed.input,
        outputTokens: result.tokensUsed.output,
        latencyMs,
        timestamp: new Date().toISOString(),
      });
    }

    // 8. Cache result (memory + disk)
    if (this.outputCache) {
      this.outputCache.set(serverId, cacheCommand, rawOutput, result.data);
    }
    if (this.diskCache) {
      await this.diskCache.set(
        serverId,
        command,
        this.hashOutput(rawOutput),
        tool,
        result.data,
      );
    }

    return {
      view: result.data,
      source: 'llm',
      templateId: bestMatch?.template.id,
      classification: classification ?? undefined,
      llmStats: {
        model: result.model,
        inputTokens: result.tokensUsed.input,
        outputTokens: result.tokensUsed.output,
        latencyMs,
      },
    };
  }

  /** Hash raw output for disk-cache key. */
  private hashOutput(rawOutput: string): string {
    return createHash('sha256').update(rawOutput).digest('hex').slice(0, 16);
  }

  /** Build the user prompt sent to the LLM. */
  private buildUserPrompt(
    tool: string,
    command: string,
    cleanOutput: string,
    templateHint?: DynamicView,
    classification?: DesignClassification | null,
  ): string {
    let prompt = `Generate a DynamicView JSON for the following terminal output.

Tool: ${tool}
Command: ${command}

Terminal output:
\`\`\`
${cleanOutput.slice(0, 8000)}
\`\`\`
`;

    // EX3-A.1: Inject classification constraints (from Pass 1)
    if (classification) {
      const patternRules = getPatternRulesText(classification.layoutPattern);
      prompt += `
## Design Classification (from classifier — FOLLOW these constraints)
Content type: ${classification.contentType}
Layout pattern: ${classification.layoutPattern}
Expected widgets: ${classification.expectedWidgets.join(', ')}
Section count: ${classification.sectionCount}
Use visualization: ${classification.useVisualization}${classification.visualizationReason ? ` (${classification.visualizationReason})` : ''}
Design notes: ${classification.designNotes}

## Layout Pattern Rules
${patternRules}

IMPORTANT: Follow the layout pattern rules above. Use the expected widgets listed.
${!classification.useVisualization ? 'Do NOT include any chart or gauge widgets.' : ''}
Use grid layout with autoFit:true for stat-card collections.
`;
    }

    if (templateHint) {
      prompt += `
Template hint (use this as structural guidance but fill with real data from the output above):
\`\`\`json
${JSON.stringify(templateHint, null, 2).slice(0, 4000)}
\`\`\`
`;
    }

    return prompt;
  }
}
