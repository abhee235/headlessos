# Phase EX3: Advanced UI Rendering & Generation

> **Milestone:** EX3 | **Est. Effort:** Large (3 sub-phases) | **Depends on:** EX1 (Dynamic UI Engine), EX2 (UI Agent)
>
> Transform the Dynamic UI from a single-shot "generate and display" system into a **progressive, multi-step, Grafana-quality rendering engine** where the LLM builds UI step-by-step, the user watches it assemble in real-time, and the output is indistinguishable from hand-crafted components.

---

## Appendix A: Grafana Scenes Architecture Research

> Deep analysis of `@grafana/scenes` (codebase in `temp/grafana-scenes/`). This informs our schema, layout, variable, and rendering design decisions.

### A.1 Core Object Model — SceneObject

Every Grafana UI element is a **SceneObject** — an immutable-state, ref-counted, tree-structured model object with a React component.

**`SceneObjectState`** — base state interface (5 fields):

| Field | Type | Purpose |
|-------|------|---------|
| `key` | `string?` | Unique ID (auto UUID if omitted) |
| `$timeRange` | `SceneTimeRangeLike?` | Local time range override |
| `$data` | `SceneDataProvider?` | Data source / query provider |
| `$variables` | `SceneVariables?` | Variable set scoped to this node |
| `$behaviors` | `Array<SceneObject \| SceneStatelessBehavior>?` | Extra behaviors activated with parent |

The `$`-prefixed properties are **composable service slots** — the framework auto-activates/deactivates them with the parent. This is the core composition mechanism: any node in the tree can override its parent's time range, data source, or variables.

**`SceneObject` interface** — 21 members total:
- State: `state` (frozen/immutable), `setState()` (creates new frozen object), `useState()` (React hook)
- Lifecycle: `activate()` (ref-counted), `addActivationHandler()`, `isActive`
- Tree: `parent?`, `getRoot()`, `forEachChild()`, `clearParent()`
- Events: `subscribeToState()`, `publishEvent(event, bubble?)` — events bubble UP the parent chain
- Rendering: `Component` (React component), `clone()`, `getRef()`

**Key insight — parent/child is automatic:** Any SceneObjectBase instance found in a state property is automatically set as a child (`child._parent = this`). Children are discovered by `forEachChild()` which scans 1 level deep in state values + arrays.

**State management:** State is `Object.freeze()`-ed. `setState()` creates a new frozen merged object and publishes a `SceneObjectStateChangedEvent` that **bubbles up** the parent chain.

### A.2 Layout System — 5 Layout Types

#### SceneFlexLayout (Flexbox)
- `display: flex` with configurable `flexDirection`, `gap: 8px`, `flexWrap`
- Items sized via `flexGrow` (fill) or `alignSelf: flex-start` (content)
- **12 placement properties**: direction, wrap, width, height, minWidth, minHeight, maxWidth, maxHeight, xSizing, ySizing, isHidden, md (responsive override)
- Responsive via `md` property + `theme.breakpoints.down('md')` media query
- **Infinitely nestable** — no depth enforcement. Common: column → row → panel (3 levels)
- No drag/drop

#### SceneGridLayout (Dashboard Grid — react-grid-layout)
- **24-column grid**, 30px row height, 8px margins
- Items positioned with `{ x, y, w, h }` (integer grid units)
- Uses `react-grid-layout` with **CSS transforms** (not CSS Grid)
- **Full drag/drop + resize** with custom handles
- `SceneGridRow` — collapsible row grouping (title, chevron, panel count when collapsed)
- Mobile: all items become full-width (24 cols) on < 768px
- **2-level nesting max**: Layout → Row → Item (grid items can contain any SceneObject body)
- `UNSAFE_fitPanels` — experimental feature to scale panels to viewport height

#### SceneCSSGridLayout (CSS Grid)
- Native `display: grid` with configurable templates
- Default: `repeat(auto-fit, minmax(400px, 1fr))` — auto-responsive columns
- Configures: `gridTemplateColumns`, `gridTemplateRows`, `gridAutoRows`, `rowGap`, `columnGap`, `justifyItems`, `alignItems`, `justifyContent`
- Items: `gridColumn` and `gridRow` for span control (e.g., `span 2`)
- Responsive via `md` property override
- Lazy loading via `IntersectionObserver`
- No drag/drop

#### SplitLayout (Two-Pane Splitter)
- Two panes with draggable splitter handle
- `direction: 'row' | 'column'` (horizontal or vertical)
- `initialSize: 0-1` ratio
- Keyboard accessible (Arrow keys, Enter to collapse/restore, Home/End)
- 32px default handle, pointer-based drag with pointer capture
- Each pane can contain any layout (nestable)

#### LazyLoader
- Shared `IntersectionObserver` singleton
- Wraps children, renders only when scrolled into view
- Used by both SceneGridLayout and SceneCSSGridLayout (`isLazy`)

**Layout comparison:**

| Feature | FlexLayout | GridLayout | CSSGridLayout | SplitLayout |
|---------|-----------|-----------|--------------|-------------|
| CSS mechanism | Flexbox | react-grid-layout (absolute pos) | CSS Grid | Flexbox |
| Column model | None | **24 columns**, 30px rows | Template-based | 2 panes |
| Drag/drop | No | **Yes** | No | Splitter only |
| Resize | No | **Yes** | No | Splitter only |
| Lazy load | No | Yes | Yes | No |
| Nestable | **Infinite** | 2 levels | **Infinite** (via body) | 2 panes, each nestable |
| Max observed depth | **3** (column → row → panel) | 2 (layout → row → item) | Via body property | — |

### A.3 VizPanel — The Widget Model (30 Properties)

`VizPanel` is Grafana's core visualization component. **VizPanelState has 25 own properties + 5 inherited = ~30 total.**

**User-facing properties (17):**

| # | Property | Type | Purpose |
|---|----------|------|---------|
| 1 | `pluginId` | `string` | Panel type: `'timeseries'`, `'stat'`, `'table'`, `'gauge'`, etc. |
| 2 | `title` | `string` | Panel title (supports variable interpolation `$var`) |
| 3 | `description` | `string?` | Markdown + variable interpolation |
| 4 | `options` | `DeepPartial<TOptions>` | Plugin-specific options (legend, tooltip, etc.) |
| 5 | `fieldConfig` | `FieldConfigSource` | Field config defaults + per-field overrides |
| 6 | `displayMode` | `'default' \| 'transparent'` | Panel chrome appearance |
| 7 | `hoverHeader` | `boolean?` | Only show header on hover |
| 8 | `subHeader` | `ReactNode \| SceneObject[]?` | Subheader content area |
| 9 | `showMenuAlways` | `boolean?` | Always show kebab menu |
| 10 | `menu` | `VizPanelMenu?` | Dropdown menu (lazy-activated) |
| 11 | `titleItems` | `ReactNode \| SceneObject[]?` | Items next to title |
| 12 | `seriesLimit` | `number?` | Max series to render |
| 13 | `headerActions` | `ReactNode \| SceneObject[]?` | Top-right header action buttons |
| 14 | `extendPanelContext` | `fn?` | Custom PanelContext modification |
| 15 | `collapsible` | `boolean?` | Enable collapse |
| 16 | `collapsed` | `boolean?` | Current collapsed state |
| 17 | `pluginVersion` | `string?` | For migration tracking |

**Panel rendering chrome (from VizPanelRenderer, 451 lines):**
Every panel is wrapped in `<PanelChrome>` providing: title bar, description, loading indicator, error/status message, drag handle, dropdown menu, header actions, title items, subheader, collapsible controls, hover header mode, cancel query button, display mode, padding.

**Rendering pipeline:**
1. Measure container → `useMeasure()` for width/height
2. Get data → subscribe to `sceneGraph.getData(model)`
3. Apply series limit → `useDataWithSeriesLimit()`
4. Apply field config → `model.applyFieldConfig()` with caching
5. Get time range + timezone from scene graph
6. Lazy loading check → `useLazyLoaderIsInView()`
7. Interpolate title with variables
8. Render `<PanelChrome>` → `<ErrorBoundaryAlert>` → `<PluginContextProvider>` → `<PanelContextProvider>` → `<PanelComponent>`

### A.4 PanelBuilder — Fluent API (30 Chainable Methods)

`VizPanelBuilder` provides a fluent builder pattern. **30 chainable methods + `build()`:**

| Category | Methods | Count |
|----------|---------|-------|
| Display | setTitle, setDescription, setDisplayMode, setHoverHeader, setCollapsible, setCollapsed | 6 |
| Chrome/UI | setShowMenuAlways, setMenu, setHeaderActions, setDisplayName | 4 |
| Standard Field Config | setColor, setDecimals, setDisplayName, setFilterable, setLinks, setMappings, setMax, setMin, setNoValue, setThresholds, setUnit | **11** |
| Plugin Config | setCustomFieldConfig, setOverrides | 2 |
| Panel Options | setOption | 1 |
| Data & Behavior | setData, setTimeRange, setVariables, setBehaviors | 4 |
| Limits | setSeriesLimit | 1 |
| Composition | applyMixin | 1 |
| **Total** | | **30** |

**11 Standard Field Config Properties:**

