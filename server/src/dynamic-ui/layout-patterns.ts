// EX3-A.2: Layout Pattern Library — 10 named layout patterns
// @see docs/phases/phase-ex3.md
//
// Each pattern is a structural blueprint that guides the LLM generator
// on how to arrange widgets for a given content type. The classifier
// selects a pattern, and the generator fills it with real data.

import type { LayoutPattern } from './types.js';

// ── 1. Dashboard Metrics ────────────────────────────────

const dashboardMetrics: LayoutPattern = {
  id: 'dashboard-metrics',
  name: 'Dashboard Metrics',
  description: 'Grid of stat-cards with optional detail section below. Best for system overviews, resource usage, and numeric summaries.',
  contentTypes: ['metrics-overview'],
  skeleton: {
    layout: 'stack',
    widgetSlots: [
      {
        id: 'summary-stats',
        location: 'root',
        widgetTypes: ['stat-card', 'progress-bar'],
        layout: 'grid-auto-fit',
        required: true,
        maxCount: 6,
      },
      {
        id: 'detail',
        location: 'root',
        widgetTypes: ['table', 'key-value'],
        layout: 'stack',
        required: false,
        maxCount: 2,
      },
    ],
  },
  populationRules: [
    'Stat-cards in grid layout with autoFit:true, minChildWidth:200. Max 6 cards.',
    'Stats always at root level, NEVER inside tabs.',
    'If there is detail data, add it below stats as a table or key-value, NOT in tabs.',
    'Gauge widget ONLY for 1-3 percentage values where the arc adds clarity (e.g., disk 87% full).',
    'NEVER create chart for data that is already shown in stat-cards.',
    'Use progress-bar for percentage values unless gauge is specifically justified.',
  ],
  recommendedWidgets: ['stat-card', 'progress-bar', 'key-value', 'alert'],
  discouragedWidgets: ['chart', 'code-block', 'tree', 'log-viewer', 'form'],
};

// ── 2. Single Table ─────────────────────────────────────

const singleTable: LayoutPattern = {
  id: 'single-table',
  name: 'Single Table',
  description: 'Summary key-value above a primary data table. Best for lists of items (packages, ports, users, modules).',
  contentTypes: ['data-table'],
  skeleton: {
    layout: 'stack',
    widgetSlots: [
      {
        id: 'alert',
        location: 'root',
        widgetTypes: ['alert'],
        layout: 'stack',
        required: false,
        maxCount: 1,
      },
      {
        id: 'summary',
        location: 'root',
        widgetTypes: ['key-value', 'stat-card'],
        layout: 'grid-3',
        required: false,
        maxCount: 1,
      },
      {
        id: 'main-table',
        location: 'root',
        widgetTypes: ['table'],
        layout: 'stack',
        required: true,
        maxCount: 1,
      },
    ],
  },
  populationRules: [
    'Summary key-value above table (grid-3 layout, 3-6 pairs max).',
    'Table is the primary widget — sorted by most useful column.',
    'Add filters if > 10 rows expected.',
    'Add row actions only if the data supports meaningful operations.',
    'Alert above summary only if there are warnings/errors to highlight.',
    'NEVER add chart or tree to a single-table view.',
  ],
  recommendedWidgets: ['key-value', 'table', 'alert', 'stat-card'],
  discouragedWidgets: ['chart', 'tree', 'log-viewer', 'form'],
};

// ── 3. Tabbed Detail ────────────────────────────────────

const tabbedDetail: LayoutPattern = {
  id: 'tabbed-detail',
  name: 'Tabbed Detail',
  description: 'Summary stat-cards at root with tabs for each data category. Best for multi-dataset views (network, docker, firewall).',
  contentTypes: ['multi-dataset'],
  skeleton: {
    layout: 'stack',
    widgetSlots: [
      {
        id: 'summary-stats',
        location: 'root',
        widgetTypes: ['stat-card', 'badge-grid'],
        layout: 'grid-auto-fit',
        required: false,
        maxCount: 4,
      },
      {
        id: 'tabs-content',
        location: 'root',
        widgetTypes: ['table', 'card-list', 'badge-grid', 'key-value'],
        layout: 'stack',
        required: true,
      },
    ],
  },
  populationRules: [
    'Summary stat-card row at root (grid-auto-fit), max 4 cards.',
    'One tab per data category — NEVER stack multiple tables in one tab.',
    'Each tab contains a single primary widget (table, card-list, or badge-grid).',
    'Tab labels include count badges when data has countable items.',
    'If only 2 datasets: consider side-by-side grid-2 instead of tabs.',
    'NEVER put summary stats inside tabs — they go at root level.',
  ],
  recommendedWidgets: ['stat-card', 'table', 'card-list', 'badge-grid', 'key-value'],
  discouragedWidgets: ['code-block', 'form', 'log-viewer'],
};

