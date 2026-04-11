# Phase EX3: Smart Layout Engine & Progressive UI Generation

> **Milestone:** EX3 | **Est. Effort:** Large (4 sub-phases) | **Depends on:** EX1 (Dynamic UI Engine), EX2 (UI Agent)
>
> Transform the Dynamic UI from a single-shot "generate and display" system into a **smart, design-aware, progressive rendering engine** that makes intelligent layout decisions, places widgets optimally, and assembles UI step-by-step in real-time.
>
> **This is NOT a visualization/charting tool.** Charts, gauges, and sparklines exist only as supporting elements when data genuinely warrants them (e.g., disk usage percentage). The core focus is: **widget selection, smart placement, responsive layouts, content classification, and design-system compliance.**

---

## Guiding Principles

1. **Widgets first, charts second.** Tables, stat-cards, key-value pairs, badge-grids, code-blocks, alerts, card-lists, and forms are the primary building blocks. Charts/gauges are used sparingly — only when a percentage, trend, or comparison genuinely benefits from visual representation.

2. **Smart placement over stacking.** The LLM must never blindly stack widgets vertically. It must classify content and apply the right layout pattern: grids for metrics, tabs for multiple data categories, responsive auto-fit for varying screen sizes.

3. **Design-system native.** Every generated view must look indistinguishable from hand-crafted ServerAdmin/Dashboard components — same typography, colors, spacing, badge semantics, and interaction patterns.

4. **Progressive assembly.** The user sees the UI build itself: layout skeleton first, then widgets stream in one-by-one. Perceived latency drops from 5-15s to <1.5s for first visual.

5. **Two-pass classification.** A fast classifier determines content type and layout pattern before the main generator runs. This constrains the generator to make good design decisions instead of defaulting to vertical stacks.

---

## What Was Built (EX3-P — Complete)

Sub-phase EX3-P added the widget primitives needed to replicate complex hand-crafted views:

| Task | What It Added |
|------|--------------|
| EX3-P.1 | Tab count badges (`count` field on tabs) |
| EX3-P.2 | Monospace column type (`mono` — plain monospace, no background) |
| EX3-P.3 | Rich compound table cells (`rich` column type with text/badge/icon/dot segments) |
| EX3-P.4 | Table filters & search (`filters` with dropdowns + search bar) |
| EX3-P.5 | Dropdown action menu (`actionStyle: 'dropdown'` -> `...` menu) |
| EX3-P.6 | Card-list widget (icon + title + badge with dot + detail rows + actions) |
| EX3-P.7 | NetworkSection playground replication (full 5-tab example) |
| EX3-P.8 | Nestable layouts (`LayoutOrWidgetSchema` — layouts contain widgets OR nested layouts) |

---

## What Needs To Be Built (4 Sub-Phases)

### Sub-Phase Overview

| Sub-Phase | Focus | Key Outcome |
|-----------|-------|-------------|
| **EX3-A** | **Content Classification & Layout Patterns** | Two-pass LLM design classifier, 10 named layout patterns, responsive auto-fit grid |
| **EX3-B** | **Design System Prompt & Templates** | Comprehensive design rules in LLM prompt, improved+expanded templates (25+), FakeLLM for testing |
| **EX3-C** | **Progressive Multi-Step Generation** | WorkingView + mutation tools, `layout_update` event pipeline, early window opening |
| **EX3-D** | **Unified Window & Visual Polish** | DynamicUIWindow component, toolbar, entrance animations, skeleton states |

### Execution Order

```
EX3-A (classification + patterns + responsive grid) -----+
EX3-B (design prompt + templates + FakeLLM)              -+ parallel
                                                           v
EX3-C (progressive generation pipeline)  -----------------+
                                                           v
EX3-D (unified window + toolbar + animations)  -----------+
```

> **Gate:** EX3-A and EX3-B must be complete before EX3-C. The design classifier and templates must produce well-laid-out views in single-shot mode before adding progressive generation.

---

## Sub-Phase EX3-A: Content Classification & Layout Patterns

> The core problem: when the LLM generates a dynamic view, it defaults to stacking everything vertically. This sub-phase adds intelligence — a fast classifier determines the content type, selects a layout pattern, and constrains the generator to make good design decisions.

---

### EX3-A.1: Two-Pass Design Classifier

**Problem:** The current generator makes layout decisions and widget selection in a single LLM call. This leads to poor choices — stat-cards stacked vertically instead of in a grid, multiple related tables stacked instead of tabbed, no visual hierarchy.

**Solution:** Split generation into two passes:

**Pass 1 — Classify (fast, cheap model: gpt-4.1-mini or gpt-4.1-nano)**
- Input: tool name, command, first 2K chars of terminal output, user prompt
- Output: `DesignClassification` — what kind of content this is and how to lay it out
- Latency target: < 500ms
- Cost: minimal (classification prompt ~200 tokens input, ~50 tokens output)

**Pass 2 — Generate (structured-output model: gpt-4.1)**
- Input: classification result + full terminal output + matched template + layout pattern skeleton
- The classification constrains the generator — it doesn't choose layout from scratch

#### DesignClassification Schema

```typescript
const DesignClassificationSchema = z.object({
  // What kind of content is this?
  contentType: z.enum([
    'metrics-overview',    // CPU/memory/disk stats -> grid of stat-cards + summary
    'data-table',          // List of items -> single table with filters
    'multi-dataset',       // Multiple related datasets -> tabbed tables
    'config-review',       // Configuration file -> key-value + code block
    'status-board',        // Service/container statuses -> badge grid + details
    'log-analysis',        // Log output -> log viewer + summary stats
    'tree-hierarchy',      // Directory tree / process tree -> tree widget
    'audit-report',        // Security/compliance findings -> alert + categorized tables
    'comparison',          // Compare multiple items -> side-by-side or tabbed
    'detail-view',         // Single item deep dive -> key-value + related data
  ]),

  // Which layout pattern to use (from pattern library)
  layoutPattern: z.string(),  // e.g., 'dashboard-metrics', 'tabbed-detail'

  // What widget types are expected (guides the generator)
  expectedWidgets: z.array(z.enum([
    'stat-card', 'table', 'key-value', 'badge-grid', 'progress-bar',
    'code-block', 'alert', 'card-list', 'log-viewer', 'tree', 'form',
    'chart', 'gauge',  // only when data genuinely warrants visualization
  ])),

  // How many top-level sections/tabs
  sectionCount: z.number().int().min(1).max(8),

  // Brief design rationale (helps debug + logged for improvement)
  designNotes: z.string(),

  // Should chart/gauge be used? Only true when data has percentages,
  // time-series, or composition that benefits from visual representation
  useVisualization: z.boolean(),
  visualizationReason: z.string().nullable().optional(),
});
```

