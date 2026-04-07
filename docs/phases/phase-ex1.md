# Phase EX1: Dynamic UI Engine

> **Experimental Track** — LLM-generated dynamic interfaces from terminal output.
> This is the core differentiator of HeadlessOS: any CLI tool gets a visual UI without writing React components.
>
> **ADR:** [ADR-015](../DECISIONS.md) — Dynamic UI Engine
> **Task IDs:** EX1.1 – EX1.14

---

## Overview

The Dynamic UI Engine transforms terminal output into visual interfaces via a JSON schema intermediate layer. An LLM analyzes command output, selects from a template library (or generates from scratch), and produces a `DynamicViewSchema` JSON blob. A generic React renderer turns that JSON into live UI widgets using existing shadcn/ui components.

**The "magical" effect:** The LLM generates JSON **incrementally via streaming**. The frontend renders each widget as it arrives — the user watches the UI assemble itself in real-time. No loading spinners, no waiting for full generation.

```
                         DYNAMIC UI ENGINE PIPELINE
                         
User Trigger (Command Palette / Agent / Terminal)
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  DynamicUIGenerator (Backend Service)                     │
│                                                            │
│  1. Identify tool / parse context                         │
│  2. Search Template Library for matching template          │
│  3. LLM call (streaming):                                  │
│     - System prompt + template (if found) + raw output     │
│     - zodResponseFormat(DynamicViewSchema)                  │
│     - Stream partial JSON via WebSocket                    │
│  4. Validate complete schema with Zod                      │
│  5. Cache result (keyed by tool + output hash)             │
└──────────────────────────┬───────────────────────────────┘
                           │ WebSocket (incremental JSON chunks)
                           ▼
┌──────────────────────────────────────────────────────────┐
│  DynamicViewRenderer (React)                              │
│                                                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐      │
│  │  Table   │ │  Chart  │ │  Badge  │ │ StatCard │ ...  │
│  │ Widget   │ │ Widget  │ │  Grid   │ │  Widget  │      │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘      │
│                                                            │
│  Renders widgets progressively as JSON arrives.            │
│  Skeleton placeholders for pending widgets.                │
│  Wrapped in AppWindow (overlay) or desktop tab.           │
└──────────────────────────────────────────────────────────┘
```

---

## Phase 1: JSON → UI Renderer (Foundation)

### EX1.1: DynamicViewSchema (Zod)

**Goal:** Define the Zod schema that describes all possible dynamic UI layouts.

**Location:** `shared/schemas/dynamic-view.ts`

**Schema design:**

