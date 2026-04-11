// EX3-A.1: Two-Pass Design Classifier
// @see docs/phases/phase-ex3.md
//
// Pass 1 — classifies terminal output into a content type + layout pattern
// using a fast/cheap model (gpt-4o-mini or gpt-4.1-nano).
// Pass 2 — the main generator uses the classification to constrain layout decisions.

import type { DesignClassification } from 'headlessos-shared/schemas/dynamic-view';
import { DesignClassificationSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { LLMProvider, ParseResult } from '../llm/provider.js';
import type { LLMUsageTracker } from '../llm/usage-tracker.js';
import { LAYOUT_PATTERN_IDS } from './layout-patterns.js';

// ── Classifier System Prompt ────────────────────────────

export const CLASSIFIER_SYSTEM_PROMPT = `You are a UI layout classifier. Given terminal command output, determine the best layout structure. You are NOT generating the UI — just classifying what kind of content this is and how it should be arranged.

## Content Type Detection

- Multiple numeric stats (CPU, memory, disk, uptime, counts) -> 'metrics-overview'
- A list/table of items (packages, ports, users, containers, files) -> 'data-table'
- Multiple related lists (e.g., mounts + partitions, listening + established connections, interfaces + routes) -> 'multi-dataset'
- Configuration file content (nginx.conf, sshd_config, yaml files) -> 'config-review'
- Service/daemon status checks (systemctl, service statuses, container states) -> 'status-board'
- Log file output (syslog, journalctl, application logs) -> 'log-analysis'
- Hierarchical data (directory listing, process tree, dependency tree) -> 'tree-hierarchy'
- Security scan results, compliance checks, vulnerability reports -> 'audit-report'
- Comparing 2+ similar items side-by-side -> 'comparison'
- Deep info about one item (container inspect, package info, user details) -> 'detail-view'

## Widget Selection Rules

- Prefer stat-card for single numeric values (CPU: 45%, Memory: 2.1GB, Uptime: 14d)
- Prefer table for lists of items with multiple attributes
- Prefer key-value for metadata (name:value pairs, < 10 items)
- Prefer badge-grid for status overviews (service states, boolean flags)
- Prefer card-list for items with icon + title + status + details
- Prefer code-block for raw config/script content
- Prefer alert for warnings, errors, or critical findings
- Prefer progress-bar for percentage values (disk usage, memory usage)

## When to Use chart/gauge (SPARINGLY — set useVisualization:true ONLY when justified)

- gauge: ONLY for 1-3 percentage values where visual arc adds clarity (e.g., disk 87% full)
- chart (pie/donut): ONLY for composition data with 3-7 slices
- chart (bar): ONLY when comparing counts across categories
- chart (line/area): ONLY for time-series data with 5+ data points
- NEVER use chart/gauge just because numbers exist — stat-card + progress-bar handle most cases
- When in doubt, set useVisualization:false

## Layout Pattern Selection

- metrics-overview -> 'dashboard-metrics' (grid of stat-cards, optional detail below)
- data-table -> 'single-table' (summary + table with filters)
- multi-dataset -> 'tabbed-detail' (summary stats, one tab per dataset)
- config-review -> 'config-viewer' (metadata + code block)
- status-board -> 'status-overview' (badge grid + detail table)
- log-analysis -> 'log-viewer' (summary + log viewer)
- tree-hierarchy -> 'tree-explorer' (metadata + tree)
- audit-report -> 'audit-report' (alert summary + categorized tables in tabs)
- comparison -> 'comparison-grid' (side-by-side or tabbed)
- detail-view -> 'detail-overview' (key-value + related tables)

## Important

- Be conservative with useVisualization — default to false
- sectionCount is the number of distinct data groups (e.g., 3 tables = sectionCount 3)
- expectedWidgets should list only widget types genuinely needed
- designNotes should be 1-2 sentences explaining the classification`;

// ── Classifier Class ────────────────────────────────────

export interface ClassifyInput {
  /** Tool name (e.g., "df", "docker", "nginx") */
  tool: string;
  /** The command that was run */
  command: string;
  /** Raw terminal output (ANSI-stripped, first 2K chars) */
  cleanOutput: string;
  /** Optional user prompt / question */
  userPrompt?: string;
}

export class DesignClassifier {
  private llmProvider: LLMProvider;
  private usageTracker: LLMUsageTracker | null;

  constructor(opts: {
    llmProvider: LLMProvider;
    usageTracker?: LLMUsageTracker;
  }) {
    this.llmProvider = opts.llmProvider;
    this.usageTracker = opts.usageTracker ?? null;
  }

  /**
   * Classify terminal output into a content type and layout pattern.
   * Uses a fast/cheap model to keep latency < 500ms.
   */
  async classify(input: ClassifyInput): Promise<DesignClassification> {
    const userPrompt = this.buildClassifierPrompt(input);

    const startTime = Date.now();
    const result: ParseResult<DesignClassification> = await this.llmProvider.parseText({
      rawOutput: input.cleanOutput,
      command: input.command,
      schema: DesignClassificationSchema,
      systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
      userPrompt,
    });
    const latencyMs = Date.now() - startTime;

    // Track usage
    if (this.usageTracker) {
      this.usageTracker.recordCall({
        command: `classify:${input.command}`,
        model: result.model,
        inputTokens: result.tokensUsed.input,
        outputTokens: result.tokensUsed.output,
        latencyMs,
        timestamp: new Date().toISOString(),
      });
    }

    // Validate the layout pattern is a known pattern
    const classification = result.data;
    if (!LAYOUT_PATTERN_IDS.includes(classification.layoutPattern)) {
      // Fall back to the default pattern for the content type
      classification.layoutPattern = this.getDefaultPattern(classification.contentType);
    }

    return classification;
  }

  /**
   * Build the user prompt for the classifier.
   * Keeps input short — only first 2K chars of output.
   */
  private buildClassifierPrompt(input: ClassifyInput): string {
    const outputPreview = input.cleanOutput.slice(0, 2000);

    let prompt = `Classify this terminal output for UI layout.

Tool: ${input.tool}
Command: ${input.command}

Terminal output (first 2000 chars):
\`\`\`
${outputPreview}
\`\`\`

Valid layout patterns: ${LAYOUT_PATTERN_IDS.join(', ')}`;

    if (input.userPrompt) {
      prompt += `\n\nUser request: ${input.userPrompt}`;
    }

    return prompt;
  }

  /**
   * Map content type to its default layout pattern.
   */
  private getDefaultPattern(contentType: string): string {
    const mapping: Record<string, string> = {
      'metrics-overview': 'dashboard-metrics',
      'data-table': 'single-table',
      'multi-dataset': 'tabbed-detail',
      'config-review': 'config-viewer',
      'status-board': 'status-overview',
      'log-analysis': 'log-viewer',
      'tree-hierarchy': 'tree-explorer',
      'audit-report': 'audit-report',
      'comparison': 'comparison-grid',
      'detail-view': 'detail-overview',
    };
    return mapping[contentType] ?? 'single-table';
  }
}