#### Classifier System Prompt

```
You are a UI layout classifier. Given terminal command output, determine the best
layout structure. You are NOT generating the UI — just classifying what kind of
content this is and how it should be arranged.

Classification Rules:

Content Type Detection:
- Multiple numeric stats (CPU, memory, disk, uptime) -> 'metrics-overview'
- A list/table of items (packages, ports, users, containers) -> 'data-table'
- Multiple related lists (e.g., mounts + partitions, listening + established) -> 'multi-dataset'
- Configuration file content -> 'config-review'
- Service/daemon status checks -> 'status-board'
- Log file output -> 'log-analysis'
- Hierarchical data (directory listing, process tree) -> 'tree-hierarchy'
- Security scan results, compliance checks -> 'audit-report'
- Comparing 2+ similar items -> 'comparison'
- Deep info about one item (container inspect, package info) -> 'detail-view'

Widget Selection Rules:
- Prefer stat-card for single numeric values (CPU: 45%, Memory: 2.1GB)
- Prefer table for lists of items with multiple attributes
- Prefer key-value for metadata (name: value pairs, < 10 items)
- Prefer badge-grid for status overviews (service states, boolean flags)
- Prefer card-list for items with icon + title + status + details
- Prefer code-block for raw config/script content
- Prefer alert for warnings, errors, or critical findings
- Prefer progress-bar for percentage values (disk usage, memory usage)

When to Use chart/gauge (SPARINGLY):
- gauge: ONLY for 1-3 percentage values where visual arc adds clarity (e.g., disk 87% full)
- chart (pie/donut): ONLY for composition data with 3-7 slices (e.g., disk usage by mount)
- chart (bar): ONLY when comparing counts across categories (e.g., packages by status)
- chart (line/area): ONLY for time-series data with 5+ data points
- NEVER use chart/gauge just because numbers exist — stat-card + progress-bar handle most cases

Layout Pattern Selection:
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
```

#### File Location

`server/src/dynamic-ui/design-classifier.ts`

#### Integration

The classifier is injected into both generation paths:
- **Simple path** (`DynamicUIGenerator`): classify -> select template -> generate with pattern constraint
- **Agent path** (`UIAgent`): classifier output replaces the planner's layout decision — planner focuses on intent/security, classifier handles design

#### Acceptance Criteria

- [ ] `DesignClassificationSchema` defined in `shared/schemas/dynamic-view.ts`
- [ ] `DesignClassifier` class in `server/src/dynamic-ui/design-classifier.ts`
- [ ] Classifier uses fast/cheap model (configurable, default gpt-4.1-nano)
- [ ] < 500ms latency for classification
- [ ] Classifier output includes `contentType`, `layoutPattern`, `expectedWidgets`
- [ ] `useVisualization` is false for most content types — charts only when justified
- [ ] Integrated into `DynamicUIGenerator` (simple path)
- [ ] Integrated into `UIAgent` planner phase
- [ ] Tests: 10+ classification scenarios covering all content types
- [ ] Tests: verify chart/gauge is NOT recommended for plain table/list data

---

### EX3-A.2: Layout Pattern Library

**Problem:** Even with classification, the generator needs structural guidance on how to arrange widgets. Currently it invents layout from scratch every time — inconsistent results.

**Solution:** A library of 10 named layout patterns — structural blueprints the generator fills with real widgets and data. Each pattern defines the layout skeleton, which widget types go where, and population rules.

#### Pattern Structure

```typescript
interface LayoutPattern {
  id: string;                          // e.g., 'dashboard-metrics'
  name: string;                        // Human-readable
  description: string;                 // When to use
  contentTypes: string[];              // Which contentType classifications map here

  // The structural skeleton (layout hierarchy, no data)
  skeleton: {
    layout: string;                    // root layout type
    sections?: { id: string; label: string; icon?: string }[];
    widgetSlots: WidgetSlot[];         // where widgets go
  };

  // Rules the LLM must follow when populating this pattern
  populationRules: string[];

  // Widget types that work well in this pattern
  recommendedWidgets: string[];

  // Widget types that should NOT be used in this pattern
  discouragedWidgets: string[];
}

interface WidgetSlot {
  id: string;                          // e.g., 'summary-stats', 'main-table'
  location: string;                    // 'root' or section ID
  widgetTypes: string[];               // allowed widget types for this slot
  layout?: string;                     // 'grid-auto-fit', 'grid-2', 'grid-3', 'stack'
  required: boolean;
  maxCount?: number;                   // max widgets in this slot
}
```

#### 10 Built-In Patterns