// ── 4. Config Viewer ────────────────────────────────────

const configViewer: LayoutPattern = {
  id: 'config-viewer',
  name: 'Config Viewer',
  description: 'Metadata key-value pairs above a code block. Best for configuration files (nginx, ssh, yaml, etc.).',
  contentTypes: ['config-review'],
  skeleton: {
    layout: 'stack',
    widgetSlots: [
      {
        id: 'metadata',
        location: 'root',
        widgetTypes: ['key-value', 'badge-grid'],
        layout: 'grid-3',
        required: true,
        maxCount: 1,
      },
      {
        id: 'config-content',
        location: 'root',
        widgetTypes: ['code-block'],
        layout: 'stack',
        required: true,
        maxCount: 1,
      },
      {
        id: 'warnings',
        location: 'root',
        widgetTypes: ['alert'],
        layout: 'stack',
        required: false,
        maxCount: 2,
      },
    ],
  },
  populationRules: [
    'Metadata key-value at top (file path, size, permissions, last modified).',
    'Code block with correct language detection (nginx, yaml, json, ini, etc.).',
    'Alert below ONLY if there are config issues (syntax errors, security warnings).',
    'NEVER add chart or table to a config view.',
    'Badge-grid can replace key-value for boolean flags (enabled/disabled settings).',
  ],
  recommendedWidgets: ['key-value', 'code-block', 'alert', 'badge-grid'],
  discouragedWidgets: ['chart', 'table', 'tree', 'form', 'card-list'],
};

// ── 5. Status Overview ──────────────────────────────────

const statusOverview: LayoutPattern = {
  id: 'status-overview',
  name: 'Status Overview',
  description: 'Badge-grid showing statuses with a detail table below. Best for service/daemon status checks.',
  contentTypes: ['status-board'],
  skeleton: {
    layout: 'stack',
    widgetSlots: [
      {
        id: 'alert',
        location: 'root',
        widgetTypes: ['alert'],
        layout: 'stack',
        required: false,
        maxCount: 1,
      },
      {
        id: 'status-badges',
        location: 'root',
        widgetTypes: ['badge-grid', 'card-list'],
        layout: 'stack',
        required: true,
        maxCount: 1,
      },
      {
        id: 'detail-table',
        location: 'root',
        widgetTypes: ['table'],
        layout: 'stack',
        required: false,
        maxCount: 1,
      },
    ],
  },
  populationRules: [
    'Badge-grid for service/item states (running/stopped/enabled/disabled).',
    'Table below for detailed information (service name, PID, memory, uptime).',
    'Alert at top if any critical failures detected.',
    'Card-list alternative when items have rich metadata (icon + description).',
    'NEVER add chart — badge-grid and table handle status data.',
  ],
  recommendedWidgets: ['badge-grid', 'table', 'alert', 'card-list'],
  discouragedWidgets: ['chart', 'code-block', 'tree', 'form'],
};

// ── 6. Log Viewer ───────────────────────────────────────

const logViewerPattern: LayoutPattern = {
  id: 'log-viewer',
  name: 'Log Viewer',
  description: 'Summary stat-cards above a log viewer. Best for log file output and journal entries.',
  contentTypes: ['log-analysis'],
  skeleton: {
    layout: 'stack',
    widgetSlots: [
      {
        id: 'summary-stats',
        location: 'root',
        widgetTypes: ['stat-card'],
        layout: 'grid-auto-fit',
        required: false,
        maxCount: 4,
      },
      {
        id: 'alert',
        location: 'root',
        widgetTypes: ['alert'],
        layout: 'stack',
        required: false,
        maxCount: 1,
      },
      {
        id: 'log-content',
        location: 'root',
        widgetTypes: ['log-viewer'],
        layout: 'stack',
        required: true,
        maxCount: 1,
      },
    ],
  },
  populationRules: [
    'Stat-cards for summary: total lines, error count, warning count, time range.',
    'Log-viewer is the primary widget — it must contain the log lines.',
    'Alert above log if there are critical findings (repeated errors, high error rate).',
    'NEVER add chart or tree to a log view.',
    'Stat-cards in grid-auto-fit, minChildWidth:200.',
  ],
  recommendedWidgets: ['stat-card', 'log-viewer', 'alert'],
  discouragedWidgets: ['chart', 'tree', 'form', 'table', 'badge-grid'],
};

// ── 7. Tree Explorer ────────────────────────────────────