```typescript
import { z } from 'zod';

// ── Base widget types ──────────────────────────────────

export const TableWidgetSchema = z.object({
  type: z.literal('table'),
  title: z.string().optional(),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['text', 'number', 'badge', 'date', 'bytes', 'percent', 'code']).default('text'),
    sortable: z.boolean().default(false),
    width: z.string().optional(),
    badgeVariant: z.record(z.string(), z.enum([
      'default', 'secondary', 'destructive', 'outline', 'success', 'warning'
    ])).optional().describe('Map value → badge variant, e.g. { running: "success", stopped: "destructive" }'),
  })),
  rows: z.array(z.record(z.string(), z.unknown())),
  footer: z.string().optional(),
});

export const KeyValueWidgetSchema = z.object({
  type: z.literal('key-value'),
  title: z.string().optional(),
  pairs: z.array(z.object({
    key: z.string(),
    value: z.string(),
    icon: z.string().optional().describe('Lucide icon name'),
    copyable: z.boolean().default(false),
  })),
  layout: z.enum(['vertical', 'grid-2', 'grid-3', 'grid-4']).default('grid-2'),
});

export const BadgeGridWidgetSchema = z.object({
  type: z.literal('badge-grid'),
  title: z.string().optional(),
  badges: z.array(z.object({
    label: z.string(),
    value: z.string(),
    variant: z.enum(['default', 'secondary', 'destructive', 'outline', 'success', 'warning']).default('default'),
  })),
});

export const StatCardWidgetSchema = z.object({
  type: z.literal('stat-card'),
  title: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  description: z.string().optional(),
  trend: z.enum(['up', 'down', 'neutral']).optional(),
  icon: z.string().optional().describe('Lucide icon name'),
});

export const ProgressBarWidgetSchema = z.object({
  type: z.literal('progress-bar'),
  title: z.string().optional(),
  value: z.number().min(0).max(100),
  label: z.string().optional(),
  variant: z.enum(['default', 'success', 'warning', 'destructive']).default('default'),
});

export const CodeBlockWidgetSchema = z.object({
  type: z.literal('code-block'),
  title: z.string().optional(),
  code: z.string(),
  language: z.string().default('text'),
  maxHeight: z.string().optional().describe('CSS max-height, e.g. "300px"'),
});

export const AlertWidgetSchema = z.object({
  type: z.literal('alert'),
  title: z.string().optional(),
  message: z.string(),
  variant: z.enum(['default', 'destructive', 'success', 'warning']).default('default'),
});

// ── Extended widget types (EX1.5) ──────────────────────

export const ChartWidgetSchema = z.object({
  type: z.literal('chart'),
  title: z.string().optional(),
  chartType: z.enum(['bar', 'line', 'area', 'pie', 'donut']),
  data: z.array(z.record(z.string(), z.unknown())),
  xKey: z.string(),
  yKeys: z.array(z.object({
    key: z.string(),
    label: z.string().optional(),
    color: z.string().optional().describe('CSS color or chart palette key'),
  })),
  height: z.number().default(300),
});

export const TreeWidgetSchema = z.object({
  type: z.literal('tree'),
  title: z.string().optional(),
  nodes: z.array(z.lazy(() => TreeNodeSchema)),
});

const TreeNodeSchema: z.ZodType = z.object({
  label: z.string(),
  value: z.string().optional(),
  icon: z.string().optional(),
  children: z.array(z.lazy(() => TreeNodeSchema)).optional(),
});

export const LogViewerWidgetSchema = z.object({
  type: z.literal('log-viewer'),
  title: z.string().optional(),
  lines: z.array(z.object({
    timestamp: z.string().optional(),
    level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    message: z.string(),
  })),
  maxHeight: z.string().default('400px'),
});

// ── Union of all widgets ────────────────────────────────

export const WidgetSchema = z.discriminatedUnion('type', [
  TableWidgetSchema,
  KeyValueWidgetSchema,
  BadgeGridWidgetSchema,
  StatCardWidgetSchema,
  ProgressBarWidgetSchema,
  CodeBlockWidgetSchema,
  AlertWidgetSchema,
  ChartWidgetSchema,
  TreeWidgetSchema,
  LogViewerWidgetSchema,
]);

export type Widget = z.infer<typeof WidgetSchema>;

// ── Layout containers ───────────────────────────────────

export const StackLayoutSchema = z.object({
  layout: z.literal('stack'),
  gap: z.enum(['sm', 'md', 'lg']).default('md'),
  widgets: z.array(WidgetSchema),
});

export const GridLayoutSchema = z.object({
  layout: z.literal('grid'),
  columns: z.number().min(1).max(4).default(2),
  widgets: z.array(WidgetSchema),
});

export const TabsLayoutSchema = z.object({
  layout: z.literal('tabs'),
  tabs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    icon: z.string().optional(),
    widgets: z.array(WidgetSchema),
  })),
});

export const SidebarLayoutSchema = z.object({
  layout: z.literal('sidebar'),
  sidebarItems: z.array(z.object({
    id: z.string(),
    label: z.string(),
    icon: z.string().optional(),
  })),
  sections: z.record(z.string(), z.array(WidgetSchema)),
});

export const LayoutSchema = z.discriminatedUnion('layout', [
  StackLayoutSchema,
  GridLayoutSchema,
  TabsLayoutSchema,
  SidebarLayoutSchema,
]);

export type Layout = z.infer<typeof LayoutSchema>;

// ── Top-level schema ────────────────────────────────────

export const DynamicViewSchema = z.object({
  /** Display title for the window */
  title: z.string(),
  /** Optional subtitle / description */
  description: z.string().optional(),
  /** Lucide icon name */
  icon: z.string().optional(),
  /** The root layout container */
  root: LayoutSchema,
  /** Metadata about generation */
  meta: z.object({
    tool: z.string().optional().describe('CLI tool or package name'),
    command: z.string().optional().describe('Command that produced the data'),
    generatedAt: z.string().optional(),
    templateId: z.string().optional().describe('Template used, if any'),
  }).optional(),
});

export type DynamicView = z.infer<typeof DynamicViewSchema>;
```