| # | Pattern ID | Structure | Recommended Widgets | NOT Recommended |
|---|-----------|-----------|---------------------|-----------------|
| 1 | `dashboard-metrics` | Grid(auto-fit) stat-cards, optional detail section below | stat-card, progress-bar, key-value | chart (unless % data), code-block |
| 2 | `single-table` | Key-value summary (grid-3), table with filters + actions | key-value, table, alert | chart, tree |
| 3 | `tabbed-detail` | Stat-card row (grid-auto-fit), tabs (one data view per tab) | stat-card, table, card-list, badge-grid | code-block at root |
| 4 | `config-viewer` | Key-value metadata (grid-3), code-block, optional alert | key-value, code-block, alert | chart, table (unless related items) |
| 5 | `status-overview` | Badge-grid (statuses), table (details), optional alert | badge-grid, table, alert, card-list | chart, code-block |
| 6 | `log-viewer` | Stat-cards (summary: lines, errors, warnings), log-viewer | stat-card, log-viewer, alert | chart, tree, form |
| 7 | `tree-explorer` | Key-value (metadata), tree widget | key-value, tree, code-block | chart, badge-grid |
| 8 | `audit-report` | Alert (critical summary), stat-cards (counts), tabs (findings by category) | alert, stat-card, table, badge-grid | chart, code-block |
| 9 | `comparison-grid` | Tabs (one per item), within each: key-value + progress-bars | key-value, progress-bar, stat-card, table | tree, log-viewer |
| 10 | `detail-overview` | Key-value (primary info, grid-3), tabs (related data tables) | key-value, table, badge-grid, card-list | chart (unless stats data) |

#### Population Rules (per pattern)

Each pattern includes rules that constrain the generator:

**dashboard-metrics:**
- Stat-cards in grid-auto-fit (minChildWidth: 200), max 6 cards
- Stats always at root level, NEVER inside tabs
- If there's detail data: add it below stats as a table or key-value, NOT in tabs
- gauge widget ONLY if there are 1-3 percentage values where the arc adds clarity (e.g., disk 87% full — a gauge makes the severity more visible than a stat-card)
- NEVER create chart for data that's already shown in stat-cards

**tabbed-detail:**
- Summary stat-card row at root (grid-auto-fit), max 4 cards
- One tab per data category — NEVER stack multiple tables in one tab
- Each tab contains a single primary widget (table, card-list, or badge-grid)
- Tab labels include count badges when data has countable items
- If only 2 datasets: consider side-by-side grid-2 instead of tabs

**single-table:**
- Summary key-value above table (grid-3 layout, 3-6 pairs max)
- Table is the primary widget — sorted by most useful column
- Add filters if > 10 rows expected
- Add row actions only if the data supports meaningful operations
- Alert above summary only if there are warnings/errors to highlight

**config-viewer:**
- Metadata key-value at top (file path, size, permissions, last modified)
- Code block with correct language detection (nginx, yaml, json, ini, etc.)
- Alert below ONLY if there are config issues (syntax errors, security warnings)
- NEVER add chart or table to a config view

#### File Location

`server/src/dynamic-ui/layout-patterns.ts`

#### Acceptance Criteria

- [ ] `LayoutPattern` type defined in `server/src/dynamic-ui/types.ts`
- [ ] 10 patterns implemented in `server/src/dynamic-ui/layout-patterns.ts`
- [ ] Each pattern has: skeleton, populationRules, recommendedWidgets, discouragedWidgets
- [ ] Classifier's `layoutPattern` output maps to a pattern ID
- [ ] Generator receives the selected pattern and follows its rules
- [ ] `search_templates` agent tool also searches patterns
- [ ] Tests: pattern selection for various content types
- [ ] Tests: generator output follows pattern rules (no discouraged widgets)

---

### EX3-A.3: Responsive Auto-Fit Grid Layout

**Problem:** Grid layout has fixed columns (1-4). Stat-cards and other summary widgets don't reflow based on available space. On a wide screen, 3 stat-cards look sparse; on a narrow window, they overflow.

**Solution:** Add `autoFit` mode to grid layout, using CSS `repeat(auto-fit, minmax(Xpx, 1fr))`.

#### Schema Change

Add to `GridLayoutSchema` in `shared/schemas/dynamic-view.ts`:

```typescript
GridLayoutSchema = z.object({
  layout: z.literal('grid'),
  columns: z.number().int().min(1).max(6).default(2),  // fixed column mode
  gap: z.enum(['sm', 'md', 'lg']).default('md'),
  children: z.array(LayoutOrWidgetSchema),

  // NEW: responsive auto-fit mode
  autoFit: z.boolean().optional().default(false),
  minChildWidth: z.number().int().min(100).max(600).optional().default(250),
});
```

When `autoFit: true`:
- Ignore `columns` — use CSS `grid-template-columns: repeat(auto-fit, minmax({minChildWidth}px, 1fr))`
- Widgets reflow automatically based on container width
- stat-cards, gauges, and summary widgets use this by default

#### Renderer Change

In `GridLayout.tsx`:

```typescript
const gridStyle = layout.autoFit
  ? { gridTemplateColumns: `repeat(auto-fit, minmax(${layout.minChildWidth ?? 250}px, 1fr))` }
  : { gridTemplateColumns: `repeat(${layout.columns ?? 2}, 1fr)` };
```

#### Acceptance Criteria

- [ ] `autoFit` and `minChildWidth` fields in `GridLayoutSchema`
- [ ] `GridLayout.tsx` renders CSS auto-fit when `autoFit: true`
- [ ] Widgets reflow on resize (no overflow, no excessive whitespace)
- [ ] All layout patterns that use stat-cards specify `autoFit: true`
- [ ] Backward compatible: existing `columns`-based grids unchanged
- [ ] Tests: grid renders correctly in both fixed and auto-fit modes

---

### EX3-A.4: Gauge Widget (Supporting Role Only)

**Problem:** Some percentage data (disk 87% full, CPU 92%) benefits from a visual arc that conveys severity better than a number alone. Currently the only option is progress-bar (flat) or stat-card (plain number).

**Solution:** A gauge widget — a semicircular arc with threshold-based coloring and a center value. Used SPARINGLY — only when the classifier determines `useVisualization: true` and the data has 1-3 percentage values.

#### Schema