const treeExplorer: LayoutPattern = {
  id: 'tree-explorer',
  name: 'Tree Explorer',
  description: 'Metadata key-value above a tree widget. Best for directory trees, dependency trees, process trees.',
  contentTypes: ['tree-hierarchy'],
  skeleton: {
    layout: 'stack',
    widgetSlots: [
      {
        id: 'metadata',
        location: 'root',
        widgetTypes: ['key-value', 'stat-card'],
        layout: 'grid-3',
        required: false,
        maxCount: 1,
      },
      {
        id: 'tree-content',
        location: 'root',
        widgetTypes: ['tree'],
        layout: 'stack',
        required: true,
        maxCount: 1,
      },
    ],
  },
  populationRules: [
    'Key-value at top for metadata (total items, depth, root path, etc.).',
    'Tree widget is primary — show the full hierarchy.',
    'Code-block can supplement if raw text representation is useful.',
    'NEVER add chart or badge-grid to a tree view.',
  ],
  recommendedWidgets: ['key-value', 'tree', 'code-block', 'stat-card'],
  discouragedWidgets: ['chart', 'badge-grid', 'form', 'log-viewer'],
};

// ── 8. Audit Report ─────────────────────────────────────

const auditReport: LayoutPattern = {
  id: 'audit-report',
  name: 'Audit Report',
  description: 'Alert summary, stat-cards for counts, tabs for findings by category. Best for security audits, compliance checks.',
  contentTypes: ['audit-report'],
  skeleton: {
    layout: 'stack',
    sections: [
      { id: 'critical', label: 'Critical', icon: 'AlertTriangle' },
      { id: 'warnings', label: 'Warnings', icon: 'AlertCircle' },
      { id: 'info', label: 'Info', icon: 'Info' },
    ],
    widgetSlots: [
      {
        id: 'critical-alert',
        location: 'root',
        widgetTypes: ['alert'],
        layout: 'stack',
        required: false,
        maxCount: 1,
      },
      {
        id: 'finding-counts',
        location: 'root',
        widgetTypes: ['stat-card'],
        layout: 'grid-auto-fit',
        required: true,
        maxCount: 4,
      },
      {
        id: 'findings-by-category',
        location: 'root',
        widgetTypes: ['table', 'badge-grid'],
        layout: 'stack',
        required: true,
      },
    ],
  },
  populationRules: [
    'Alert at top for critical summary (e.g., "3 critical issues found").',
    'Stat-cards in grid-auto-fit for finding counts (critical, high, medium, low).',
    'Tabs for findings categorized by type or severity.',
    'Each tab contains one table with the relevant findings.',
    'Tab labels include count badges showing number of findings per category.',
    'NEVER add chart — stat-cards + tables handle audit data.',
  ],
  recommendedWidgets: ['alert', 'stat-card', 'table', 'badge-grid'],
  discouragedWidgets: ['chart', 'code-block', 'tree', 'form', 'log-viewer'],
};

// ── 9. Comparison Grid ──────────────────────────────────

const comparisonGrid: LayoutPattern = {
  id: 'comparison-grid',
  name: 'Comparison Grid',
  description: 'Side-by-side or tabbed comparison of items. Best for comparing containers, interfaces, configs.',
  contentTypes: ['comparison'],
  skeleton: {
    layout: 'stack',
    widgetSlots: [
      {
        id: 'summary',
        location: 'root',
        widgetTypes: ['key-value', 'stat-card'],
        layout: 'grid-auto-fit',
        required: false,
        maxCount: 4,
      },
      {
        id: 'comparison-items',
        location: 'root',
        widgetTypes: ['key-value', 'progress-bar', 'stat-card', 'table'],
        layout: 'stack',
        required: true,
      },
    ],
  },
  populationRules: [
    'Tabs — one per item being compared. Within each: key-value + progress-bars.',
    'For 2 items: consider side-by-side grid-2 instead of tabs.',
    'For 3+ items: always use tabs.',
    'Each tab shows the same fields for each item — consistent structure.',
    'Summary at root can highlight key differences.',
  ],
  recommendedWidgets: ['key-value', 'progress-bar', 'stat-card', 'table'],
  discouragedWidgets: ['tree', 'log-viewer', 'form', 'chart'],
};

// ── 10. Detail Overview ─────────────────────────────────

const detailOverview: LayoutPattern = {
  id: 'detail-overview',
  name: 'Detail Overview',
  description: 'Key-value primary info above tabs of related data. Best for deep-dive into a single item (container inspect, package info).',
  contentTypes: ['detail-view'],
  skeleton: {
    layout: 'stack',
    widgetSlots: [
      {
        id: 'primary-info',
        location: 'root',
        widgetTypes: ['key-value'],
        layout: 'grid-3',
        required: true,
        maxCount: 1,
      },
      {
        id: 'related-data',
        location: 'root',
        widgetTypes: ['table', 'badge-grid', 'card-list', 'key-value'],
        layout: 'stack',
        required: false,
      },
    ],
  },
  populationRules: [
    'Key-value at root (grid-3) for primary metadata about the item.',
    'Tabs for related data tables (e.g., volumes, networks, env vars for a container).',
    'Each tab contains a single primary widget.',
    'Badge-grid for boolean flags / status fields.',
    'Card-list for sub-items with their own metadata.',
    'NEVER add chart unless stats data genuinely warrants it.',
  ],
  recommendedWidgets: ['key-value', 'table', 'badge-grid', 'card-list'],
  discouragedWidgets: ['chart', 'code-block', 'log-viewer', 'form'],
};

