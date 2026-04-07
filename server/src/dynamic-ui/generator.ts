// EX1.8: DynamicUIGenerator Service — generates DynamicView JSON from command output
// @see docs/phases/phase-ex1.md

import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { LLMProvider, ParseResult } from '../llm/provider.js';
import type { LLMUsageTracker } from '../llm/usage-tracker.js';
import type { OutputCache } from '../cache/output-cache.js';
import type { DynamicUIDiskCache } from '../cache/dynamic-ui-cache.js';
import { TemplateRegistry } from './template-registry.js';
import { ALL_TEMPLATES } from './templates/index.js';
import stripAnsi from 'strip-ansi';
import { createHash } from 'node:crypto';

// ── System Prompt ──────────────────────────────────────────────────

export const DYNAMIC_UI_SYSTEM_PROMPT = `You are a UI generator for HeadlessOS. Given terminal command output, generate a DynamicView JSON schema that best visualizes the data.

## Widget Selection Rules
- **table**: Lists of records. Use column type "badge" + badgeVariant map for statuses, "mono" for IPs/hashes, "rich" with segments for compound cells (dot+text+badges in one column). Add filters:{search:true, dropdowns:[...]} for filterable tables. Use actionStyle:"dropdown" for row actions behind a ⋯ menu. Set emptyState:{icon,title,message} for tables that may have 0 rows.
- **stat-card**: Single numeric metrics (CPU %, connection count, etc.)
- **badge-grid**: Status overviews (Running: 5, Stopped: 2)
- **key-value**: Config/info pairs. Use layout: "grid-2"/"grid-3"/"grid-4" for multi-column layout. Pairs can have icon and copyable.
- **progress-bar**: Utilization percentages (disk, memory, CPU). variant: default/success/warning/destructive
- **code-block**: Raw config/code output
- **log-viewer**: Log lines with timestamps and levels
- **chart**: Numeric series (bar/line/area/pie/donut)
- **alert**: Warnings, errors, important status messages
- **card-list**: Items as horizontal cards with icon, title, badge (with dot), and detail rows — ideal for network interfaces, services, etc.
- **form**: Editable configuration. Use when writeBack is needed.
- **tree**: Hierarchical recursive data (file trees, dependency trees)

## Layout Rules
- Prefer **stack** for most views, **grid** for stat-card/metric collections
- Use **tabs** for multi-section data (e.g., Ports + Connections + Interfaces). Tabs support icon (Lucide name) and count (number badge).
- Use **sidebar** for app-level navigation (e.g., Server Admin sections). Sidebar items support icon.
- Layouts are **nestable**: tabs inside a sidebar section, grids inside a stack, etc.

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
  private usageTracker: LLMUsageTracker | null;
  private outputCache: OutputCache | null;
  private diskCache: DynamicUIDiskCache | null;

  constructor(opts?: {
    llmProvider?: LLMProvider;
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
    const { tool, command, rawOutput, serverId, bypassCache } = input;
    const cacheCommand = `dynamic-ui:${command}`;

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

    // 5. Build prompt with template hint
    const userPrompt = this.buildUserPrompt(tool, command, cleanOutput, bestMatch?.template.schema);

    // 6. Call LLM
    const startTime = Date.now();
    let result: ParseResult<DynamicView>;
    try {
      result = await this.llmProvider.parseText<DynamicView>({
        rawOutput: cleanOutput,
        command,
        schema: DynamicViewSchema,
        systemPrompt: DYNAMIC_UI_SYSTEM_PROMPT,
        userPrompt,
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
  ): string {
    let prompt = `Generate a DynamicView JSON for the following terminal output.

Tool: ${tool}
Command: ${command}

Terminal output:
\`\`\`
${cleanOutput.slice(0, 8000)}
\`\`\`
`;

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