```typescript
const GaugeWidgetSchema = z.object({
  type: z.literal('gauge'),
  title: z.string().nullable().optional(),
  value: z.number(),
  min: z.number().default(0),
  max: z.number().default(100),
  unit: z.string().nullable().optional(),         // '%', 'GB', etc.
  label: z.string().nullable().optional(),         // e.g., 'Root Filesystem'
  thresholds: z.array(z.object({
    value: z.number(),                             // threshold boundary
    color: z.string(),                             // CSS color or semantic name
    label: z.string().nullable().optional(),
  })).optional().default([
    { value: 70, color: 'success' },
    { value: 90, color: 'warning' },
    { value: 100, color: 'destructive' },
  ]),
  size: z.enum(['sm', 'md', 'lg']).default('md'),  // sm=120px, md=180px, lg=240px
  dataSource: DataSourceSchema.nullable().optional(),
});
```

#### Renderer

`GaugeWidget.tsx` — uses recharts `PieChart` as a semicircle:
- Semicircle arc (startAngle=180, endAngle=0) with `innerRadius="60%"`, `outerRadius="80%"`
- Filled portion colored by threshold (green < 70%, amber < 90%, red >= 90%)
- Empty portion transparent
- Center: big number (`text-2xl font-bold`) + unit
- Below: label (`text-xs text-muted-foreground`)

#### When to Use (classifier rules)

The classifier recommends gauge ONLY when:
1. Data has 1-3 percentage values (disk/CPU/memory usage)
2. The severity of the value matters (87% disk = concerning, 4% disk = fine)
3. A stat-card + progress-bar combination would be less clear

The classifier does NOT recommend gauge for:
- Lists of items
- Non-percentage data
- More than 3 metrics (use stat-cards instead)
- Data where the exact number matters more than the visual level

#### Acceptance Criteria

- [ ] `GaugeWidgetSchema` added to `shared/schemas/dynamic-view.ts`
- [ ] `GaugeWidget.tsx` renderer using recharts `PieChart` semicircle
- [ ] Threshold-based coloring (success/warning/destructive)
- [ ] Three sizes (sm/md/lg)
- [ ] Registered in widget registry
- [ ] Classifier recommends gauge ONLY for 1-3 percentage values with severity
- [ ] Tests: renders correctly, theme-aware colors, handles min/max/thresholds

---

### EX3-A.5: Sparkline Stat Card Widget

**Problem:** Stat-cards show a single number but no trend. When historical data exists (e.g., CPU usage over time), a tiny inline chart behind the number adds context without adding complexity.

**Solution:** An enhanced stat-card with an optional sparkline — a tiny area chart behind the value. Used only when the classifier detects trend data.

#### Schema

```typescript
const SparklineStatWidgetSchema = z.object({
  type: z.literal('sparkline-stat'),
  title: z.string().nullable().optional(),
  value: z.string(),
  unit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  trend: z.enum(['up', 'down', 'neutral']).nullable().optional(),
  icon: z.string().nullable().optional(),
  sparklineData: z.array(z.number()),              // array of values for the sparkline
  sparklineColor: z.string().nullable().optional(), // CSS color, defaults to --chart-1
  dataSource: DataSourceSchema.nullable().optional(),
});
```

#### Renderer

`SparklineStatWidget.tsx` — stat-card layout with a 40px-tall `AreaChart` behind the value:
- Card container matching stat-card dimensions
- Value + unit on top, description below
- Behind the text: a minimal recharts `AreaChart` (no axes, no grid, no dots, fill opacity 0.08)
- Trend arrow (same as stat-card)

#### When to Use

Only when historical/trend data is available. Most dynamic views won't have this — the classifier marks it only for monitoring/time-series scenarios.

#### Acceptance Criteria

- [ ] `SparklineStatWidgetSchema` added to schema
- [ ] `SparklineStatWidget.tsx` renderer with minimal AreaChart
- [ ] Sparkline is purely decorative — no interactivity, no tooltip
- [ ] Falls back to regular stat-card appearance when sparklineData is empty
- [ ] Registered in widget registry
- [ ] Tests: renders with and without sparkline data

---

### EX3-A.6: Enhanced Chart Options (Supporting)

**Problem:** The existing chart widget lacks options for stacking, thresholds, and unit formatting. When charts ARE appropriate (rarely), they should be well-formatted.

**Solution:** Add supporting options to `ChartWidgetSchema` — not to encourage more chart usage, but to make the rare charts look good.

#### Schema Additions

```typescript
// Added to ChartWidgetSchema:
stacked: z.boolean().optional().default(false),
thresholds: z.array(z.object({
  value: z.number(),
  color: z.string(),
  label: z.string().nullable().optional(),
})).optional(),
unit: z.enum(['bytes', 'percent', 'duration', 'count', 'custom']).optional(),
unitCustom: z.string().nullable().optional(),
showGrid: z.boolean().optional().default(true),
showLegend: z.boolean().optional().default(true),
```

#### Renderer Additions

- **Stacking**: when `stacked: true`, add `stackId="stack"` to `Bar`/`Area` children
- **Thresholds**: render `ReferenceLine` for each threshold (dashed line with label)
- **Unit formatting**: `formatUnit(value, unit)` utility — bytes to KB/MB/GB, percent to %, duration to s/m/h, count to K/M
- **Grid/legend toggles**: honor `showGrid` and `showLegend` flags

#### Acceptance Criteria

- [ ] New fields in `ChartWidgetSchema`
- [ ] Stacked bar/area charts work
- [ ] Threshold reference lines render correctly
- [ ] `formatUnit()` utility created in `client/src/lib/format-utils.ts`
- [ ] Backward compatible — existing charts unchanged
- [ ] Tests: stacking, thresholds, unit formatting

---

## Sub-Phase EX3-B: Design System Prompt & Templates

> The LLM needs explicit design rules and high-quality examples to produce good layouts. This sub-phase rewrites the system prompt with design-system rules, improves all 15 existing templates, and expands the library to 25+.

---

### EX3-B.1: Design System Rules in LLM Prompt

**Problem:** The current system prompt tells the LLM what Zod schema to use but doesn't explain design rules — when to use grids vs tabs, how to arrange stat-cards, what makes a good layout. The LLM defaults to vertical stacks because nothing tells it otherwise.