// ── Registry ────────────────────────────────────────────

/**
 * All 10 built-in layout patterns indexed by ID.
 */
export const LAYOUT_PATTERNS: Record<string, LayoutPattern> = {
  'dashboard-metrics': dashboardMetrics,
  'single-table': singleTable,
  'tabbed-detail': tabbedDetail,
  'config-viewer': configViewer,
  'status-overview': statusOverview,
  'log-viewer': logViewerPattern,
  'tree-explorer': treeExplorer,
  'audit-report': auditReport,
  'comparison-grid': comparisonGrid,
  'detail-overview': detailOverview,
};

/**
 * All pattern IDs as a typed array.
 */
export const LAYOUT_PATTERN_IDS = Object.keys(LAYOUT_PATTERNS) as string[];

/**
 * Look up a layout pattern by ID.
 */
export function getLayoutPattern(id: string): LayoutPattern | undefined {
  return LAYOUT_PATTERNS[id];
}

/**
 * Find the layout pattern for a given content type.
 */
export function getPatternForContentType(contentType: string): LayoutPattern | undefined {
  return Object.values(LAYOUT_PATTERNS).find(p =>
    p.contentTypes.includes(contentType),
  );
}

/**
 * Get all population rules for a pattern as a formatted string
 * (ready for injection into LLM prompt).
 */
export function getPatternRulesText(patternId: string): string {
  const pattern = LAYOUT_PATTERNS[patternId];
  if (!pattern) return '';

  const lines = [
    `Pattern: ${pattern.name} (${pattern.id})`,
    `Description: ${pattern.description}`,
    '',
    'Population Rules:',
    ...pattern.populationRules.map((r, i) => `${i + 1}. ${r}`),
    '',
    `Recommended widgets: ${pattern.recommendedWidgets.join(', ')}`,
    `Discouraged widgets: ${pattern.discouragedWidgets.join(', ')}`,
  ];

  return lines.join('\n');
}

/**
 * EX3-B.1: Generate a compact Design System Rules block from all patterns.
 * This text is injected into the LLM system prompt so that layout decisions
 * are driven by the pattern registry — not duplicated manually.
 *
 * Output is kept under ~800 tokens (compact one-liner per pattern).
 */
export function generateDesignSystemRules(): string {
  const patterns = Object.values(LAYOUT_PATTERNS);

  // Collect all discouraged widgets across all patterns
  const allDiscouraged = new Set<string>();
  patterns.forEach(p => p.discouragedWidgets.forEach(w => allDiscouraged.add(w)));

  // Build pattern index: content-type → pattern + recommended widgets
  const patternIndex = patterns.map(p =>
    `- ${p.contentTypes.join('/')} → **${p.id}** (${p.recommendedWidgets.join(', ')})`,
  ).join('\n');

  // Extract universal rules from patterns (rules that appear across multiple patterns)
  const universalRules: string[] = [];
  const ruleCount = new Map<string, number>();
  for (const p of patterns) {
    for (const rule of p.populationRules) {
      // Normalize for dedup
      const key = rule.toLowerCase().replace(/\s+/g, ' ').trim();
      ruleCount.set(key, (ruleCount.get(key) ?? 0) + 1);
    }
  }
  // Rules appearing in 3+ patterns are universal
  for (const [, count] of ruleCount) {
    if (count >= 3) {
      // Find the original rule text from any pattern
      for (const p of patterns) {
        const found = p.populationRules.find(r =>
          r.toLowerCase().replace(/\s+/g, ' ').trim() === [...ruleCount.entries()].find(([, c]) => c === count)?.[0],
        );
        if (found && !universalRules.includes(found)) {
          universalRules.push(found);
          break;
        }
      }
    }
  }

  return `## Layout Patterns (auto-generated from pattern registry)
Content type → Pattern (recommended widgets):
${patternIndex}

## Pattern-Derived Rules
- stat-card sections: ALWAYS use grid layout with autoFit:true, minChildWidth:200. NEVER stack vertically.
- Summary/overview widgets (stat-cards, key-value) go at ROOT level, NEVER inside tabs.
- Tabs: use when 3+ data categories. Each tab = 1 primary widget. Include count badges.
- Hierarchy: alerts first → stats → primary content → secondary content.
- Max 2 levels of nesting. Max 6 stat-cards per grid. Max 10 widgets per view.
- For each pattern, prefer its recommended widgets. Avoid its discouraged widgets.`;
}