**Acceptance Criteria:**
- [ ] Schema compiles with TypeScript strict
- [ ] All widget types have unique `type` discriminator
- [ ] Schema works with `zodResponseFormat()` for LLM structured output
- [ ] Unit tests cover: valid schema, invalid widget type, missing required fields, nested layouts
- [ ] Schema exported from `shared/` so both server and client can import

**Files:**
- `shared/schemas/dynamic-view.ts` — Zod schema + TypeScript types
- `shared/schemas/index.ts` — re-exports
- Tests: `server/tests/parsers/dynamic-view-schema.test.ts`

---

### EX1.2: DynamicViewRenderer + Widget Components

**Goal:** Build the React renderer that turns `DynamicViewSchema` JSON into live UI.

**Location:** `client/src/components/DynamicUI/`

**Components:**

```
DynamicUI/
├── DynamicViewRenderer.tsx    # Root renderer — dispatches by layout type
├── layouts/
│   ├── StackLayout.tsx        # Vertical stack of widgets
│   ├── GridLayout.tsx         # CSS grid with configurable columns
│   ├── TabsLayout.tsx         # shadcn Tabs component
│   └── SidebarLayout.tsx      # AppWindow.Sidebar pattern
├── widgets/
│   ├── TableWidget.tsx        # shadcn Table
│   ├── KeyValueWidget.tsx     # Grid of key-value pairs
│   ├── BadgeGridWidget.tsx    # Grid of Badge components
│   ├── StatCardWidget.tsx     # Card with value + trend arrow
│   ├── ProgressBarWidget.tsx  # shadcn Progress
│   ├── CodeBlockWidget.tsx    # Pre-formatted code with syntax highlighting
│   └── AlertWidget.tsx        # shadcn Alert
└── WidgetRenderer.tsx         # Switch on widget.type → correct component
```

**Key patterns:**

```tsx
// DynamicViewRenderer.tsx
export function DynamicViewRenderer({ view }: { view: DynamicView }) {
  return (
    <div className="space-y-4">
      {view.description && <p className="text-sm text-muted-foreground">{view.description}</p>}
      <LayoutRenderer layout={view.root} />
    </div>
  );
}

// WidgetRenderer.tsx — widget type → component map
const WIDGET_MAP: Record<string, React.ComponentType<{ widget: Widget }>> = {
  'table': TableWidget,
  'key-value': KeyValueWidget,
  'badge-grid': BadgeGridWidget,
  'stat-card': StatCardWidget,
  'progress-bar': ProgressBarWidget,
  'code-block': CodeBlockWidget,
  'alert': AlertWidget,
};

export function WidgetRenderer({ widget }: { widget: Widget }) {
  const Component = WIDGET_MAP[widget.type];
  if (!Component) return <Alert variant="destructive">Unknown widget: {widget.type}</Alert>;
  return <Component widget={widget} />;
}
```

**Streaming support (CRITICAL):**
- `DynamicViewRenderer` must handle **partial schemas** where `widgets` array grows incrementally
- As new widgets arrive via WebSocket, they animate in (fade-in / slide-up)
- Skeleton placeholders can optionally show for "expected" widget count (if LLM declares it upfront)