**Solution:** Inject comprehensive design rules into the system prompt. These rules are generated from the layout patterns (A.2) and design principles, ensuring the LLM follows the same patterns a human designer would.

#### Prompt Sections to Add

**Section: Layout Decision Rules**
```
LAYOUT RULES (MUST follow):

1. STAT-CARDS: Always in grid layout with autoFit:true, minChildWidth:200.
   Never stack stat-cards vertically. Max 6 stat-cards per grid.

2. TABS: Use when there are 3+ related data categories.
   Each tab = one primary widget (table, card-list, or badge-grid).
   Never put multiple tables in one tab. Include count badges.

3. GRID vs STACK: Use grid for metrics/summary (stat-cards, progress-bars).
   Use stack for sequential content (alert + table, key-value + code-block).

4. HIERARCHY: Summary/overview at top, detail below.
   Alert -> stat-cards -> primary content -> secondary content.

5. CHART/GAUGE: Only when classifier says useVisualization:true.
   Never add chart just because numbers exist. Progress-bar handles most %.
```

**Section: Widget Selection Matrix**
```
DATA TYPE -> WIDGET:
- Single number with label       -> stat-card
- Percentage (1-3 values, severity) -> gauge (only if classifier approves) or progress-bar
- Name:value pairs (< 10)        -> key-value (grid-3 layout)
- Name:value pairs (10+)         -> table (2-column)
- List of items with attributes  -> table (with filters if >10 rows)
- Items with icon+status+actions -> card-list
- Status flags (on/off, enabled) -> badge-grid
- Raw config/script/log content  -> code-block
- Hierarchical data              -> tree
- Warning/error to highlight     -> alert (above relevant content)
- Time-series trend (5+ points)  -> chart (area) - RARE
- Category comparison (3-7 cats) -> chart (bar) - RARE
```

**Section: Anti-Patterns**
```
NEVER DO:
- Stack stat-cards vertically (use grid-auto-fit)
- Put multiple tables in one tab
- Add chart when stat-card + progress-bar suffices
- Create empty tabs for "future use"
- Use code-block for tabular data (use table)
- Put summary stats inside tabs (they go at root)
- Create more than 2 levels of nesting
- Use gauge for non-percentage data
```

#### Integration

- Rules injected into `DYNAMIC_UI_SYSTEM_PROMPT` in `server/src/dynamic-ui/generator.ts`
- Classification result is also injected: "Classifier determined: contentType=X, layoutPattern=Y, expectedWidgets=[...]"
- Pattern skeleton is injected as structural guidance

#### Acceptance Criteria

- [ ] System prompt includes layout rules, widget selection matrix, anti-patterns
- [ ] Rules are generated from layout patterns (not duplicated manually)
- [ ] Classification result injected into generation prompt
- [ ] Pattern skeleton injected as structural guidance
- [ ] Prompt size stays reasonable (< 2000 tokens for rules section)
- [ ] Tests: compare generation quality with/without design rules (manual verification)

---

### EX3-B.2: Improve Existing 15 Templates

**Problem:** The 15 existing templates in `server/src/dynamic-ui/templates/` were created before layout patterns existed. They use basic stacking, don't leverage tabs effectively, and don't follow the design system rules.

**Solution:** Rewrite all 15 templates to use the layout patterns from A.2. Every template should be a gold-standard example of its pattern type.

#### Template Improvement Checklist

For each template:
1. Assign a `layoutPattern` from the 10 built-in patterns
2. Use `autoFit` grid for stat-card sections
3. Use tabs when there are 3+ data categories (with count badges)
4. Remove unnecessary charts — replace with stat-card + progress-bar where appropriate
5. Add `.filters` to tables with > 10 expected rows
6. Use `rich` column type for status columns (dot + badge)
7. Ensure every template has a summary section at root (stat-cards or key-value)
8. Verify widget types match the pattern's `recommendedWidgets`
9. Remove widgets types listed in the pattern's `discouragedWidgets`

#### Current Templates to Improve

| # | Template | Layout Pattern | Key Changes Needed |
|---|---------|----------------|-------------------|
| 1 | system-overview | dashboard-metrics | Use autoFit grid for stats, remove chart if just showing numbers |
| 2 | disk-usage | dashboard-metrics | Gauge for 1-3 critical disks, progress-bar for rest, table for details |
| 3 | docker-containers | tabbed-detail | Tabs per status (running/stopped/all), card-list for containers |
| 4 | network-connections | tabbed-detail | Already good (EX3-P.7), verify compliance with pattern |
| 5 | installed-packages | single-table | Summary key-value, table with filters and search |
| 6 | user-accounts | single-table | Summary stats, table with privileged/regular filters |
| 7 | process-list | single-table | Top processes table with sort + resource filters |
| 8 | security-audit | audit-report | Alert for critical findings, tabs by category |
| 9 | service-status | status-overview | Badge-grid for service states, detail table |
| 10 | crontab | single-table | Job summary stats, job table with schedule formatting |
| 11 | nginx-config | config-viewer | Metadata key-value, config code-block, health alerts |
| 12 | ssh-config | config-viewer | Auth methods as badge-grid, config code-block |
| 13 | firewall-rules | tabbed-detail | Stats, tabs for INPUT/OUTPUT/FORWARD chains |
| 14 | dns-config | config-viewer | Resolver info key-value, config code-block |
| 15 | log-analysis | log-viewer | Summary stats, log-viewer with filtering |

#### Acceptance Criteria

- [ ] All 15 templates rewritten to use layout patterns
- [ ] Every template has a `layoutPattern` field matching one of the 10 patterns
- [ ] All stat-card sections use `autoFit` grid
- [ ] Tables have filters where appropriate
- [ ] Charts removed where stat-card + progress-bar suffice
- [ ] Each template is a valid, parseable DynamicViewSchema
- [ ] Tests: validate all 15 templates parse correctly with updated schemas

---

### EX3-B.3: Expand Template Library to 25+

**Problem:** 15 templates cover common scenarios but miss many use cases. The LLM falls back to generic generation for Docker images, specific app configs, memory analysis, etc.