| Config | Type | Purpose |
|--------|------|---------|
| `color` | `FieldColor` | Color mode: fixed, palette, continuous gradient, thresholds-based |
| `decimals` | `number` | Decimal places for values |
| `displayName` | `string` | Override field name in visualizations |
| `filterable` | `boolean` | Support ad-hoc filtering |
| `links` | `DataLink[]` | Clickable data links with variable interpolation |
| `mappings` | `ValueMapping[]` | Value-to-display mappings (e.g., 0→"Off", 1→"On") |
| `max` | `number` | Maximum scale value |
| `min` | `number` | Minimum scale value |
| `noValue` | `string` | Text for null/missing values |
| `thresholds` | `ThresholdsConfig` | Threshold steps with colors (absolute or percentage mode) |
| `unit` | `string` | Unit system: 'bytes', 'percent', 'celsius', 'short', etc. |

**Field Config Overrides — 2-layer system:**
1. **Match** (7 methods): by field name, regex, type, query refId, value, comparison query
2. **Override** (12 methods): all 11 standard configs + custom plugin config

**21 Panel Type Factories:** barchart, bargauge, flamegraph, gauge, geomap, heatmap, histogram, logs, news, nodegraph, piechart, stat, statetimeline, statushistory, table, text, timeseries, trend, traces, xychart

### A.5 Variable System — 12 Variable Types, 19 Formats

**12 concrete variable implementations:**

| # | Type | Multi-value | Resolution | Key Properties |
|---|------|------------|------------|----------------|
| 1 | `ConstantVariable` | No | Static value (supports interpolation) | `value` |
| 2 | `CustomVariable` | Yes | CSV or JSON string → options | `query`, `valuesFormat` |
| 3 | `DataSourceVariable` | Yes | Lists data sources by plugin type | `pluginId`, `regex` |
| 4 | `IntervalVariable` | No | Time interval selection (auto-calc) | `intervals[]`, `autoEnabled`, `autoStepCount` |
| 5 | `LocalValueVariable` | No | Scoped override for repeaters | `value`, `text`, `properties` |
| 6 | `MultiValueVariable` | Yes (base) | Abstract — subclassed | `options[]`, `isMulti`, `includeAll`, `allValue`, `maxVisibleValues` |
| 7 | `ObjectVariable` | No | Typed object with field paths | `value: T extends object` |
| 8 | `SwitchVariable` | No | Boolean toggle | `enabledValue`, `disabledValue` |
| 9 | `TextBoxVariable` | No | User-entered text | `value` |
| 10 | `QueryVariable` | Yes | Data source query → options | `datasource`, `query`, `regex`, `refresh`, `sort`, `staticOptions` |
| 11 | `ScopesVariable` | No | From React ScopesContext | `scopes[]` |
| 12 | `AdHocFiltersVariable` | No (filter array) | Dynamic key-value filters | `filters[]`, `baseFilters[]`, ` datasource`, `applyMode`, operators: `=`,`!=`,`=\|`,`!=\|`,`=~`,`!~`,`<`,`>`,etc. |
| 13 | `GroupByVariable` | Yes (forced) | Dimension keys from data source | `defaultOptions`, `datasource`, `applyMode` |

**3 Interpolation Syntaxes:**
- `$varName` — simple dollar-sign
- `[[varName]]` or `[[varName:format]]` — double-bracket
- `${varName}`, `${varName:format}`, `${varName.fieldPath}`, `${varName.fieldPath:format}` — curly-brace (most powerful)

**19 Format Functions:**

| Format | Output Example | Purpose |
|--------|---------------|---------|
| `glob` (DEFAULT) | `{a,b,c}` | Glob expansion |
| `lucene` | `("a" OR "b")` | Lucene queries |
| `raw` | `a` | No transformation |
| `regex` | `(a\|b)` | Regex alternation |
| `pipe` | `a\|b` | Pipe-separated |
| `distributed` | `var=a,var=b` | Distributed copies |
| `csv` | `a,b,c` | Comma-separated |
| `html` | `&lt;tag&gt;` | HTML entity escaping |
| `json` | `"value"` | JSON-encoded |
| `percentencode` | `a%20b` | URL component encoding |
| `singlequote` | `'a','b'` | SQL-style single quotes |
| `doublequote` | `"a","b"` | Double-quoted |
| `sqlstring` | `'it''s'` | SQL-safe escaping |
| `join` | custom separator | Join with `:` arg |
| `date` | `2024-01-01` | Timestamp formatting |
| `text` | display labels | Uses `getValueText()` |
| `queryparam` | `var-foo=A&var-foo=B` | URL query params |
| `customqueryparam` | `p-foo=x-A` | Custom-prefixed params |
| `uriencode` | encoded URI | Full URI encoding |

**Variable chaining:** Variables reference each other via interpolation (`$server` in `query: 'cpu.$server.*'`). `SceneVariableSet` processes variables in dependency order — a variable won't update until its dependencies finish. The entire scene graph is notified recursively when variables change.

**7 Built-in System Macros:** `__from`, `__to`, `__timezone`, `__timeFilter`, `__interval`, `__interval_ms`, `__rate_interval`, `__org`, `__user`, `__dashboard`, `__data`, `__series`, `__field`, `__value`, `__url`, `__all_variables`

### A.6 Repeaters — Dynamic Panel Multiplication

**SceneByVariableRepeater:** Takes a `variableName` + `getLayoutChild(option)` factory. When the variable changes, it calls the factory for each value and **replaces all children** of its body layout. This is how Grafana creates one panel per host/service/region.

**SceneByFrameRepeater:** Same concept but driven by data frames instead of variables. Creates one panel per data series.

Both are layout-transparent — they wrap any layout type (FlexLayout, CSSGridLayout, etc.) and populate its children.

### A.7 Behaviors — Pluggable Capabilities

Behaviors are SceneObjects or functions stored in `$behaviors`. They activate/deactivate with their parent.

| Behavior | Purpose |
|----------|---------|
| **CursorSync** | Cross-panel cursor synchronization (shared EventBus, Crosshair or Tooltip mode) |
| **SceneQueryController** | Tracks running queries, exposes `isRunning`, supports `cancelAll()` |
| **ActWhenVariableChanged** | Runs callback when a specific variable changes |
| **LiveNowTimer** | Forces all VizPanels to re-render at 100ms intervals (live/streaming) |
| **SceneInteractionTracker** | Click-to-render timing for performance monitoring |

### A.8 Rendering Pipeline — SceneObject → React DOM

```
1. CONSTRUCTION: SceneObjectBase constructor → freeze state → generate UUID → set parent refs

2. REACT MOUNT (top-down):
   <sceneObject.Component model={obj}>
     → SceneComponentWrapper:
          a) useEffect → obj.activate()  [ref-counted]
               └─ Activates $timeRange, $variables, $data, $behaviors
          b) Gate: if !active && !renderBeforeActivation → null
          c) Reads static Component from class
          d) <Component model={obj}> — calls model.useState() for reactive state
               └─ Child objects: <child.Component model={child}> (recursive)

3. STATE FLOW (bottom-up re-renders):
   model.setState(update) → freeze → publish SceneObjectStateChangedEvent
     → useSceneObjectState subscription → React setState → re-render
     → Event bubbles up parent chain (UrlSync, UndoManager)

4. GRAPH QUERIES (any direction):
   getData(obj) → walks UP to nearest $data
   getVariables(obj) → walks UP to nearest $variables
   interpolate(obj, "${var}") → resolves via ancestor variable lookup
   findObject(root, predicate) → searches DOWN then UP

5. DEACTIVATION (bottom-up on unmount):
   useEffect cleanup → activate()'s returned cancel fn
     → refCount-- → if 0: deactivate all $-prefixed children + behaviors
```

**scenes-react package:** An alternative React-first API. Instead of building a SceneObject tree imperatively, you use `<SceneContextProvider>` + hooks (`useQueryRunner`, `useVariableValue`, `useTimeRange`) and declarative JSX components (`<VizPanel>`, `<VizGridLayout>`). Objects are cached via LRU (max 500, 5min TTL).

### A.9 Key Numbers Summary

| Metric | Grafana Scenes Value |
|--------|---------------------|
| Layout types | **5** (Flex, Grid24, CSSGrid, Split, LazyLoader) |
| VizPanel state properties | **30** (~17 user-facing) |
| PanelBuilder methods | **30** chainable + `build()` |
| Panel type factories | **21** |
| Standard field configs | **11** (color, decimals, unit, thresholds, mappings, etc.) |
| Variable types | **12** concrete implementations |
| Format functions | **19** |
| Interpolation syntaxes | **3** (`$var`, `[[var]]`, `${var}`) |
| System macros | **16+** |
| Override match methods | **7** |
| Override apply methods | **12** |
| Max observed nesting depth | **3** (no enforced limit) |
| Grid columns (dashboard) | **24** |
| Grid row height | 30px + 8px margin |
| Behaviors | **5** named patterns |

### A.10 Lessons for HeadlessOS

**What to adopt:**

1. **Nestable layouts with no hard limit** — Grafana enforces nothing. Their 3-level practical depth matches our recommendation. FlexLayout-in-FlexLayout is the most common pattern (column → row → panel).

2. **Rich panel properties** — A single Grafana panel has ~30 configurable properties. Our current 11 widget types with ~5-8 properties each are much simpler. We should expand per-widget configuration (especially for tables: column types, formatters, thresholds, color modes).