**Acceptance Criteria:**
- [ ] All 7 base widget types render correctly from JSON
- [ ] StackLayout and GridLayout arrange widgets as specified
- [ ] Partial schema renders available widgets (doesn't crash on incomplete data)
- [ ] Widget entrance animation (subtle fade-in)
- [ ] Component tests for each widget type with sample JSON
- [ ] All widgets use shadcn/ui primitives and design tokens (no hardcoded colors)

**Files:**
- `client/src/components/DynamicUI/` — all component files
- Tests: `client/tests/components/DynamicUI/`

---

### EX1.3: DynamicAppWindow Wrapper

**Goal:** Wrap `DynamicViewRenderer` in `AppWindow` for overlay display.

**Location:** `client/src/components/DynamicUI/DynamicAppWindow.tsx`

```tsx
export function DynamicAppWindow({ view, open, onClose }: {
  view: DynamicView;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AppWindow
      open={open}
      onOpenChange={(open) => !open && onClose()}
      title={view.title}
      icon={view.icon}
    >
      <AppWindow.Body>
        <DynamicViewRenderer view={view} />
      </AppWindow.Body>
    </AppWindow>
  );
}
```

**Features:**
- Uses existing `AppWindow` compound component (title bar, close button, draggable)
- If the `DynamicView` uses `sidebar` layout, maps to `AppWindow.Sidebar`
- Footer shows generation metadata (template used, latency, cost)
- "Regenerate" button in toolbar to re-run LLM generation
- "View JSON" toggle to see raw schema (developer mode)

**Acceptance Criteria:**
- [ ] Opens as modal overlay (consistent with other AppWindows)
- [ ] Sidebar layout uses AppWindow.Sidebar correctly
- [ ] Close button works
- [ ] Shows generation metadata in footer
- [ ] "View JSON" toggle works

---

### EX1.4: JSON Playground (Dev Tool)

**Goal:** Split-pane developer tool for testing dynamic UI schemas.

**Location:** `client/src/components/DynamicUI/DynamicUIPlayground.tsx`

**Layout:**
```
┌────────────────────────────────────────────────────┐
│  Dynamic UI Playground                    [x]      │
├───────────────────────┬────────────────────────────┤
│                       │                            │
│  JSON Editor          │   Live Preview             │
│  (left pane)          │   (right pane)             │
│                       │                            │
│  {                    │   ┌─ System Overview ────┐  │
│    "title": "...",    │   │ CPU: 45%   MEM: 78%  │  │
│    "root": {          │   │ Disk: 320GB / 500GB  │  │
│      "layout":..     │   └──────────────────────┘  │
│    }                  │                            │
│  }                    │                            │
│                       │                            │
├───────────────────────┴────────────────────────────┤
│  Zod Validation: ✅ Valid    │  Widgets: 4         │
└────────────────────────────────────────────────────┘
```

**Features:**
- Left pane: JSON text editor with syntax highlighting (use `<Textarea>` or a code editor component)
- Right pane: Live `DynamicViewRenderer` preview that updates on JSON change (debounced 300ms)
- Bottom bar: Zod validation status (✅ Valid / ❌ Error with message), widget count
- Pre-loaded example JSONs (dropdown selector)
- Import/Export buttons
- Accessible from Command Palette: "Dynamic UI Playground"

**Acceptance Criteria:**
- [ ] JSON changes reflect in live preview within 300ms
- [ ] Invalid JSON shows clear Zod error messages
- [ ] Pre-loaded examples work correctly
- [ ] Registered in app registry and accessible from Command Palette

---

### EX1.5: Extended Widget Types

**Goal:** Add rich widget types beyond base set.

**New widget components:**
- `ChartWidget.tsx` — Bar, Line, Area, Pie, Donut (uses existing `ChartContainer` + recharts)
- `TreeWidget.tsx` — Recursive tree view (collapsible nodes)
- `LogViewerWidget.tsx` — Scrollable log with level coloring + timestamp
- `FormWidget.tsx` (future) — Input form that maps to server commands

**Key: Chart integration**
```tsx
// ChartWidget.tsx uses existing shadcn chart infrastructure
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, LineChart, Line, ... } from 'recharts';
```

**Acceptance Criteria:**
- [ ] Chart widget renders bar, line, area, pie, donut from JSON data
- [ ] Tree widget supports 3+ levels of nesting with collapse/expand
- [ ] Log viewer supports level-based coloring (error=red, warn=yellow, info=blue)
- [ ] All extended widgets added to `WidgetSchema` discriminated union
- [ ] Component tests for each

---

### EX1.6: Layout Compositions (Tabs + Sidebar)

**Goal:** Support tabbed and sidebar-based layouts in DynamicViewSchema.

**TabsLayout:**
```json
{
  "layout": "tabs",
  "tabs": [
    { "id": "overview", "label": "Overview", "widgets": [...] },
    { "id": "details", "label": "Details", "widgets": [...] }
  ]
}
```
Maps to shadcn `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`.

**SidebarLayout:**
```json
{
  "layout": "sidebar",
  "sidebarItems": [
    { "id": "general", "label": "General", "icon": "settings" },
    { "id": "network", "label": "Network", "icon": "globe" }
  ],
  "sections": {
    "general": [...widgets],
    "network": [...widgets]
  }
}
```
Maps to `AppWindow.Sidebar` + `AppWindow.SidebarItem` navigation.

**Acceptance Criteria:**
- [ ] TabsLayout switches content correctly
- [ ] SidebarLayout navigates between sections
- [ ] Both layouts support streaming (new tabs/sections appear incrementally)
- [ ] Nested layouts work (sidebar with tabs inside a section)

---

## Phase 2: LLM → JSON Generation

### EX1.7: Template Library

**Goal:** Create 15-20 curated JSON templates for common CLI output patterns.

**Location:** `server/src/dynamic-ui/templates/`

**Template structure:**
```typescript
interface UITemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];           // ['system', 'monitoring', 'network', ...]
  matchPatterns: string[];  // regex patterns to match tool names / commands
  schema: DynamicView;      // the template JSON (with {{ placeholder }} fields)
}
```

**Initial templates:**

| # | Template ID | Description | Widgets |
|---|------------|-------------|----------|
| 1 | `system-overview` | System stats (CPU, mem, disk, uptime) | StatCard grid + ProgressBar |
| 2 | `package-list` | Package listing (rpm/apt/pip) | Table with badge status |
| 3 | `port-table` | Listening ports / connections | Table with protocol badges |
| 4 | `log-viewer` | Any log file output | LogViewer widget |
| 5 | `config-file` | Config file contents | CodeBlock + KeyValue |
| 6 | `user-list` | System users / sessions | Table with badges |
| 7 | `disk-usage` | Filesystem / directory sizes | Table + ProgressBars |
| 8 | `docker-overview` | Container status summary | BadgeGrid + Table |
| 9 | `network-info` | IP addresses, routes, DNS | KeyValue + Table |
| 10 | `service-status` | Systemd service details | KeyValue + CodeBlock (logs) |
| 11 | `git-status` | Repo status, recent commits | KeyValue + Table |
| 12 | `process-top` | Top processes by resource | Table sortable |
| 13 | `security-audit` | Failed logins, open ports, etc. | Alert + Table |
| 14 | `cron-schedule` | Cron job listing | Table |
| 15 | `database-info` | MySQL/PostgreSQL status | StatCards + Table |

**Acceptance Criteria:**
- [ ] 15+ templates created as JSON files
- [ ] Each template validates against `DynamicViewSchema`
- [ ] Template matching logic (by tool name / command pattern)
- [ ] Unit tests: each template passes Zod validation

---

### EX1.8: DynamicUIGenerator Service (Streaming)

**Goal:** Backend service that generates `DynamicViewSchema` from command output, streaming the result incrementally.

**Location:** `server/src/dynamic-ui/generator.ts`

**Service design:**

```typescript
export class DynamicUIGenerator extends BaseService {
  // Main generation method — returns an async iterator for streaming
  async *generateStreaming(input: {
    tool: string;
    command: string;
    rawOutput: string;
    serverId: string;
  }): AsyncGenerator<DynamicViewChunk> {
    // 1. Check cache
    const cached = this.cache.get(tool, rawOutput);
    if (cached) { yield { type: 'complete', view: cached }; return; }

    // 2. Find matching template
    const template = this.templateLibrary.findMatch(tool, command);

    // 3. Build LLM prompt
    const prompt = this.buildPrompt(tool, rawOutput, template);

    // 4. Stream LLM response
    const stream = await this.llm.streamParse({
      prompt,
      schema: DynamicViewSchema,
      systemPrompt: DYNAMIC_UI_SYSTEM_PROMPT,
    });

    // 5. Yield incremental chunks as JSON builds up
    let partialView: Partial<DynamicView> = {};
    for await (const chunk of stream) {
      partialView = this.mergeChunk(partialView, chunk);
      yield { type: 'partial', view: partialView };
    }

    // 6. Validate final result
    const validated = DynamicViewSchema.parse(partialView);
    this.cache.set(tool, rawOutput, validated);
    yield { type: 'complete', view: validated };
  }
}
```

**WebSocket endpoint:**
```
WS /ws/dynamic-ui/:serverId
  → Client sends: { tool: "nginx", command: "nginx -T" }
  ← Server streams: { type: "partial", view: { title: "Nginx...", root: { widgets: [...] } } }
  ← Server streams: { type: "partial", view: { ... more widgets ... } }
  ← Server sends:   { type: "complete", view: { ... full validated schema ... } }
```

**Streaming JSON parsing strategy:**
- Use OpenAI streaming with `zodResponseFormat()` partial parsing
- As each widget object completes in the JSON stream, emit it immediately
- Frontend receives widgets one-by-one and renders them with entrance animations
- If streaming fails mid-generation, render whatever was received + show error alert

**LLM System Prompt (excerpt):**
```
You are a UI generator for HeadlessOS. Given terminal command output, generate a DynamicView JSON schema that best visualizes the data.

Rules:
- Use the most appropriate widget types for the data
- Prefer tables for lists, stat-cards for single metrics, badge-grids for status overviews
- Use meaningful titles and descriptions
- Badge variants: success=running/active/ok, destructive=error/failed/down, warning=degraded/pending
- If a template is provided, customize it for the specific data; otherwise generate from scratch
- Keep layouts simple: prefer stack or grid for most views
- Maximum 10 widgets per view (avoid overwhelming the user)
```

**Acceptance Criteria:**
- [ ] Generator produces valid `DynamicViewSchema` from sample terminal output
- [ ] Streaming works — frontend receives incremental updates
- [ ] Template matching works (template found → customized, not found → generated from scratch)
- [ ] Cache prevents re-generation for identical output
- [ ] Zod validation on final result
- [ ] Error handling: partial generation on LLM failure
- [ ] LLM usage tracked (tokens, cost, latency) via existing `LLMUsageTracker`
- [ ] WebSocket endpoint registered in Fastify

---

### EX1.9: Command Palette Trigger

**Goal:** User types a tool name in the Command Palette → Dynamic UI is generated.

**Flow:**
```
1. User presses Ctrl+K (Command Palette opens)
2. User types "nginx" or "show nginx config"
3. Command palette shows: "🔮 Generate Dynamic UI for nginx"
4. User selects → backend runs relevant command(s) on server
5. DynamicUIGenerator streams JSON → DynamicAppWindow opens
6. User watches widgets assemble progressively
```

**Command Palette integration:**
- New command group: "Dynamic UI" in the Command Palette
- Fuzzy search against template library tags + tool names
- If tool isn't on the server, show warning
- Recent dynamic UIs shown at top of the group

**Acceptance Criteria:**
- [ ] Command palette shows "Generate Dynamic UI" option
- [ ] Fuzzy search works against tool names and descriptions
- [ ] Generation streams to AppWindow in real-time
- [ ] Works for tools with templates AND unknown tools (pure LLM generation)
- [ ] Loading state while SSH command executes (before LLM starts)

---

### EX1.10: Schema Caching & Persistence

**Goal:** Cache generated schemas so repeat views are instant.

**Cache layers:**
1. **Memory cache** — hash-based, keyed by `(tool + command + outputHash)`, TTL 5 minutes
2. **Disk cache** — persist popular schemas to `~/.headlessos/dynamic-ui-cache/`
3. **User favorites** — user can "pin" a generated view for quick access

**Cache invalidation:**
- Output changes → new hash → cache miss → regenerate
- User clicks "Regenerate" → bypass cache
- Server disconnect → invalidate all caches for that server

**Acceptance Criteria:**
- [ ] Cache hit returns instantly (no LLM call)
- [ ] Cache miss triggers generation
- [ ] Disk persistence survives app restart
- [ ] "Regenerate" bypasses cache
- [ ] Cache stats visible in LLM Usage Stats (`GET /api/stats/llm`)

---

## Phase 3: Full Integration

### EX1.11: Terminal Buffer Capture

**Goal:** Capture terminal output and offer dynamic UI generation.

**Flow:**
```
1. User runs a command in the interactive terminal
2. Backend captures the last N lines of terminal output
3. If output looks "parseable" (tables, lists, configs, logs):
   → Show a subtle "✨ Visualize" button near the terminal
4. User clicks → DynamicUIGenerator runs → AppWindow opens
```

**Implementation:**
- Terminal output buffer maintained by WebSocket terminal handler
- Pattern detection for "interesting" output: tables (aligned columns), JSON, log patterns, config (key=value)
- Non-intrusive suggestion — small floating button, auto-dismisses after 10s

**Acceptance Criteria:**
- [ ] Terminal buffer captures last 500 lines
- [ ] Pattern detection identifies parseable output
- [ ] "Visualize" button appears non-intrusively
- [ ] Generated UI matches the terminal output content

---

### EX1.12: Live Data Refresh

**Goal:** Widgets with a `dataSource` config can auto-refresh.

**Widget-level data source:**
```json
{
  "type": "table",
  "title": "Running Containers",
  "dataSource": {
    "command": "docker ps --format '{{json .}}'",
    "refreshInterval": 10000,
    "parseMode": "json"
  },
  "columns": [...],
  "rows": []  // Initial rows from generation; replaced on refresh
}
```

**Implementation:**
- `DynamicViewRenderer` detects widgets with `dataSource`
- Backend runs the command periodically, re-parses, sends updated `rows` via WebSocket
- Only the data changes — layout/columns stay the same (no re-generation)
- Efficient: only changed widgets update, not the entire view

**Acceptance Criteria:**
- [ ] `dataSource` field added to widget schemas
- [ ] Auto-refresh works at specified interval
- [ ] Only data changes, not layout
- [ ] Refresh can be paused/resumed by user
- [ ] Visual indicator when data is refreshing (subtle pulse)

---

### EX1.13: Desktop Tab Integration

**Goal:** Dynamic UIs can open as desktop tabs (not just AppWindow overlays).

**Implementation:**
- New app type in app registry: `dynamic-ui`
- When user pins a dynamic view, it gets a desktop tab like any other app
- Tab shows the dynamic view icon + title
- Tab persists across sessions via disk cache

**Acceptance Criteria:**
- [ ] Dynamic view can be opened as desktop tab
- [ ] Tab shows custom icon and title
- [ ] Tab persists across page reloads
- [ ] Multiple dynamic tabs can be open simultaneously

---

### EX1.14: Action Execution from Dynamic UI

**Goal:** Buttons in dynamic UI widgets can trigger server commands.

**Action schema:**
```json
{
  "type": "table",
  "title": "Services",
  "columns": [...],
  "rows": [...],
  "actions": [
    {
      "id": "restart",
      "label": "Restart",
      "command": "systemctl restart {name}",
      "confirm": true,
      "variant": "default"
    }
  ]
}
```

**Safety:**
- Actions go through command allowlist validation (existing M5.1 infrastructure)
- Destructive actions require confirmation dialog
- Commands use `{placeholder}` substitution with proper shell escaping
- Actions not available in read-only mode

**Acceptance Criteria:**
- [ ] Action buttons render in table rows
- [ ] Click triggers command execution via SSH
- [ ] Confirmation dialog for dangerous actions
- [ ] Command allowlist validation applied
- [ ] Result feedback (toast: success/error)

---

## Dependency Graph

```
EX1.1 (Schema)
  ├── EX1.2 (Renderer + Widgets)
  │     ├── EX1.3 (AppWindow wrapper)
  │     ├── EX1.4 (Playground)
  │     └── EX1.5 (Extended widgets)
  │           └── EX1.6 (Layouts)
  │
  └── EX1.7 (Template Library)
        └── EX1.8 (Generator + Streaming) ← depends on EX1.1 + EX1.7
              ├── EX1.9 (Command Palette trigger)
              ├── EX1.10 (Caching)
              ├── EX1.11 (Terminal capture)
              ├── EX1.12 (Live refresh)
              ├── EX1.13 (Desktop tabs)
              └── EX1.14 (Actions)
```

## File Location Summary

| Location | Contents |
|----------|----------|
| `shared/schemas/dynamic-view.ts` | DynamicViewSchema (Zod) |
| `client/src/components/DynamicUI/` | Renderer, widgets, layouts, playground, AppWindow wrapper |
| `server/src/dynamic-ui/` | Generator service, template library, cache |
| `server/src/dynamic-ui/templates/` | JSON template files |
| `server/src/routes/dynamic-ui.ts` | REST + WebSocket endpoints |
| `server/tests/dynamic-ui/` | Generator, template, cache tests |
| `client/tests/components/DynamicUI/` | Renderer + widget component tests |

## Success Metrics

- **Time to first widget:** < 1 second (from LLM stream start to first widget visible)
- **Full view generation:** < 5 seconds for typical output
- **Template match rate:** > 60% of common tool outputs match a template
- **Cache hit rate:** > 70% for repeated views (same server, same tool)
- **Zero regressions:** Existing hardcoded views unaffected