**Solution:** Add 10+ new templates to reach 25+ total coverage.

#### New Templates to Add

| # | Template | Layout Pattern | Description |
|---|---------|----------------|-------------|
| 16 | docker-images | single-table | Image inventory with size, tag, and layer count |
| 17 | docker-compose | tabbed-detail | Service tabs with status, ports, volumes per service |
| 18 | memory-analysis | dashboard-metrics | Memory breakdown stat-cards, swap usage, top consumers table |
| 19 | network-interfaces | tabbed-detail | Interface stat-cards, tabs per interface (config, stats, routes) |
| 20 | system-logs-journal | log-viewer | Journalctl output with priority filtering, error summary |
| 21 | ssl-certificates | single-table | Certificate inventory with expiry status badges |
| 22 | environment-variables | single-table | Env var table with search, categorized by type |
| 23 | git-repositories | card-list | Repo card-list with branch, last commit, status |
| 24 | database-status | tabbed-detail | Connection stats, slow queries, table sizes per DB |
| 25 | backup-status | status-overview | Backup job badges, history table, storage progress-bars |
| 26 | kernel-modules | single-table | Module table with loaded/available filter |
| 27 | port-scan | single-table | Port inventory with service identification, risk badges |

#### Acceptance Criteria

- [ ] 10+ new templates added (total >= 25)
- [ ] Each new template follows its assigned layout pattern
- [ ] All use autoFit grid for stat sections
- [ ] All validate against DynamicViewSchema
- [ ] Tests: all new templates parse correctly
- [ ] Template index updated with metadata

---

### EX3-B.4: FakeLLM Generator for Testing

**Problem:** Testing template quality requires actual LLM calls (slow, expensive) or manual inspection. No way to quickly verify that templates produce valid, well-structured views.

**Solution:** A `FakeLLMGenerator` that deterministically generates views using templates + sample data, without calling any LLM. Used for testing and playground iteration.

#### How It Works

```typescript
class FakeLLMGenerator {
  // Given a template name + mock terminal output, fill in the template
  // with parsed data to produce a complete DynamicViewSchema
  generate(templateName: string, mockOutput: string): DynamicViewSchema {
    const template = this.templates.get(templateName);
    const parsed = this.deterministicParse(mockOutput);
    return this.populateTemplate(template, parsed);
  }
}
```

- Select template by name or auto-match by content pattern
- Fill template widgets with mock data from fixture files
- Validate output against DynamicViewSchema
- Useful for: unit tests, playground, visual regression testing

#### Acceptance Criteria

- [ ] `FakeLLMGenerator` class in `server/src/dynamic-ui/fake-generator.ts`
- [ ] Generates views from template + fixture data (no LLM calls)
- [ ] Output validates against DynamicViewSchema
- [ ] Can auto-select template based on mock output patterns
- [ ] Used in tests for template quality validation
- [ ] Available in playground for visual testing

---

## Sub-Phase EX3-C: Progressive Multi-Step Generation

> Instead of waiting 5-15s for a complete UI, the user sees the layout build itself in real-time. Layout skeleton appears in <1.5s, then widgets stream in one-by-one.

---

### EX3-C.1: WorkingView & Mutation Tools

**Problem:** The current generation pipeline produces a complete view in one shot. To show progressive updates, we need a mutable view structure that can be built incrementally.

**Solution:** A `WorkingView` class that starts with a layout skeleton and supports typed mutations.

#### WorkingView API

```typescript
class WorkingView {
  private view: DynamicViewSchema;

  constructor(skeleton: DynamicViewSchema) {
    // Initialize with layout structure, empty widget slots
    this.view = skeleton;
  }

  // Add a widget to a specific location
  addWidget(sectionId: string, widget: WidgetSchema): void;

  // Replace a placeholder widget with a real one
  replaceWidget(widgetId: string, widget: WidgetSchema): void;

  // Update view metadata (title, icon)
  updateMetadata(meta: Partial<ViewMetadata>): void;

  // Add a tab to an existing tab layout
  addTab(tabsId: string, tab: TabSchema): void;

  // Get current snapshot for rendering
  getSnapshot(): DynamicViewSchema;

  // Get diff since last snapshot (for efficient updates)
  getDiff(): ViewDiff;
}
```

#### Mutation Tool Definitions (for Agent)

When using the UI Agent path, the agent has tools to mutate the working view:

```typescript
const mutationTools = [
  {
    name: 'add_widget',
    description: 'Add a widget to the current view at a specific location',
    parameters: {
      sectionId: z.string(),
      widget: WidgetSchema,
    },
  },
  {
    name: 'replace_widget',
    description: 'Replace a placeholder widget with a populated one',
    parameters: {
      widgetId: z.string(),
      widget: WidgetSchema,
    },
  },
  {
    name: 'add_tab',
    description: 'Add a new tab with content to an existing tab layout',
    parameters: {
      tabsId: z.string(),
      label: z.string(),
      count: z.number().optional(),
      icon: z.string().optional(),
      widget: WidgetSchema,
    },
  },
];
```

#### Acceptance Criteria

- [ ] `WorkingView` class in `server/src/dynamic-ui/working-view.ts`
- [ ] Supports: addWidget, replaceWidget, updateMetadata, addTab
- [ ] `getSnapshot()` always returns valid DynamicViewSchema
- [ ] `getDiff()` returns efficient diff for targeted updates
- [ ] Mutation tools registered in agent tool registry
- [ ] Tests: sequential mutations produce correct view

---

### EX3-C.2: layout_update Event Pipeline

**Problem:** The current pipeline sends a single `dynamic_view_complete` event with the full view. To show progressive assembly, we need incremental update events.

**Solution:** A new WebSocket event `layout_update` that sends view snapshots as widgets are added.

#### Event Flow