3. **11 Standard Field Configs** — color, decimals, unit, thresholds, mappings, min/max, noValue, links, filterable, displayName. Our widgets should adopt at minimum: **unit**, **thresholds**, **color mode**, **value mappings**, **decimal precision**.

4. **Variable system concepts** — template variables with interpolation, variable chaining, scoped variable sets. Our LayoutPattern variables (EX3-A.2) should support basic interpolation (`$title`, `$metric_count`) resolved at generation time.

5. **Repeater pattern** — creating panels dynamically from variable values or data frames. Useful for "one panel per container" or "one row per service" patterns.

6. **Panel chrome** — every panel gets consistent chrome: title bar, description, menu, actions, collapsible, loading state. Our widgets should get similar wrapper chrome from the renderer (not from the LLM's schema).

7. **Layout-specific sizing** — FlexLayout items have 12 sizing properties. CSSGrid items have span control. Grid items have x/y/w/h. Each layout type should have its own item placement config.

8. **Lazy loading** — IntersectionObserver-based lazy rendering for large dashboards. Important for generated views with many widgets.

**What NOT to adopt:**

1. **SceneObject model layer** — Grafana's imperative SceneObject graph adds complexity we don't need. Our JSON schema → React renderer approach is simpler and sufficient.

2. **24-column dashboard grid** — Overkill for generated UIs. Our grid-2, grid-3, grid-4, grid-6 system is more LLM-friendly. The LLM shouldn't think in x/y/w/h coordinates.

3. **Plugin system** — Grafana supports 21+ panel types via plugins with custom options per type. Our fixed 11 widget types are enough; the LLM can compose them flexibly.

4. **Data source abstraction** — Grafana decouples queries from visualization via DataSourceVariable and SceneQueryRunner. We get data via SSH commands — no need for a provider abstraction.

5. **Full variable resolution at render time** — Grafana resolves variables when panels render (runtime). Our variables should resolve at generation time (LLM fills them).

6. **Event bubbling / sceneGraph utilities** — Our flat JSON → React rendering doesn't need parent-chain walking or event propagation.

---

## Vision

**Current state:** The UI Agent generates a complete JSON schema in one shot, validates it, then opens a bare window with the rendered result. It works, but feels mechanical — the user waits, then sees everything at once.

**Target state:** Generation feels like watching an expert designer work in real-time:
1. Window opens immediately with a layout skeleton
2. Sections/tabs appear as the LLM decides the structure
3. Widgets fade in one-by-one as data is gathered
4. The result matches our design system exactly — same fonts, colors, spacing, badges as ServerAdmin/Dashboard
5. A FakeLLM generator produces deterministic outputs for testing, comparison, and demos

### Sub-Phases

| Sub-Phase | Focus | Summary |
|-----------|-------|---------|
| **EX3-P** | **Widget Primitives** | **Tab count badges, mono/rich columns, table filters, dropdown actions, card-list widget — enough to replicate NetworkSection** |
| **EX3-A** | Schema & Prompt | Nestable layouts, layout templates (Grafana-style variables), design system rules in prompt, FakeLLM generator |
| **EX3-B** | Multi-Step Generation | New executor tools (`set_layout`, `add_widgets`, etc.), `layout_update` events, progressive streaming pipeline |
| **EX3-C** | Unified Window & Polish | Design-system-native window (sidebar + tabs + toolbar), widget entrance animations, skeleton states, contextual controls |

> **Gate:** EX3-P must be complete before EX3-A. The NetworkSection must be 100% replicable in the Playground using only DynamicView JSON before advancing.

---

## Sub-Phase EX3-P: Widget Primitives & Replication Test

> Build the missing widget primitives needed to fully replicate the hand-crafted ServerAdmin NetworkSection as a DynamicView JSON in the Playground. Nothing is hardcoded — every element comes from the schema.

### Validation Target

The ServerAdmin `NetworkSection.tsx` (658 lines) renders:
- **Header**: icon + title + hostname badge + edit button + refresh
- **5 tabs** with count badges: Listening Ports (3), Connections (1), Interfaces (2), Routes, DNS
- **Ports tab**: filter bar (4 dropdowns + search) → rich table (Proto badge, Address mono, Port bold+dot, Process compound cell with lock icon + badge + tag + PUBLIC indicator) → dropdown action menu on hover
- **Connections tab**: table (Proto badge, Local/Remote mono, State badge, Process text)
- **Interfaces tab**: card list (icon + name mono + UP/DOWN badge with dot + MAC/MTU details + Enable/Disable action)
- **Routes tab**: table (Destination/Gateway mono, Interface badge, Metric number)
- **DNS tab**: badge grids (nameservers, search domains) + edit form

### What Works Today (no changes needed)

- Tab layout with 5 tabs ✅
- Badge columns in tables (Proto, State, Interface) ✅
- Code columns for monospace with background ✅
- Badge-grid for DNS nameservers ✅
- Form widget for DNS editing ✅
- Table row actions (buttons) ✅

### What Must Be Added (7 gaps → 6 tasks)

---

### EX3-P.1: Tab Count Badges

**Gap:** Tabs show "Listening Ports **3**" with an inline count badge. Schema has no `count` field.

**Schema change** (`shared/schemas/dynamic-view.ts`):
```typescript
// TabsLayoutSchema.tabs[] — add count field
{
  id: z.string(),
  label: z.string(),
  icon: z.string().nullable().optional(),
  count: z.number().nullable().optional(),  // ← NEW: count badge next to label
  widgets: z.array(WidgetSchema),
}
```

**Renderer change** (`TabsLayout.tsx`):
```tsx
<TabsTrigger ...>
  {tab.label}
  {tab.count != null && (
    <Badge variant="secondary" className="ml-1.5 px-1.5 text-muted-foreground">
      {tab.count}
    </Badge>
  )}
</TabsTrigger>
```

**Acceptance:**
- [ ] `count` field in `TabsLayoutSchema` tabs array items
- [ ] TabsLayout renders count badge when present
- [ ] Existing tabs without count render unchanged
- [ ] Playground example shows tab counts

---

### EX3-P.2: Monospace Column Type

**Gap:** Address, port, IP columns need plain monospace text (no background). `code` type adds `<code>` with gray background. `text` is plain sans-serif.

**Schema change**: Add `'mono'` to table column type enum:
```typescript
type: z.enum(['text', 'number', 'badge', 'date', 'bytes', 'percent', 'code', 'mono'])
```

**Renderer change** (`TableWidget.tsx` → `renderCellValue`):
```typescript
case 'mono':
  return <span className="font-mono text-sm">{str}</span>;
```

**Acceptance:**
- [ ] `mono` column type in schema enum
- [ ] Renders as monospace text without background
- [ ] Playground example uses mono for addresses/ports

---

### EX3-P.3: Rich Compound Table Cells

**Gap:** The Process column renders multiple inline elements: lock icon → process badge → "Running"/"DNS" tag → "PUBLIC" shield indicator. Current schema: one value per cell.

**Schema change**: Add `'rich'` column type with per-cell segment definitions as a table-level config:
```typescript
// New: RichCellSegment schema
const RichCellSegmentSchema = z.discriminatedUnion('segment', [
  z.object({
    segment: z.literal('text'),
    key: z.string(),              // row field key
    className: z.string().nullable().optional(),
  }),
  z.object({
    segment: z.literal('badge'),
    key: z.string(),
    variant: BadgeVariantEnum.default('default'),
    badgeVariant: z.record(z.string(), BadgeVariantEnum).nullable().optional(),
  }),
  z.object({
    segment: z.literal('icon'),
    icon: z.string(),             // Lucide icon name
    key: z.string().nullable().optional(),  // row field key — show icon when truthy
    className: z.string().nullable().optional(),
  }),
  z.object({
    segment: z.literal('dot'),
    key: z.string(),              // row field key — show dot when truthy
    color: z.string().default('amber'), // tailwind color name
  }),
]);

// Table column schema: add 'rich' type + segments
{
  key: z.string(),
  label: z.string(),
  type: z.enum([..., 'rich']),
  segments: z.array(RichCellSegmentSchema).nullable().optional(),
}
```

**Renderer change**: New `RichCell` component in `TableWidget.tsx`:
```tsx
function RichCell({ segments, row }: { segments: RichCellSegment[]; row: Record<string, unknown> }) {
  return (
    <div className="flex items-center gap-2">
      {segments.map((seg, i) => {
        switch (seg.segment) {
          case 'text': return <span key={i} className={seg.className ?? ''}>{row[seg.key] ?? ''}</span>;
          case 'badge': {
            const val = String(row[seg.key] ?? '');
            const variant = seg.badgeVariant?.[val] ?? seg.variant;
            return val ? <Badge key={i} variant={variant}>{val}</Badge> : null;
          }
          case 'icon': {
            if (seg.key && !row[seg.key]) return null;
            const Icon = getLucideIcon(seg.icon);
            return Icon ? <Icon key={i} size={12} className={seg.className ?? 'text-foreground/30'} /> : null;
          }
          case 'dot': {
            if (!row[seg.key]) return null;
            return <span key={i} className={`inline-block w-2 h-2 rounded-full bg-${seg.color}-400`} />;
          }
        }
      })}
    </div>
  );
}
```

**Acceptance:**
- [ ] `RichCellSegmentSchema` with 4 segment types (text, badge, icon, dot)
- [ ] `rich` column type in enum + `segments` field on column
- [ ] RichCell renders multiple inline elements from row data
- [ ] Playground example reproduces the Process column from NetworkSection

---

### EX3-P.4: Table Filters & Search

**Gap:** Ports tab has a filter bar with 4 dropdown menus + search input above the table.

**Schema change**: Add `filters` to `TableWidgetSchema`:
```typescript
TableWidgetSchema = z.object({
  ...existing,
  filters: z.object({
    search: z.boolean().default(false),
    searchPlaceholder: z.string().nullable().optional(),
    dropdowns: z.array(z.object({
      key: z.string(),            // column key to filter on
      label: z.string(),          // display label (e.g. "All Protocols")
      options: z.array(z.object({
        label: z.string(),
        value: z.string(),
      })),
      icon: z.string().nullable().optional(),
    })).default([]),
  }).nullable().optional(),
});
```

**Renderer change** (`TableWidget.tsx`): Render filter bar above the table when `filters` is present. Apply client-side filtering to rows.

**Acceptance:**
- [ ] `filters` field in `TableWidgetSchema`
- [ ] Search input filters rows across all columns
- [ ] Dropdown filters narrow rows by specific column value
- [ ] Filter bar matches NetworkSection styling (outline buttons, search with icon)
- [ ] Playground example shows ports tab with working filters

---

### EX3-P.5: Dropdown Action Menu

**Gap:** Ports table has a `⋯` menu that shows on hover, opening a dropdown with Inspect/Kill/Block/View Logs. Current actions render as always-visible buttons.

**Schema change**: Add `actionStyle` and `icon` to table:
```typescript
TableWidgetSchema = z.object({
  ...existing,
  actionStyle: z.enum(['buttons', 'dropdown']).default('buttons'),
  // WidgetActionSchema already has `icon` field ✅
});
```

**Renderer change** (`TableWidget.tsx`): When `actionStyle='dropdown'`, render a `⋯` button that opens a `DropdownMenu` with the actions as menu items (with icons).

**Acceptance:**
- [ ] `actionStyle` field in `TableWidgetSchema`
- [ ] `'dropdown'` style renders `⋯` button on hover → DropdownMenu
- [ ] Icons appear in dropdown menu items
- [ ] `'buttons'` (default) behavior unchanged

---

### EX3-P.6: Card List Widget

**Gap:** Interfaces tab renders cards (icon + name + state badge + details + action), not a table.

**Schema change**: New widget type `card-list`:
```typescript
export const CardListWidgetSchema = z.object({
  type: z.literal('card-list'),
  title: z.string().nullable().optional(),
  items: z.array(z.object({
    icon: z.string().nullable().optional(),         // Lucide icon name
    title: z.string(),                               // Primary label (mono bold)
    subtitle: z.string().nullable().optional(),       // Secondary text
    badge: z.object({
      label: z.string(),
      variant: BadgeVariantEnum.default('default'),
      dot: z.boolean().default(false),               // colored dot before label
    }).nullable().optional(),
    details: z.array(z.object({
      label: z.string(),
      value: z.string(),
    })).nullable().optional(),
  })),
  actions: z.array(WidgetActionSchema).nullable().optional(),
  dataSource: DataSourceSchema.nullable().optional(),
});
```

**Renderer**: New `CardListWidget.tsx` — renders each item as a horizontal card row matching the Interfaces tab design.

**Acceptance:**
- [ ] `CardListWidgetSchema` added to schema + WidgetSchema union
- [ ] `card-list` type in WIDGET_TYPES const
- [ ] `CardListWidget` renderer registered
- [ ] Each card: icon + mono bold title + badge (with optional dot) + detail pairs + action buttons
- [ ] Playground example replicates the Interfaces tab

---

### EX3-P.7: NetworkSection Playground Example

**Gate task.** Create a complete playground example that replicates the full NetworkSection using only DynamicView JSON. All 5 tabs must render with visual parity to the hand-crafted component.

**Acceptance:**
- [ ] New playground example "Network Section" in `playground-examples.ts`
- [ ] Listening Ports tab: filter bar + table with Proto badge, Address mono, Port mono+dot, Process rich cell, dropdown actions
- [ ] Connections tab: table with Badge/mono/badge/text columns
- [ ] Interfaces tab: card-list with icon, name, state badge+dot, MAC/MTU details
- [ ] Routes tab: table with mono/mono/badge/number columns
- [ ] DNS tab: badge-grid + badge-grid + form
- [ ] Visual comparison with real NetworkSection — close enough that the pattern is unmistakable

---

## Sub-Phase EX3-A: Schema, Prompts & Templates

> Nestable layouts, Grafana-inspired template variables, comprehensive design rules in the LLM prompt, FakeLLM test generator.

---

### EX3-A.1: Nestable Layouts

**Problem:** Layouts can only contain widgets — no layout-in-layout. This prevents the ServerAdmin pattern (tabs → stack of widgets per tab, with stat-cards outside tabs).

**Solution:** Create a `LayoutOrWidget` discriminated union that layouts accept as children.

#### Schema Changes (`shared/schemas/dynamic-view.ts`)

```typescript
// Before: widgets only
StackLayoutSchema = z.object({
  layout: z.literal('stack'),
  gap: z.enum(['sm', 'md', 'lg']),
  widgets: z.array(WidgetSchema),
});

// After: widgets OR nested layouts
const LayoutOrWidgetSchema = z.lazy(() =>
  z.discriminatedUnion('_kind', [
    WidgetSchema.extend({ _kind: z.literal('widget').default('widget') }),
    LayoutSchema.extend({ _kind: z.literal('layout').default('layout') }),
  ])
);

StackLayoutSchema = z.object({
  layout: z.literal('stack'),
  gap: z.enum(['sm', 'md', 'lg']),
  children: z.array(LayoutOrWidgetSchema),  // replaces `widgets`
});
```

> **Decision needed:** Using `_kind` discriminator vs inferring from presence of `layout` vs `type` field. The `_kind` approach is explicit but adds a field. Alternative: detect by checking if object has `layout` (→ nested layout) or `type` (→ widget). This avoids the extra field and is more natural for LLM generation. **Recommend:** Infer from `layout` vs `type` presence — no `_kind` needed.

#### Renderer Changes

- `LayoutRenderer` — when a child has `layout` property, recurse into `LayoutRenderer`. When it has `type`, render via `WidgetRenderer`.
- Max nesting depth: 3 levels (root → nested → nested). Deeper nesting shows an error alert.
- Backward compatibility: keep `widgets` field as an alias that auto-wraps each widget item. Migration path: `widgets` → deprecated, `children` → canonical.

#### Acceptance Criteria

- [ ] `LayoutOrWidgetSchema` supports both widgets and nested layouts
- [ ] `StackLayout`, `GridLayout`, `TabsLayout`, `SidebarLayout` all accept nested layouts
- [ ] `LayoutRenderer` recursively renders nested layouts up to depth 3
- [ ] Backward compat: existing `widgets` field still works (auto-wrapped)
- [ ] Tests: nested tabs-in-stack, grid-in-tabs, stack-in-sidebar
- [ ] All existing 1,459+ tests pass (no regressions)

---

### EX3-A.2: Layout Template Patterns (Grafana-Inspired)

**Inspiration:** Grafana's `dashboard.json` doesn't just store final visualization — it stores **template variables** (`$host`, `$interval`, `$datasource`), **panel positioning** (`gridPos: {x, y, w, h}`), **data source references**, and **threshold rules**. Each panel declares what data it needs, how to query it, and how to render.

We adapt this into **Layout Patterns** — named, reusable structural blueprints that the LLM selects and populates.

#### Pattern Structure

```typescript
interface LayoutPattern {
  id: string;                          // e.g. 'overview-dashboard'
  name: string;                        // Human-readable name
  description: string;                 // When to use this pattern
  
  // Grafana-inspired: template variables the LLM must fill
  variables: LayoutVariable[];
  
  // The skeleton structure (with variable placeholders)
  skeleton: DeepPartial<DynamicView>;
  
  // Rules for the LLM on how to populate
  populationRules: string[];
  
  // Which widget types work well with this pattern
  recommendedWidgets: string[];
  
  // Example: a fully populated instance
  example: DynamicView;
}

interface LayoutVariable {
  name: string;                        // e.g. '$title', '$tab_count'
  type: 'string' | 'number' | 'enum' | 'widget[]' | 'data[]';
  description: string;                 // What this variable represents
  required: boolean;
  default?: unknown;
  
  // Grafana-style: how to derive the value
  source?: 'user_prompt' | 'server_context' | 'command_output' | 'llm_decision';
  
  // Enum constraints
  options?: string[];
}
```

#### 10 Built-In Layout Patterns

| # | Pattern ID | Structure | When to Use | Variables |
|---|-----------|-----------|-------------|-----------|
| 1 | `overview-dashboard` | stat-cards (grid-4) → tabs (one data type per tab, each tab = stack of chart + table) | General "show me everything about X" | `$title`, `$metric_count: 3-6`, `$tab_definitions: [{label, dataCommand, widgetType}]` |
| 2 | `single-table` | key-value summary → optional alert → full table with row actions | "List all X", "Show X table" | `$title`, `$summary_pairs`, `$columns`, `$dataCommand`, `$actions[]` |
| 3 | `multi-table` | stat-cards row → tabs (one table per tab) | "Show X and Y and Z" (multiple data sets) | `$title`, `$tables: [{label, columns, dataCommand}]`, `$summary_stats[]` |
| 4 | `config-viewer` | key-value metadata → code-block (config content) → optional alert (issues) | "Show nginx config", "Show X configuration" | `$title`, `$metadata_pairs`, `$filePath`, `$language`, `$validation_command?` |
| 5 | `service-status` | badge-grid (service states) → table (details) → log-viewer (recent logs) | "Show status of X service" | `$title`, `$services[]`, `$logCommand`, `$logLines: 50` |
| 6 | `monitoring` | stat-cards (grid-3) → charts (grid-2, time series) → table (event/process list) | "Monitor X", "Show performance" | `$title`, `$metrics[]`, `$chartDataCommands[]`, `$refreshInterval: 30000` |
| 7 | `security-audit` | alert (critical summary) → stat-cards (metrics) → tabs (findings by category) | "Security scan", "Audit X" | `$title`, `$severity_summary`, `$categories: [{label, findings}]` |
| 8 | `comparison` | tabs (one per item) → within each tab: key-value + progress bars | "Compare X vs Y", "Show all X instances" | `$title`, `$items: [{label, properties}]` |
| 9 | `log-analysis` | stat-cards (summary stats) → log-viewer (main log) → chart (frequency) | "Show logs for X", "Analyze X log" | `$title`, `$logPath`, `$timeRange`, `$filterPatterns[]` |
| 10 | `tree-explorer` | key-value (metadata) → tree (hierarchy) → code-block (detail of selected) | "Show directory tree", "Show X hierarchy" | `$title`, `$rootPath`, `$maxDepth: 3` |

#### Population Rules (Grafana-Inspired)

Like Grafana's threshold rules and value mappings, each pattern includes rules:

```
overview-dashboard rules:
- Stat cards: exactly $metric_count cards in a grid-{$metric_count} (max 4 per row)
- Each stat card: value from command output, trend based on threshold
- Tabs: one per data category, label includes count badge
- Within each tab: chart (if time-series data) above table (always)
- Tables: max 8 columns, most important columns first
- Color thresholds: success < 70%, warning 70-90%, destructive > 90%

single-table rules:
- Summary: 3-6 key-value pairs, grid-3 layout
- Table: sortable columns, font-mono for IDs/paths/IPs
- Row actions: only if interactivityLevel !== 'display-only'
- If > 100 rows: add footer with total count

config-viewer rules:
- Metadata: file path, last modified, size, permissions
- Code block: full config content, correct language detection
- Alert variant: destructive if validation fails, success if passes, omit if no validation
```

#### Acceptance Criteria

- [ ] `LayoutPattern` type defined in `server/src/dynamic-ui/types.ts`
- [ ] 10 layout patterns implemented in `server/src/dynamic-ui/patterns/`
- [ ] Each pattern has: variables, skeleton, population rules, example
- [ ] Planner suggests `layoutPattern` in hints (new field)
- [ ] Executor prompt references the selected layout pattern
- [ ] Tests: pattern selection for various prompts
- [ ] `search_templates` tool also searches patterns

---

### EX3-A.3: Design System Rules in Executor Prompt

**Problem:** The LLM generates UI that "works" but doesn't match our design system. It uses default colors, inconsistent spacing, and doesn't follow the patterns in ServerAdmin/Dashboard.

**Solution:** Inject comprehensive design system rules directly into the executor prompt so every generated view looks native.

#### Design System Prompt Section

Added to `buildExecutorSystemPrompt()`:

```markdown
## Design System (MANDATORY — your output must match these exactly)

### Typography
- Section titles: text-xl font-bold text-foreground
- Card titles: text-sm font-medium text-card-foreground  
- Table headers: text-xs font-medium text-foreground/40
- Table data (primary): font-medium
- Table data (secondary): text-xs text-foreground/50
- Table data (monospace — IPs, paths, hashes, ports): font-mono text-xs text-foreground/70
- Stat card values: text-2xl font-bold
- Stat card labels: text-xs text-foreground/40
- Badge text: text-[11px] font-semibold

### Color Semantics (NEVER use raw colors)
- Running / Active / Up / Enabled / Pass: variant="success" (emerald)
- Stopped / Down / Disabled / Fail: variant="destructive" (red)  
- Warning / Degraded / Expiring: variant="warning" (amber)
- Unknown / Neutral / N/A: variant="secondary" (gray)
- Info / Default: variant="default" (blue)

### Status Badges
- Service status: badge-grid with semantic variants
- Boolean states: use success/destructive ("Yes"→success, "No"→destructive)
- Counts: always include in tab labels and section headers

### Value Formatting
- Bytes: human-readable (KB, MB, GB) — use column type="bytes"
- Percentages: progress-bar for visual, number for inline — use column type="percent"
- Dates: relative ("2 hours ago") in tables, full in tooltips — use column type="date"
- IPs/ports/paths: always font-mono (already handled by column type="code")

### Layout Rules
- Stats/summary: ALWAYS at the top, NEVER inside tabs
- Multiple data tables: one per tab, NEVER stacked
- Related chart + table: same tab (chart above, table below)
- Config/code: code-block with key-value metadata above
- Alerts/warnings: above main content, not inside tabs
- Max 3 widgets stacked without grouping into tabs
- Tables: max 8 columns (most important first), always sortable
- Grid columns: stat-cards use grid matching count (3 stats → grid-3, 4 → grid-4)

### Threshold Conventions
- Disk/memory/CPU usage: success < 70%, warning 70-90%, destructive ≥ 90%
- Service uptime: success ≥ 99.9%, warning ≥ 99%, destructive < 99%
- Count-based: contextual (0 errors → success, >0 → destructive)

### Common Patterns (copy these exactly)
- Key-value metadata section: key-value widget, layout="grid-3"
- Status overview: badge-grid with one badge per item
- Data table with actions: table with row actions, confirm=true for destructive
- Progress tracking: progress-bar with label "X / Y (Z%)"
```

#### Acceptance Criteria

- [ ] Design system rules section added to `buildExecutorSystemPrompt()`
- [ ] Rules reference exact CSS class patterns from ServerAdmin/Dashboard
- [ ] Layout pattern rules integrated (selected pattern's `populationRules` included)
- [ ] Tests: prompt contains design system section
- [ ] Before/after comparison: same prompt produces more native-looking output

---

### EX3-A.4: FakeLLM Generator

**Problem:** Testing the full generation pipeline requires real LLM calls (slow, expensive, non-deterministic). We need a deterministic alternative for:
1. Unit/integration tests
2. Comparing FakeLLM output vs real LLM output
3. Demos and development without API keys
4. Regression testing — if a schema change breaks rendering, FakeLLM catches it

**Solution:** A `FakeLLMGenerator` that produces the same tool-calling sequence as the real executor, but deterministically from fixtures.

#### Architecture

```
FakeLLMGenerator
├── fixtures/                           # Deterministic response sequences
│   ├── network-ports.fixture.json      # Step-by-step tool calls + responses
│   ├── system-overview.fixture.json
│   ├── docker-status.fixture.json
│   └── ...
├── fake-llm-provider.ts                # Implements LLMProvider interface
├── fake-executor.ts                    # Replays fixture sequences
├── fixture-recorder.ts                 # Records real LLM sessions into fixtures
└── comparator.ts                       # Compares fake vs real output
```

#### Fixture Format

Each fixture is a recorded session — the sequence of tool calls and responses:

```typescript
interface LLMFixture {
  id: string;                           // e.g. 'network-ports'
  prompt: string;                       // The user's original prompt
  plannerHints: PlannerHints;           // What the planner produced
  
  // Multi-step: each step is one executor iteration
  steps: FixtureStep[];
  
  // Final validated output
  finalSchema: DynamicView;
  
  // Metadata for comparison
  meta: {
    recordedAt: string;
    model: string;
    totalTokens: number;
    latencyMs: number;
  };
}

interface FixtureStep {
  stepNumber: number;
  
  // What the LLM decided to do
  toolCalls: {
    tool: string;                       // e.g. 'exec_command', 'set_layout'
    args: Record<string, unknown>;
  }[];
  
  // What the tool returned
  toolResults: {
    tool: string;
    success: boolean;
    output: string;
  }[];
  
  // The partial view state after this step (for progressive rendering)
  partialView?: DeepPartial<DynamicView>;
  
  // Event that would be emitted
  event?: UIAgentEvent;
}
```

#### Fixture Recorder

Records real LLM sessions into fixture files for replay:

```typescript
class FixtureRecorder {
  // Wrap a real executor, intercept all tool calls/results
  wrapExecutor(executor: ReactiveExecutor): ReactiveExecutor;
  
  // Save the recorded session
  saveFixture(id: string, path: string): void;
  
  // Load and replay
  static loadFixture(path: string): LLMFixture;
}
```

#### FakeLLM Provider

Implements the `LLMProvider` interface so it slots into the existing pipeline:

```typescript
class FakeLLMProvider implements LLMProvider {
  constructor(fixture: LLMFixture);
  
  // Returns the next tool call from the fixture sequence
  async chat(messages): Promise<LLMResponse>;
  
  // Returns the corresponding tool result
  async structured(messages, schema): Promise<StructuredResponse>;
}
```

#### Comparator

Compares FakeLLM deterministic output vs real LLM output:

```typescript
class SchemaComparator {
  // Deep comparison with semantic understanding
  compare(expected: DynamicView, actual: DynamicView): ComparisonResult;
  
  // Structural comparison (layout shape, widget count, types)
  compareStructure(a: DynamicView, b: DynamicView): StructureDiff;
  
  // Data comparison (values, row counts, formatting)
  compareData(a: DynamicView, b: DynamicView): DataDiff;
}

interface ComparisonResult {
  structureMatch: boolean;              // Same layout type, widget count
  dataMatch: boolean;                   // Same values
  styleMatch: boolean;                  // Same variants, formatting
  diffs: Diff[];                        // List of differences
  score: number;                        // 0-100 similarity
}
```

#### Usage in Tests

```typescript
describe('UI generation', () => {
  it('network-ports matches fixture', async () => {
    const fixture = FakeLLMGenerator.loadFixture('network-ports');
    const fakeProvider = new FakeLLMProvider(fixture);
    
    const agent = new UIAgent({ llmProvider: fakeProvider, ... });
    const events = [];
    for await (const event of agent.generate('Show network ports', serverId)) {
      events.push(event);
    }
    
    const result = events.find(e => e.type === 'complete');
    const comparison = new SchemaComparator().compare(fixture.finalSchema, result.view);
    expect(comparison.structureMatch).toBe(true);
    expect(comparison.score).toBeGreaterThan(90);
  });
});
```

#### Acceptance Criteria

- [ ] `FakeLLMProvider` implements `LLMProvider` interface
- [ ] `FakeLLMGenerator` replays fixture step sequences
- [ ] `FixtureRecorder` records real LLM sessions into fixtures
- [ ] `SchemaComparator` compares structure + data + style
- [ ] At least 5 fixture files covering different layout patterns
- [ ] Tests use FakeLLM for deterministic generation testing
- [ ] `npm run record-fixture -- --prompt "Show network ports"` CLI to record new fixtures
- [ ] Comparison report: `npm run compare-fixtures` shows fake vs real diff

---

## Sub-Phase EX3-B: Multi-Step Progressive Generation

> New executor tools for step-by-step UI construction, `layout_update` events, progressive streaming from backend to frontend.

---

### EX3-B.1: Working View & Layout Mutation Tools

**Problem:** Currently the executor generates the entire schema in one `generate_schema()` call. The user sees nothing until it's done.

**Solution:** The executor maintains a `WorkingView` (mutable in-memory view) and exposes tools that mutate it step-by-step. Each mutation emits a `layout_update` event → the frontend renders it immediately.

#### New Executor Tools

| Tool | Args | Effect | Event Emitted |
|------|------|--------|---------------|
| `set_layout` | `{ layout, title, description, icon }` | Sets root layout type + top-level structure (e.g., tabs with labels) | `layout_update` with skeleton |
| `add_section` | `{ sectionId, label, icon? }` | Adds a tab/sidebar-section to the root layout | `layout_update` with new section |
| `add_widgets` | `{ sectionId?, widgets[] }` | Adds widgets to a section (or root if no sections) | `layout_update` with new widgets |
| `update_widget` | `{ widgetId, patch }` | Patches a widget's data (e.g., fills table rows after fetching) | `layout_update` with updated widget |
| `remove_widget` | `{ widgetId }` | Removes a widget the LLM decided isn't needed | `layout_update` with removal |
| `remove_section` | `{ sectionId }` | Removes an entire section | `layout_update` with removal |
| `generate_schema` | (unchanged) | Submits final schema for Zod validation — terminal tool | `generation_complete` |

#### Working View

```typescript
class WorkingView {
  private view: DeepPartial<DynamicView>;
  private widgetCounter: number = 0;
  
  setLayout(layout: string, title: string, description?: string, icon?: string): void;
  addSection(sectionId: string, label: string, icon?: string): void;
  addWidgets(sectionId: string | null, widgets: Widget[]): string[];  // returns widget IDs
  updateWidget(widgetId: string, patch: Partial<Widget>): void;
  removeWidget(widgetId: string): void;
  removeSection(sectionId: string): void;
  
  getSnapshot(): DeepPartial<DynamicView>;    // current state for rendering
  toFinalSchema(): string;                     // JSON string for generate_schema
}
```

#### Executor Changes

The executor loop now:
1. Calls `get_server_context()` → understands the server
2. Calls `set_layout()` → user sees the skeleton window
3. Loops: `exec_command()` → `add_widgets()` → user sees widgets appear
4. Optionally: `update_widget()` / `remove_widget()` to adjust
5. Calls `generate_schema()` → final Zod validation

Each layout mutation tool returns success + yields a `layout_update` event.

#### Acceptance Criteria

- [ ] `WorkingView` class with all mutation methods
- [ ] 6 new tools registered in tool registry
- [ ] Executor maintains WorkingView, emits `layout_update` after each mutation
- [ ] `generate_schema` can optionally use `workingView.toFinalSchema()` as starting point
- [ ] Tools validate inputs (e.g., `sectionId` must exist)
- [ ] Tests: build a view step-by-step through tool calls
- [ ] FakeLLM fixtures updated with multi-step tool sequences

---

### EX3-B.2: `layout_update` Event Pipeline

**Problem:** The event pipeline only supports events AFTER generation completes. No incremental rendering events exist.

**Solution:** Add `layout_update` as a new event type flowing through the entire pipeline.

#### Backend Changes

```typescript
// New event type
type UIAgentEvent = 
  | ... existing events ...
  | { type: 'layout_update'; view: DeepPartial<DynamicView>; step: number }

// In executor.ts — after each layout tool call:
yield { type: 'layout_update', view: workingView.getSnapshot(), step: stepCount };

// In ui-agent.ts — forward from executor:
case 'layout_update':
  yield event;  // pass through to WebSocket

// In agent-ui.ts (WebSocket route) — forward to client:
case 'layout_update':
  socket.send(JSON.stringify({ type: 'layout_update', requestId, ...event }));
```

#### Frontend Changes

```typescript
// In useUIAgent.ts — handle new event:
case 'layout_update':
  storeRef.current.updatePartialView(requestId, msg.view, msg.step);
  storeRef.current.addEvent(requestId, {
    type: 'layout_update',
    message: `Layout updated (step ${msg.step})`,
    ...
  });
  break;

// In agent-store.ts — new fields on AgentSession:
interface AgentSession {
  ...existing fields...
  partialView: DeepPartial<DynamicView> | null;   // current progressive state
  layoutStep: number;                               // how many layout updates received
}
```

#### Acceptance Criteria

- [ ] `layout_update` event type defined in UIAgentEvent union
- [ ] Executor yields `layout_update` after each layout tool call
- [ ] UIAgent forwards `layout_update` to WebSocket
- [ ] WebSocket route sends `layout_update` to client
- [ ] `useUIAgent` hook handles `layout_update`, updates `partialView`
- [ ] `agent-store` has `partialView` and `layoutStep` fields
- [ ] Tests: event pipeline integration (executor → agent → route → hook → store)

---

### EX3-B.3: Early Window Opening & Streaming Bridge

**Problem:** The dynamic UI window opens only on `complete`. With progressive generation, it should open on the first `layout_update`.

**Solution:** Open the window early and keep it subscribed to the streaming session.

#### Streaming View Store

```typescript
// New: streaming-view-store.ts
interface StreamingViewState {
  // Active streams: requestId → current partial view
  streams: Map<string, {
    serverId: string;
    partialView: DeepPartial<DynamicView>;
    step: number;
    status: 'streaming' | 'complete' | 'error';
    windowId: string | null;            // linked desktop window
  }>;
  
  startStream(requestId: string, serverId: string): void;
  updateStream(requestId: string, view: DeepPartial<DynamicView>, step: number): void;
  completeStream(requestId: string, finalView: DynamicView): void;
  linkWindow(requestId: string, windowId: string): void;
  getStreamForWindow(windowId: string): StreamingView | null;
}
```

#### UIAgentView Changes

```typescript
// Open window on first layout_update (not on complete)
useEffect(() => {
  if (activeSession?.partialView && activeRequestId && !openedRef.current.has(activeRequestId)) {
    openedRef.current.add(activeRequestId);
    // Open window with streaming reference
    streamingViewStore.startStream(activeRequestId, serverId);
    const windowId = openDynamicUIStreamWindow(serverId, activeRequestId, activeSession.partialView);
    streamingViewStore.linkWindow(activeRequestId, windowId);
  }
}, [activeSession?.partialView]);

// On complete: finalize stream → pin as normal view
useEffect(() => {
  if (activeSession?.status === 'complete' && activeSession.view && activeRequestId) {
    streamingViewStore.completeStream(activeRequestId, activeSession.view as DynamicView);
  }
}, [activeSession?.status]);
```

#### DynamicUIWindow Streaming Mode

The window component checks both stores:
1. `streamingViewStore.getStreamForWindow(windowId)` — if streaming, render `partialView` with skeleton placeholders
2. `useDynamicUIStore.getViewForWindow(windowId)` — if complete, render final `DynamicView`

During streaming: shows a subtle progress indicator (pulsing dot or thin progress bar at top), skeleton placeholders for unfilled areas.

#### Acceptance Criteria

- [ ] `streaming-view-store.ts` created with stream lifecycle management
- [ ] Window opens on first `layout_update` event
- [ ] Window subscribes to streaming view and re-renders on each update
- [ ] On `complete`, stream transitions to pinned view seamlessly
- [ ] Skeleton placeholders show for unfilled layout areas
- [ ] Progress indicator visible during streaming
- [ ] Tests: window opens early, updates progressively, finalizes correctly

---

### EX3-B.4: Updated Executor Prompt (Multi-Step Workflow)

**Problem:** The current prompt tells the executor to gather all data then generate_schema in one shot. Need to guide it through progressive generation.

**Solution:** Rewrite the workflow section of the executor prompt.

#### New Workflow Prompt Section

```markdown
## Workflow (IMPORTANT — follow this step-by-step order)

### Step 1: Understand
Call get_server_context() to understand what's on the server.

### Step 2: Plan Layout  
Based on the user's request and the layout pattern hint from the planner,
call set_layout() to establish the root structure. Choose the layout type:
- "tabs" — for multiple data categories (most common)
- "stack" — for a single focused view
- "grid" — for a dashboard of equal-weight items
- "sidebar" — for navigation-heavy views

Example: set_layout({ layout: "tabs", title: "Network Overview", icon: "Network" })
The user will see the window open with the layout skeleton.

### Step 3: Add Sections (if tabs/sidebar)
Call add_section() for each tab or sidebar section you plan to create.
Example: add_section({ sectionId: "ports", label: "Listening Ports", icon: "Radio" })
The user will see tab headers appear.

### Step 4: Gather Data & Add Widgets (repeat per section)
For each section:
a. exec_command() to gather the relevant data
b. add_widgets() to render the parsed data into the section
c. The user sees widgets appear in that section

Do NOT gather all data first. Gather → render → gather → render.
This creates the progressive build effect.

### Step 5: Refine (optional)
- update_widget() to adjust data after additional commands
- remove_widget() / remove_section() if something isn't useful
- The user sees adjustments happen in real-time

### Step 6: Finalize
Call generate_schema() with the complete schema (you can use the working 
view's accumulated state). This validates everything with Zod.

### Key Rules
- Call set_layout() FIRST before any add_widgets()
- One section's data at a time — gather then render, not all-at-once
- Summary stats go at root level (no sectionId), not inside tabs
- Each tool call is visible to the user — make each step meaningful
```

#### Acceptance Criteria

- [ ] Executor prompt updated with multi-step workflow
- [ ] Prompt includes examples for each new tool
- [ ] Prompt references the selected layout pattern
- [ ] Tests: prompt builder produces correct multi-step instructions
- [ ] FakeLLM fixtures demonstrate the expected step sequence

---

## Sub-Phase EX3-C: Unified Window & Visual Polish

> Replace both DynamicAppWindow and DynamicUITabView with a single design-system-native window component. Add widget animations, skeleton states, and contextual toolbar.

---

### EX3-C.1: DynamicUIWindow Component

**Problem:** `DynamicAppWindow` (overlay dialog with toolbar) and `DynamicUITabView` (bare desktop window) are separate components with inconsistent UX. Neither looks like a real HeadlessOS app.

**Solution:** A unified `DynamicUIWindow` component that matches ServerAdmin/FileExplorer exactly.

#### Component Structure

```
DynamicUIWindow
├── DynamicUISidebar          (left, 200px — FileExplorer NavigationPane style)
│   ├── Quick Access          (section: Overview, JSON View, Export)
│   └── Content               (section: auto-populated from view layout)
├── Main Area                 (flex column)
│   ├── Header                (icon + title + refresh — ServerAdmin pattern)
│   ├── DynamicUIToolbar      (tabs + contextual controls)
│   ├── Content Body          (DynamicViewRenderer — @container p-6 space-y-4)
│   └── Footer                (generation meta — model, latency, steps)
└── StreamingOverlay          (progress indicator during generation)
```

#### Sidebar Sections

**Quick Access** (always present):
```
📊 Overview         — scrolls to top / shows all content
{ } JSON View       — toggles JSON display (like DynamicAppWindow's current toggle)
↻  Regenerate       — triggers re-generation
📥 Export            — exports view as JSON file
⭐ Pin               — pins to favorites
```

**Content** (auto-populated by walking the view's layout tree):
- If root is `tabs` → each tab becomes a sidebar item (clicking activates that tab)
- If root is `sidebar` → uses its `sidebarItems` directly
- If root is `stack`/`grid` → groups widgets by type:
  - Tables section (if any table widgets)
  - Charts section (if any chart widgets)
  - Metrics section (if any stat-card widgets)
  - Each item: click scrolls to that widget

**Styling** (exact match to ServerAdmin/FileExplorer):
```
Section header:  text-[11px] font-semibold text-foreground/50 tracking-wide
Item button:     px-2.5 py-2 text-[13px] rounded-md
Item active:     bg-primary/15 text-primary font-medium
Item inactive:   text-foreground hover:bg-accent/50
Item icon:       size={20} strokeWidth={1.6}
Sidebar bg:      bg-sidebar, w-[200px], border-r border-border/40
```

#### Header

Exact ServerAdmin section header pattern:
```
Left:   Icon (size={22} text-primary) + Title (text-xl font-bold text-foreground)
Right:  Refresh button (ghost h-8 w-8 text-foreground/30 hover:text-foreground)
```

#### Footer

```
Left:   "Generated in {latency}s · {steps} steps · {reflections} reflections"
Right:  Model name badge (text-[10px] font-mono text-foreground/30)
Styling: border-t border-border/40 px-4 py-2 text-xs text-foreground/40
```

#### Acceptance Criteria

- [ ] `DynamicUIWindow.tsx` created with sidebar + header + body + footer
- [ ] Sidebar auto-populates from view layout structure
- [ ] Quick Access section with Overview/JSON/Regenerate/Export/Pin
- [ ] Header matches ServerAdmin pattern exactly
- [ ] Footer shows generation metadata
- [ ] Supports both streaming mode (partialView) and complete mode (DynamicView)
- [ ] `DynamicAppWindow.tsx` deleted (replaced)
- [ ] `DynamicUITabView.tsx` rewritten as thin wrapper
- [ ] All existing tests updated/migrated
- [ ] Visual comparison: screenshot matches ServerAdmin layout quality

---

### EX3-C.2: DynamicUIToolbar

**Problem:** No contextual toolbar — no search, no filters, no view controls.

**Solution:** A toolbar that adapts to the content type of the active tab/section.

#### Contextual Controls

The toolbar scans the widgets in the active section and shows relevant controls:

| Content Type | Controls Shown |
|-------------|---------------|
| Table widget(s) present | Search input (`Input h-8 text-xs shadow-none` with Search icon) + column filter dropdown |
| Chart widget(s) present | Chart type toggle (bar/line/area — ToggleGroup) |
| Live data widgets | Pause/Resume all toggle + refresh interval selector |
| Any content | View mode: Default / Compact (ToggleGroup) |

#### Tab Bar

When the view has multiple sections (tabs layout), the toolbar includes the ServerAdmin-style tab bar:

```
TabsList:     h-auto p-1 bg-muted rounded-lg gap-1 w-auto inline-flex
TabsTrigger:  rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50
              data-[state=active]:bg-background data-[state=active]:text-foreground
              data-[state=active]:shadow-sm transition-all hover:text-foreground/70
Count badge:  ml-1.5 text-[11px] tabular-nums opacity-50
```

#### Table Search & Filter

When a table widget is in the active section:
- **Search**: filters ALL table rows client-side (substring match across all visible columns)
- **Column filter**: dropdown with checkboxes to show/hide columns
- Both use ServerAdmin compact input styling: `h-8 text-xs shadow-none`

#### Layout

```
┌─────────────────────────────────────────────────────┐
│ [Tab1] [Tab2] [Tab3]          [🔍 Search] [≡ View] │
└─────────────────────────────────────────────────────┘
Styling: flex items-center justify-between px-4 py-2 border-b border-border/40
```

#### Acceptance Criteria

- [ ] `DynamicUIToolbar.tsx` created with contextual control logic
- [ ] Tab bar with exact ServerAdmin TabsList/TabsTrigger styling
- [ ] Table search: client-side filtering across all columns
- [ ] Column filter dropdown (show/hide columns)
- [ ] View mode toggle: Default / Compact
- [ ] Integrates with `DynamicUIWindow` via props/context
- [ ] Tests: toolbar renders correct controls based on widget types

---

### EX3-C.3: Widget Entrance Animations

**Problem:** Widgets currently have a basic `animate-in` class but no staggering and no special progressive build effect.

**Solution:** Staggered entrance animations that create the "watching it build" feeling.

#### Animation System

```typescript
// In WidgetRenderer.tsx
interface WidgetRendererProps {
  widget: Widget;
  index: number;           // position in parent layout
  isStreaming: boolean;     // are we in progressive build mode?
}

// Stagger delay: each widget animates 75ms after the previous
const staggerDelay = isStreaming ? index * 75 : 0;

// CSS classes
const animationClasses = cn(
  'animate-in fade-in slide-in-from-bottom-2 duration-300',
  'fill-mode-backwards',                         // stays invisible until delay kicks in
);

// Style
const animationStyle = {
  animationDelay: `${staggerDelay}ms`,
};
```

#### Skeleton States (During Streaming)

When a widget exists in the partial schema but has incomplete data:

| Widget Type | Skeleton |
|-------------|----------|
| `table` (no rows) | Header row + 3 `<Skeleton className="h-4 w-full" />` rows |
| `stat-card` (no value) | `<Skeleton className="h-8 w-20" />` value + `<Skeleton className="h-3 w-32" />` label |
| `chart` (no data) | `<Skeleton className="h-[200px] w-full rounded-lg" />` |
| `code-block` (no code) | 5 `<Skeleton className="h-3 w-{random}" />` lines |
| `key-value` (no pairs) | 3 `<Skeleton className="h-4 w-full" />` rows in grid |
| `progress-bar` (no value) | `<Skeleton className="h-1.5 w-full rounded-full" />` |
| `log-viewer` (no lines) | 8 `<Skeleton className="h-3 w-{random}" />` lines |

Layout skeletons (section exists but no widgets yet):
- Tab content area: `<Skeleton className="h-32 w-full rounded-lg" />`
- Stack section: 3 `<Skeleton className="h-20 w-full rounded-lg" />` blocks

#### Layout Transition

When a section is removed or widgets change:
- Removed widgets: `animate-out fade-out slide-out-to-bottom-1 duration-200`
- Layout reflow: `transition-all duration-300` on container

#### Acceptance Criteria

- [ ] Staggered entrance animation (75ms delay per widget index)
- [ ] `isStreaming` prop controls whether stagger is active
- [ ] Skeleton states for all 11 widget types
- [ ] Layout-level skeleton for empty sections
- [ ] Removal animation for deleted widgets/sections
- [ ] Animations use existing design system timing (duration-200, duration-300)
- [ ] No animation dependency added (uses Tailwind animate classes only)
- [ ] Tests: skeleton renders for incomplete widgets, animation classes applied

---

### EX3-C.4: Template Library Expansion

**Problem:** 15 templates exist but they're flat single-layout structures. Need richer templates that demonstrate nested layouts and multi-section patterns.

**Solution:** Expand to 25+ templates with nested layouts, matching the 10 layout patterns from EX3-A.2.

#### New Templates (10 additional)

| # | Template ID | Pattern Used | Layout Structure |
|---|-----------|-------------|-----------------|
| 16 | `nginx-config` | config-viewer | stack → key-value metadata + code-block + alert |
| 17 | `docker-compose` | config-viewer | stack → key-value + code-block (compose.yml) + table (services) |
| 18 | `system-monitoring` | monitoring | stack → grid (stat-cards) + grid (2 charts) + table (processes) |
| 19 | `firewall-rules` | multi-table | stack → stat-cards + tabs (INPUT/OUTPUT/FORWARD tables) |
| 20 | `ssl-certificates` | single-table | stack → alert (expiry) + key-value + table (certs) |
| 21 | `user-audit` | security-audit | stack → alert + stat-cards + tabs (users/groups/sudoers) |
| 22 | `disk-analysis` | overview-dashboard | stack → stat-cards + tabs (mounts table / usage chart / inodes) |
| 23 | `service-comparison` | comparison | tabs → each service as tab → key-value + progress-bars |
| 24 | `apache-log-analysis` | log-analysis | stack → stat-cards + log-viewer + chart (requests/hour) |
| 25 | `directory-tree` | tree-explorer | stack → key-value + tree (files) + code-block (selected) |

Each template:
- Uses nested layouts where the pattern requires it
- Follows all design system rules from EX3-A.3
- Serves as an example the LLM can reference
- Has proper `matchPatterns` for template auto-matching

#### Acceptance Criteria

- [ ] 10 new templates created in `server/src/dynamic-ui/templates/`
- [ ] Templates use nested layouts (tabs containing stacks, etc.)
- [ ] Templates follow all design system rules
- [ ] Each template tagged with its layout pattern ID
- [ ] Template registry updated with new templates
- [ ] Tests: all templates validate against updated schema

---

## Testing Strategy

### FakeLLM Integration Tests

```
server/tests/agent/fake-llm/
├── fake-llm-provider.test.ts       # FakeLLM replays fixture correctly
├── fixture-recorder.test.ts        # Recording produces valid fixtures
├── comparator.test.ts              # Comparison detects structural diffs
└── fixtures/                       # 5+ fixture files
    ├── network-ports.fixture.json
    ├── system-overview.fixture.json
    ├── docker-status.fixture.json
    ├── nginx-config.fixture.json
    └── disk-analysis.fixture.json
```

### Progressive Generation Tests

```
server/tests/agent/progressive/
├── working-view.test.ts            # WorkingView mutation methods
├── layout-tools.test.ts            # set_layout, add_widgets, etc.
├── event-pipeline.test.ts          # layout_update flows through pipeline
└── multi-step-executor.test.ts     # Full step sequence with FakeLLM
```

### Frontend Tests

```
client/tests/components/
├── DynamicUIWindow.test.tsx        # Sidebar + toolbar + body rendering
├── DynamicUISidebar.test.tsx       # Auto-population from view structure
├── DynamicUIToolbar.test.tsx       # Contextual controls per widget type
├── streaming-view.test.tsx         # Progressive rendering + skeleton states
└── widget-animations.test.tsx      # Entrance stagger + removal animation
```

### Visual Regression

- Screenshot comparison: generated UI vs ServerAdmin → same visual density
- FakeLLM output rendered → screenshot → compared to reference screenshots
- Design token audit: no hardcoded colors in generated output

---

## Task Summary

| Task | Title | Sub-Phase | Depends On |
|------|-------|-----------|-----------|
| EX3-A.1 | Nestable Layouts | A | — |
| EX3-A.2 | Layout Template Patterns | A | — |
| EX3-A.3 | Design System Rules in Prompt | A | — |
| EX3-A.4 | FakeLLM Generator | A | — |
| EX3-B.1 | Working View & Layout Mutation Tools | B | EX3-A.1 |
| EX3-B.2 | `layout_update` Event Pipeline | B | EX3-B.1 |
| EX3-B.3 | Early Window Opening & Streaming Bridge | B | EX3-B.2 |
| EX3-B.4 | Updated Executor Prompt (Multi-Step) | B | EX3-B.1, EX3-A.2, EX3-A.3 |
| EX3-C.1 | DynamicUIWindow Component | C | EX3-B.3 |
| EX3-C.2 | DynamicUIToolbar | C | EX3-C.1 |
| EX3-C.3 | Widget Entrance Animations | C | EX3-C.1, EX3-B.3 |
| EX3-C.4 | Template Library Expansion | C | EX3-A.1, EX3-A.2 |

### Execution Order (recommended)

```
EX3-A.1 (nestable layouts) ─────────────────┐
EX3-A.2 (layout patterns)  ─────────────────┤
EX3-A.3 (design system prompt) ─────────────┤
EX3-A.4 (FakeLLM) ──────────────────────────┤
                                             ▼
EX3-B.1 (working view + tools) ─────────────┐
EX3-B.4 (multi-step prompt) ─────────────────┤
EX3-B.2 (layout_update pipeline) ────────────┤
EX3-B.3 (early window + streaming) ──────────┤
                                             ▼
EX3-C.1 (DynamicUIWindow) ──────────────────┐
EX3-C.2 (toolbar) ──────────────────────────┤
EX3-C.3 (animations + skeletons) ────────────┤
EX3-C.4 (template expansion) ────────────────┘
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| First visual (layout skeleton) | < 1.5s from prompt submission |
| First widget visible | < 3s from prompt submission |
| Full view complete | < 15s (acceptable for experimental feature) |
| Design system compliance | Generated UI passes visual diff vs ServerAdmin |
| FakeLLM fixture match | > 90% structural similarity score |
| Test coverage | All new code has tests |
| Template coverage | 25+ templates across 10 layout patterns |

---

## Open Questions (for review)

1. **Nestable layout depth limit** — 3 levels recommended. Grafana has no enforced limit but 3 is the practical max observed. More?
2. **`_kind` discriminator vs inference** — should nested layouts use an explicit `_kind: 'layout'` field, or infer from `layout` vs `type` keys? (Recommend: inference — Grafana uses `forEachChild` runtime check, not a discriminator)
3. **Widget IDs** — should the LLM assign IDs, or should the WorkingView auto-generate them? (Recommend: auto-generate with `widget-{counter}`)
4. **FakeLLM in CI** — should FakeLLM tests run in CI as a quality gate? (Recommend: yes)
5. **Template variables** — should variables be resolved at generation time (LLM fills them) or at render time (frontend resolves)? Grafana resolves at render time, but our use case is simpler. (Recommend: generation time — LLM fills variables into the skeleton)
6. **Backward compatibility** — existing `widgets` field in layouts → keep as alias for `children`? (Recommend: yes, deprecation warning in Zod transform)
7. **Widget property richness** — Grafana panels have ~30 configurable properties, our widgets have ~5-8. Should EX3 expand widget config? Key candidates from Grafana: `unit`, `thresholds`, `color` mode, `valueMappings`, `decimals`, `noValue`. (Recommend: add at minimum `unit` + `thresholds` + `valueMappings` to stat-card, progress-bar, and table columns)
8. **Panel chrome from renderer vs schema** — Grafana wraps every panel in `PanelChrome` at render-time (title bar, menu, actions, collapse). Should our `WidgetRenderer` add consistent chrome, or should the LLM specify it per-widget? (Recommend: renderer adds chrome — consistent look, less LLM burden)
9. **Lazy loading** — Grafana uses IntersectionObserver for lazy panel rendering. Should generated views with 10+ widgets use lazy loading? (Recommend: yes for EX3-C, especially during streaming mode)