```
1. User asks "show me disk usage"
2. Backend: classify (Pass 1) -> select pattern + template
3. Backend: create skeleton from pattern
4. WebSocket: emit 'layout_update' { phase: 'skeleton', view: skeletonView }
5. Frontend: render skeleton with placeholder widgets (Skeleton components)
6. Backend: start generating widgets (Pass 2)
7. For each widget generated:
   a. WorkingView.addWidget(...)
   b. WebSocket: emit 'layout_update' { phase: 'widget', view: snapshot, widgetId: id }
   c. Frontend: replace skeleton placeholder with real widget (with animation)
8. WebSocket: emit 'layout_update' { phase: 'complete', view: finalView }
```

#### Event Schema

```typescript
const LayoutUpdateSchema = z.object({
  phase: z.enum(['skeleton', 'widget', 'complete', 'error']),
  view: DynamicViewSchema,
  widgetId: z.string().nullable().optional(),    // which widget was just added/updated
  progress: z.number().min(0).max(1).optional(), // 0.0 to 1.0 completion
  error: z.string().nullable().optional(),
});
```

#### Acceptance Criteria

- [ ] `layout_update` WebSocket event defined and emitted
- [ ] Skeleton phase renders in < 1.5s
- [ ] Widget updates trigger incremental re-renders (not full re-render)
- [ ] Progress indicator shows completion percentage
- [ ] Error phase handles generation failures gracefully
- [ ] Frontend `useDynamicView` hook handles progressive updates
- [ ] Tests: event pipeline emits correct sequence

---

### EX3-C.3: Early Window Opening

**Problem:** Currently the dynamic UI window opens only after the complete view is generated (5-15s wait). The user has no feedback during generation.

**Solution:** Open the DynamicUIWindow immediately when generation starts, showing a skeleton layout that fills in progressively.

#### Flow

```
1. User requests dynamic view (via agent or sidebar action)
2. Immediately: open DynamicUIWindow with loading state
3. After classifier (< 500ms): show skeleton layout with placeholders
4. As widgets generate: replace placeholders with real widgets
5. On complete: final polish (remove loading indicators)
```

#### Implementation

- Frontend: `DynamicUIWindow` opens immediately in `loading` state
- Backend: classifier result triggers `skeleton` event (< 500ms)
- Frontend: skeleton replaces loading state with placeholder widgets
- Backend: generator emits `widget` events as each widget completes
- Frontend: each widget fades in, replacing its placeholder

#### Acceptance Criteria

- [ ] Window opens within 100ms of user request
- [ ] Skeleton appears within 500ms (after classification)
- [ ] Widgets stream in one-by-one with smooth transitions
- [ ] Error state shown if generation fails at any point
- [ ] User can close window during generation (cancels backend work)
- [ ] Tests: timing assertions for window open and skeleton display

---

### EX3-C.4: Multi-Step Executor Prompt

**Problem:** The current generator produces the entire view in one LLM call. For progressive generation, the agent needs to generate widgets step-by-step using mutation tools.

**Solution:** A specialized system prompt for the multi-step executor that guides the agent to build views incrementally.

#### Prompt Structure

```
You are a UI builder. You have a layout skeleton with empty widget slots.
Your job is to fill each slot with a real widget using the mutation tools.

Current skeleton: {skeleton JSON}
Classification: {classification result}
Terminal output: {raw output}

Available tools: add_widget, replace_widget, add_tab

Instructions:
1. Start with the summary section — fill stat-cards/key-value first
2. Then fill the primary content (main table, card-list, etc.)
3. Then fill secondary content (tabs, additional tables)
4. Follow the population rules for pattern: {pattern name}
5. Use the widget types from expectedWidgets: {list}
6. Do NOT add chart/gauge unless useVisualization is true

Call one tool at a time. Each tool call will update the view shown to the user.
```

#### Acceptance Criteria

- [ ] Multi-step executor prompt in `server/src/dynamic-ui/prompts/multi-step.ts`
- [ ] Agent uses mutation tools to build view incrementally
- [ ] Each tool call triggers a `layout_update` event
- [ ] Generation follows pattern population rules
- [ ] Total generation time < 15s for complex views (< 8s typical)
- [ ] Tests: agent generates correct widget sequence for known inputs

---

## Sub-Phase EX3-D: Unified Window & Visual Polish

> The final polish phase — a unified window component, toolbar for view actions, entrance animations, and visual refinement.

---

### EX3-D.1: DynamicUIWindow Component

**Problem:** Dynamic views currently render inside a generic AppWindow. They need a purpose-built window with proper title, icon, sizing, and integration with the progressive pipeline.

**Solution:** A `DynamicUIWindow` component that extends AppWindow with dynamic-view-specific features.

#### Features

- Title from view metadata (`view.title`) or auto-generated from tool name
- Icon from view metadata or tool icon
- Proper sizing: starts at 800x600, resizable, remembers last size
- Sidebar for multi-section views (sections listed as navigation)
- Footer with generation metadata: model used, latency, token count
- Loading states: empty -> skeleton -> progressive fill -> complete

#### Acceptance Criteria

- [ ] `DynamicUIWindow` component in `client/src/components/DynamicUI/DynamicUIWindow.tsx`
- [ ] Uses AppWindow as base with dynamic-view extensions
- [ ] Proper title/icon from view metadata
- [ ] Loading -> skeleton -> progressive -> complete states
- [ ] Footer with generation stats
- [ ] Resizable with size memory
- [ ] Tests: renders in all states

---

### EX3-D.2: View Toolbar

**Problem:** Once a view is generated, the user can't do anything with it — no refresh, no copy, no export, no fullscreen.

**Solution:** A toolbar in the DynamicUIWindow header with common actions.

#### Actions

| Action | Icon | Description |
|--------|------|-------------|
| Refresh | RefreshCw | Re-run the command and regenerate the view |
| Copy JSON | ClipboardCopy | Copy the view schema as JSON |
| Fullscreen | Maximize2 | Toggle fullscreen mode |
| Pin | Pin | Keep this view open (don't close on new views) |

#### Acceptance Criteria

- [ ] Toolbar component with 4 actions
- [ ] Refresh re-runs generation pipeline
- [ ] Copy JSON copies DynamicViewSchema to clipboard
- [ ] Fullscreen toggles window size
- [ ] Pin prevents auto-close behavior
- [ ] Tests: toolbar actions work correctly

---

### EX3-D.3: Entrance Animations

**Problem:** When widgets appear during progressive generation, they pop in abruptly. Smooth animations would make the progressive assembly feel polished.

**Solution:** CSS/Framer Motion animations for widget entrance during progressive generation.

#### Animation Types

- **Skeleton -> Widget**: fade + scale-up (opacity 0->1, scale 0.95->1, 200ms)
- **Tab added**: slide-in from right (translateX 20px->0, 150ms)
- **View complete**: subtle pulse on completion indicator

#### Implementation

- Use TailwindCSS `animate-*` classes where possible
- Minimal Framer Motion for complex transitions (only if already in bundle)
- Animations disabled when `prefers-reduced-motion` is set
- No animation for initial full render (only during progressive updates)

#### Acceptance Criteria

- [ ] Fade-in animation for widget placement
- [ ] Tab slide-in animation
- [ ] Respects `prefers-reduced-motion`
- [ ] No animation jank or layout shift
- [ ] Tests: animations trigger correctly during progressive render

---

### EX3-D.4: Template QA & Visual Regression

**Problem:** With 25+ templates and new widget types, visual quality needs systematic verification. No automated way to check that templates produce good-looking views.

**Solution:** A playground-based QA workflow + visual regression snapshots.

#### QA Workflow

1. FakeLLM generates views for all 25+ templates with mock data
2. Playground renders each view side-by-side
3. Manual QA checklist per template:
   - [ ] Stats in grid (not stacked)
   - [ ] Tables have filters (if > 10 rows)
   - [ ] Tabs have count badges
   - [ ] No unnecessary charts
   - [ ] Proper spacing and alignment
   - [ ] Theme-aware colors (dark mode correct)

#### Acceptance Criteria

- [ ] Playground renders all 25+ templates
- [ ] FakeLLM generates views for each template
- [ ] QA checklist applied to each template
- [ ] All templates pass visual QA
- [ ] Screenshots captured for reference (optional)

---

## Task Summary

| Task | Title | Sub-Phase | Depends On | Priority |
|------|-------|-----------|------------|----------|
| EX3-A.1 | Two-Pass Design Classifier | A | - | P0 (critical) |
| EX3-A.2 | Layout Pattern Library | A | - | P0 (critical) |
| EX3-A.3 | Responsive Auto-Fit Grid | A | - | P0 (critical) |
| EX3-A.4 | Gauge Widget | A | A.3 | P1 |
| EX3-A.5 | Sparkline Stat Card | A | A.3 | P1 |
| EX3-A.6 | Enhanced Chart Options | A | - | P2 |
| EX3-B.1 | Design System Rules in Prompt | B | A.1, A.2 | P0 (critical) |
| EX3-B.2 | Improve 15 Templates | B | A.2, B.1 | P0 (critical) |
| EX3-B.3 | Expand to 25+ Templates | B | B.2 | P1 |
| EX3-B.4 | FakeLLM Generator | B | B.2 | P1 |
| EX3-C.1 | WorkingView & Mutation Tools | C | A.2 | P1 |
| EX3-C.2 | layout_update Event Pipeline | C | C.1 | P1 |
| EX3-C.3 | Early Window Opening | C | C.2 | P1 |
| EX3-C.4 | Multi-Step Executor Prompt | C | C.1, B.1 | P1 |
| EX3-D.1 | DynamicUIWindow Component | D | C.3 | P1 |
| EX3-D.2 | View Toolbar | D | D.1 | P2 |
| EX3-D.3 | Entrance Animations | D | C.2, D.1 | P2 |
| EX3-D.4 | Template QA & Visual Regression | D | B.3, B.4 | P2 |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| First visual (skeleton) | < 1.5s |
| Full view generation | < 15s worst case, < 8s typical |
| Stat-cards in grid (not stacked) | 100% of views with metrics |
| Multi-dataset views using tabs | 100% |
| Views with unnecessary charts | < 20% include any chart/gauge |
| Template coverage | 25+ templates |
| Layout patterns used | 10 patterns covering all content types |
| Classification accuracy | > 90% correct contentType assignment |
| Auto-fit grids responsive | Works from 400px to 2000px width |
| All templates pass QA | 100% |

---

## Anti-Patterns (What This Phase is NOT)

1. **NOT a Grafana clone.** We don't need 24-column grids, drag-and-drop editors, or panel plugins. We adopt smart CSS grid patterns and layout classification — nothing more.

2. **NOT a visualization platform.** Charts are supporting elements only. If a stat-card + progress-bar conveys the information, don't add a chart. The classifier's `useVisualization` flag gates chart/gauge usage.

3. **NOT chart-first design.** Every view starts with widgets (tables, stat-cards, key-value, badge-grids). Charts are added last, only if the classifier justifies them.

4. **NOT a 24-column grid editor.** Users don't drag widgets to positions. The LLM decides layout based on classification + patterns. The grid is responsive auto-fit, not manual placement.

5. **NOT a variable/dashboard system.** No template variables, no dashboard templating, no drill-down links between panels. Each view is self-contained.

---

## Open Questions

1. **Classifier model choice**: gpt-4.1-nano vs gpt-4.1-mini for classification? Need to benchmark accuracy vs latency.
2. **Pattern extensibility**: Should users be able to add custom layout patterns, or are the 10 built-in patterns sufficient?
3. **Progressive generation granularity**: One widget per update, or batch related widgets (e.g., all stat-cards at once)?
4. **Template sharing**: Should templates be exportable/importable between HeadlessOS instances?
5. **Skeleton accuracy**: How detailed should the skeleton be? Full layout with placeholders, or just a rough shape?
6. **Cache interaction**: How does the output cache (M4.7) interact with progressive generation? Cache the final view, or individual widget outputs?
