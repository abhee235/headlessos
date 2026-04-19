# EX1 Implementation Guide: Dynamic UI Engine

> **Purpose:** Actionable engineering guide synthesized from deep analysis of Grafana Scenes,
> react-jsonschema-form (rjsf), and Vercel AI SDK. Maps reference patterns to HeadlessOS
> architecture. Read this BEFORE writing any EX1 code.
>
> **Reference repos:** `temp/grafana-scenes/`, `temp/react-jsonschema-form/`, `temp/vercel-ai-sdk/`
> **Phase spec:** [phase-ex1.md](phase-ex1.md) — task IDs, schemas, acceptance criteria
> **ADR:** [ADR-015](../DECISIONS.md) — rationale & sub-decisions

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Widget Registry](#2-widget-registry)
3. [Recursive Renderer](#3-recursive-renderer)
4. [Layout System](#4-layout-system)
5. [Streaming Pipeline](#5-streaming-pipeline)
6. [Partial JSON Repair](#6-partial-json-repair)
7. [DeepPartial & Progressive Rendering](#7-deeppartial--progressive-rendering)
8. [Transport Layer (WebSocket)](#8-transport-layer-websocket)
9. [State Management (Zustand)](#9-state-management-zustand)
10. [Template Library](#10-template-library)
11. [LLM Integration](#11-llm-integration)
12. [Patterns to Adopt vs Avoid](#12-patterns-to-adopt-vs-avoid)
13. [File-by-File Build Plan](#13-file-by-file-build-plan)
14. [Reference File Map](#14-reference-file-map)

---

## 1. Architecture Overview

### What We're Building

A **JSON Schema → React UI** pipeline where:
1. Backend sends a `DynamicViewSchema` JSON blob (from LLM or template)
2. Frontend recursively renders it into live widgets using shadcn/ui
3. During LLM generation, JSON streams incrementally — UI assembles progressively

### Key Insight from Research

Each reference project solves a piece of this puzzle:

| Problem | Solution From | HeadlessOS Adaptation |
|---------|--------------|----------------------|
| Widget type → component dispatch | Grafana Scenes (`Map<string, PanelPlugin>`) | Simple `Map<string, ComponentType>` registry |
| Recursive schema → nested UI | rjsf (`SchemaField` → type-specific Field → recurse) | `WidgetRenderer` → type dispatch → `LayoutRenderer` → recurse |
| Streaming partial JSON from LLM | Vercel AI SDK (`fixJson` + `parsePartialJson`) | Port the 4-file streaming pipeline |
| Schema ↔ display separation | rjsf (`schema` vs `uiSchema`) | `DynamicViewSchema` already has this (data in `rows`, display in `columns.type/badgeVariant`) |
| Transport abstraction | Vercel AI SDK (`ChatTransport`) | `DynamicUITransport` over existing WebSocket |

### What We're NOT Building

- **NOT** a class-based scene graph (Grafana's `SceneObject` hierarchy = 453-line base class, RxJS observables)
- **NOT** a React Context–based registry (rjsf stuffs everything into `RegistryContext`)
- **NOT** SSE transport (Vercel AI SDK's default transport — we already have WebSocket)
- **NOT** a full form engine (rjsf's `ArrayField`/`ObjectField` recursion is overkill for display-only widgets)

---

## 2. Widget Registry

### Pattern Source: Grafana Scenes

Grafana uses a dead-simple `Map<string, PanelPlugin>` for widget dispatch:

```typescript
// Grafana: packages/scenes/src/components/VizPanel/registerRuntimePanelPlugin.ts
const runtimePanelPlugins = new Map<string, PanelPlugin>();

export function registerRuntimePanelPlugin(options: { pluginId: string; plugin: PanelPlugin }) {
  runtimePanelPlugins.set(options.pluginId, options.plugin);
}
```

Resolution is a simple `Map.get()` — no class hierarchy, no DI, no middleware.

### Our Implementation

```typescript
// client/src/components/DynamicUI/widget-registry.ts

import type { ComponentType } from 'react';
import type { Widget } from '@headlessos/shared/schemas/dynamic-view';

/** Registry entry: a React component that renders a specific widget type */
export type WidgetComponent<W extends Widget = Widget> = ComponentType<{ widget: W }>;

/** Simple Map — widget.type string → React component */
const registry = new Map<string, WidgetComponent>();

/** Register a widget renderer */
export function registerWidget(type: string, component: WidgetComponent): void {
  if (registry.has(type)) {
    console.warn(`[DynamicUI] Overwriting widget type "${type}"`);
  }
  registry.set(type, component);
}

/** Look up a widget renderer. Returns undefined if not registered. */
export function getWidget(type: string): WidgetComponent | undefined {
  return registry.get(type);
}

/** Get all registered widget types (useful for playground/debugging) */
export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}
```

### Registration (top-level, runs once)

```typescript
// client/src/components/DynamicUI/register-widgets.ts
import { registerWidget } from './widget-registry';
import { TableWidget } from './widgets/TableWidget';
import { KeyValueWidget } from './widgets/KeyValueWidget';
// ... etc

registerWidget('table', TableWidget);
registerWidget('key-value', KeyValueWidget);
registerWidget('badge-grid', BadgeGridWidget);
registerWidget('stat-card', StatCardWidget);
registerWidget('progress-bar', ProgressBarWidget);
registerWidget('code-block', CodeBlockWidget);
registerWidget('alert', AlertWidget);
// Extended (EX1.5):
registerWidget('chart', ChartWidget);
registerWidget('tree', TreeWidget);
registerWidget('log-viewer', LogViewerWidget);
```

Import `register-widgets.ts` from the app root (`App.tsx` or DynamicUI index) so it runs on startup.

### Why Not rjsf's Three-Layer Merge

rjsf has a powerful pattern: `core defaults ← theme ← user props`. This is great for a form library
supporting multiple themes. But HeadlessOS has **one theme** (our shadcn/ui design system) and
**no external plugin API** (yet). A simple `Map` is the right starting point. We can add layers later
if we build a plugin system.

---

## 3. Recursive Renderer

### Pattern Source: rjsf

rjsf's rendering starts at a single entry point (`SchemaField`) that dispatches by type:

```
SchemaField → determines type (string, number, array, object, boolean)
  → dispatches to type-specific Field (StringField, NumberField, ArrayField, etc.)
    → each Field renders via a Widget (TextWidget, CheckboxWidget, etc.)
    → ArrayField/ObjectField recurse BACK to SchemaField for children
```

This "single entry point + recursive dispatch" is elegant. We adapt it for display widgets:

### Our Implementation

Two levels of dispatch:
1. **`LayoutRenderer`** — dispatches by `layout.layout` (stack, grid, tabs, sidebar)
2. **`WidgetRenderer`** — dispatches by `widget.type` (table, chart, etc.) via the registry

```typescript
// client/src/components/DynamicUI/DynamicViewRenderer.tsx

export function DynamicViewRenderer({ view }: { view: DeepPartial<DynamicView> }) {
  return (
    <div className="space-y-4">
      {view.description && (
        <p className="text-sm text-[rgb(var(--muted-foreground))]">{view.description}</p>
      )}
      {view.root && <LayoutRenderer layout={view.root} />}
    </div>
  );
}
```

```typescript
// client/src/components/DynamicUI/LayoutRenderer.tsx

export function LayoutRenderer({ layout }: { layout: DeepPartial<Layout> }) {
  if (!layout.layout) return <Skeleton className="h-32 w-full" />;

  switch (layout.layout) {
    case 'stack':
      return <StackLayout layout={layout} />;
    case 'grid':
      return <GridLayout layout={layout} />;
    case 'tabs':
      return <TabsLayout layout={layout} />;
    case 'sidebar':
      return <SidebarLayout layout={layout} />;
    default:
      return <Alert variant="destructive">Unknown layout: {(layout as any).layout}</Alert>;
  }
}
```

```typescript
// client/src/components/DynamicUI/WidgetRenderer.tsx

import { getWidget } from './widget-registry';

export function WidgetRenderer({ widget }: { widget: DeepPartial<Widget> }) {
  if (!widget.type) return <Skeleton className="h-24 w-full" />;

  const Component = getWidget(widget.type);
  if (!Component) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unknown widget</AlertTitle>
        <AlertDescription>Widget type "{widget.type}" is not registered.</AlertDescription>
      </Alert>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Component widget={widget as Widget} />
    </motion.div>
  );
}
```

The recursion happens naturally: `StackLayout` / `GridLayout` render arrays of `WidgetRenderer` calls.
`TabsLayout` and `SidebarLayout` render sections that each contain `WidgetRenderer` arrays.

---

## 4. Layout System

### Pattern Source: Grafana Scenes

Grafana offers 4 layout types, each wrapping children differently:
- `SceneGridLayout` — uses `react-grid-layout` (24-column draggable grid)
- `SceneFlexLayout` — CSS flexbox with direction prop
- `SceneCSSGridLayout` — native CSS Grid with template strings
- `SplitLayout` — two-pane with resizable divider

We don't need draggable grids (the LLM decides layout, not the user). Our layouts map to CSS:

### Our Layouts

| Layout | CSS | Component |
|--------|-----|-----------|
| `stack` | `flex flex-col gap-{sm\|md\|lg}` | `StackLayout.tsx` |
| `grid` | `grid grid-cols-{1-4} gap-4` | `GridLayout.tsx` |
| `tabs` | shadcn `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | `TabsLayout.tsx` |
| `sidebar` | `AppWindow.Sidebar` + `AppWindow.SidebarItem` | `SidebarLayout.tsx` |

```typescript
// layouts/StackLayout.tsx
const gapMap = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };

export function StackLayout({ layout }: { layout: DeepPartial<StackLayoutType> }) {
  const gap = gapMap[layout.gap ?? 'md'];
  return (
    <div className={cn('flex flex-col', gap)}>
      {(layout.widgets ?? []).map((widget, i) => (
        <WidgetRenderer key={i} widget={widget} />
      ))}
    </div>
  );
}
```

```typescript
// layouts/GridLayout.tsx
const colsMap: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

export function GridLayout({ layout }: { layout: DeepPartial<GridLayoutType> }) {
  const cols = colsMap[layout.columns ?? 2];
  return (
    <div className={cn('grid gap-4', cols)}>
      {(layout.widgets ?? []).map((widget, i) => (
        <WidgetRenderer key={i} widget={widget} />
      ))}
    </div>
  );
}
```

---

## 5. Streaming Pipeline

### Pattern Source: Vercel AI SDK

This is the **most critical** piece. Vercel AI SDK solves the exact problem we have: an LLM produces
JSON tokens incrementally, and we need to render a React UI from the partial JSON as it builds up.

### Vercel's Pipeline

```
LLM text token → accumulate into buffer → parsePartialJson(buffer)
                                              │
                                    ┌─────────┴────────────┐
                                    │ Try JSON.parse()      │
                                    │ If fails → fixJson()  │
                                    │   (repair incomplete  │
                                    │    JSON structure)    │
                                    │ If still fails →      │
                                    │   skip this chunk     │
                                    └─────────┬────────────┘
                                              │
                                    isDeepEqualData(prev, new)?
                                    ├── YES → skip (no re-render)
                                    └── NO  → emit as DeepPartial<T>
                                              → React re-renders
```

Key files in `temp/vercel-ai-sdk/packages/ai/src/util/`:
- **`fix-json.ts`** (402 lines) — finite-state scanner that closes incomplete JSON structures
- **`parse-partial-json.ts`** (32 lines) — try parse → try fixJson → fail gracefully
- **`is-deep-equal-data.ts`** (52 lines) — prevents unnecessary re-renders
- **`deep-partial.ts`** (85 lines) — TypeScript type that makes all fields optional recursively

### What fixJson Does

When the LLM has streamed `{"title": "Nginx Config", "root": {"layout": "stack", "widgets": [{"type": "table", "title": "Lis`,
`fixJson` repairs it to: `{"title": "Nginx Config", "root": {"layout": "stack", "widgets": [{"type": "table", "title": "Lis"}]}}`.

It's a state machine that tracks JSON nesting (objects, arrays, strings, numbers, literals) and
appends the necessary closing tokens. This is far more robust than regex-based approaches.

### Our Adaptation

We port these 4 files into `shared/lib/streaming/`:

```
shared/lib/streaming/
├── fix-json.ts              # Port from Vercel AI SDK (Apache-2.0 / MIT)
├── parse-partial-json.ts    # Simplified — remove safeParseJSON dep, use try/catch
├── is-deep-equal-data.ts    # Direct port (no deps)
├── deep-partial.ts          # Simplified — remove FlexibleSchema, use plain TS
└── index.ts                 # Re-exports
```

#### Simplified `parsePartialJson` (no external deps)

```typescript
// shared/lib/streaming/parse-partial-json.ts
import { fixJson } from './fix-json';

export type ParseState =
  | 'undefined-input'
  | 'successful-parse'
  | 'repaired-parse'
  | 'failed-parse';

export function parsePartialJson(text: string | undefined): {
  value: unknown | undefined;
  state: ParseState;
} {
  if (text === undefined) {
    return { value: undefined, state: 'undefined-input' };
  }

  // Try direct parse first
  try {
    return { value: JSON.parse(text), state: 'successful-parse' };
  } catch {
    // Not valid JSON yet — try repair
  }

  // Try repaired parse
  try {
    return { value: JSON.parse(fixJson(text)), state: 'repaired-parse' };
  } catch {
    // Can't repair — probably too early in the stream
  }

  return { value: undefined, state: 'failed-parse' };
}
```

#### Simplified `DeepPartial` (no external deps)

```typescript
// shared/lib/streaming/deep-partial.ts

/**
 * Recursively makes all properties optional.
 * Used for partial/streaming schema states where only some fields have arrived.
 */
export type DeepPartial<T> = T extends
  | null
  | undefined
  | string
  | number
  | boolean
  | symbol
  | bigint
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U> | undefined>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : unknown;
```

### License Compliance

- `fix-json.ts` → Apache-2.0 (Vercel AI SDK) — include license header
- `deep-partial.ts` → MIT (Sindre Sorhus / Vercel) — include attribution comment
- `is-deep-equal-data.ts` → Apache-2.0 (Vercel) — include license header
- `parse-partial-json.ts` → We rewrite this (it's 32 lines of straightforward logic)

---

## 6. Partial JSON Repair

### Deep Dive: fixJson State Machine

The `fixJson` function in `temp/vercel-ai-sdk/packages/ai/src/util/fix-json.ts` is a 402-line
scanner with 16 states. It processes the input character by character and maintains a stack of states:

```
States: ROOT, FINISH, INSIDE_STRING, INSIDE_STRING_ESCAPE, INSIDE_LITERAL,
        INSIDE_NUMBER, INSIDE_OBJECT_START, INSIDE_OBJECT_KEY,
        INSIDE_OBJECT_AFTER_KEY, INSIDE_OBJECT_BEFORE_VALUE,
        INSIDE_OBJECT_AFTER_VALUE, INSIDE_OBJECT_AFTER_COMMA,
        INSIDE_ARRAY_START, INSIDE_ARRAY_AFTER_VALUE,
        INSIDE_ARRAY_AFTER_COMMA
```

Key behaviors:
1. **Truncated string** (`"hello wor`) → appends `"` to close the string
2. **Truncated object** (`{"key": "val"`) → appends `}` to close objectobject
3. **Truncated array** (`["a", "b"`) → appends `]` to close array
4. **Nested structures** (`{"a": [{"b": 1`) → appends `}]}` (correct nesting order)
5. **Truncated number** (`{"n": 12`) → number is valid as-is, appends `}`
6. **Truncated literal** (`{"b": tru`) → completes to `true`, appends `}`

### Porting Strategy

1. Copy `fix-json.ts` verbatim (it has zero external dependencies)
2. Add Apache-2.0 license header from Vercel AI SDK
3. Port the test file (`fix-json.test.ts`) for our test suite
4. No modifications needed — it works on raw strings, no framework coupling

---

## 7. DeepPartial & Progressive Rendering

### The Problem

During streaming, the DynamicViewSchema builds up incrementally:

```
Time 0:  { "title": "Ng" }
Time 1:  { "title": "Nginx Config", "root": { "layout": "st" } }
Time 2:  { "title": "Nginx Config", "root": { "layout": "stack", "widgets": [] } }
Time 3:  { "title": "Nginx Config", "root": { "layout": "stack", "widgets": [{ "type": "table" }] } }
Time 4:  { "title": "Nginx Config", "root": { "layout": "stack", "widgets": [{ "type": "table", "columns": [...] }] } }
Time 5:  (complete schema)
```

The `DynamicView` TypeScript type requires all fields. But during streaming, we have a
`DeepPartial<DynamicView>` where any field might be missing or incomplete.

### Our Rendering Strategy

```tsx
function DynamicViewRenderer({ view }: { view: DeepPartial<DynamicView> }) {
  // Title shows as soon as it arrives, even partial
  // root renders when layout type is known
  // Each widget renders when its type discriminator arrives
  // Missing/incomplete fields show Skeleton placeholders
}
```

Each component handles its own partial state:

```tsx
// Widget handles partial data gracefully
function TableWidget({ widget }: { widget: DeepPartial<TableWidgetType> }) {
  // Show title immediately if available
  // Show column headers when columns array arrives
  // Show Skeleton rows until rows data arrives
  // Add rows with fade-in animation as they stream in

  if (!widget.columns?.length) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      {widget.title && <CardHeader><CardTitle>{widget.title}</CardTitle></CardHeader>}
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {widget.columns.map((col, i) => (
                <TableHead key={i}>{col?.label ?? <Skeleton className="h-4 w-20" />}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(widget.rows ?? []).map((row, i) => (
              <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {widget.columns!.map((col, j) => (
                  <TableCell key={j}>{renderCellValue(row, col)}</TableCell>
                ))}
              </motion.tr>
            ))}
            {/* Skeleton rows if we know column count but rows are still streaming */}
            {!widget.rows?.length && (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {widget.columns!.map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

### isDeepEqualData for Render Deduplication

When the LLM streams a token that doesn't change the parsed structure (e.g., whitespace between
JSON tokens), we skip the re-render:

```typescript
// In the streaming hook:
const prevRef = useRef<DeepPartial<DynamicView> | undefined>();

function onNewPartialJson(parsed: DeepPartial<DynamicView>) {
  if (isDeepEqualData(prevRef.current, parsed)) return; // No change — skip
  prevRef.current = parsed;
  setPartialView(parsed); // Triggers React re-render
}
```

---

## 8. Transport Layer (WebSocket)

### Pattern Source: Vercel AI SDK

Vercel defines a `ChatTransport` interface that abstracts the connection protocol:

```typescript
// Vercel: ChatTransport decouples stream consumption from protocol
interface ChatTransport {
  submitMessages(options: { messages, headers, body }): {
    output: ReadableStream<UIMessage>;
    serverSideToolRoundtrips: Promise<void>;
  };
}
```

This allows swapping SSE for WebSocket (or in-process for testing). We adapt this for our
already-existing WebSocket infrastructure.

### Our Transport

HeadlessOS already has `@fastify/websocket` registered and 3 WebSocket endpoints
(terminal, agent, docker-install). We add a 4th:

```
WS /ws/dynamic-ui/:serverId
```

#### Protocol Messages (Typed with Zod)

```typescript
// shared/schemas/dynamic-ui-protocol.ts
import { z } from 'zod';

// ── Client → Server ──
export const DynamicUIRequestSchema = z.object({
  type: z.literal('generate'),
  requestId: z.string(),        // Client-generated UUID for multiplexing
  tool: z.string(),             // e.g., "nginx", "docker"
  command: z.string().optional(), // Specific command, or let backend choose
  rawOutput: z.string().optional(), // Pre-captured terminal output
});

// ── Server → Client ──
export const DynamicUIChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('partial'),
    requestId: z.string(),
    view: z.unknown(),            // DeepPartial<DynamicView> — validated on complete
    accumulatedText: z.string(),  // Raw accumulated JSON text (for debugging)
  }),
  z.object({
    type: z.literal('complete'),
    requestId: z.string(),
    view: z.unknown(),            // Full validated DynamicView
    meta: z.object({
      latencyMs: z.number(),
      tokensUsed: z.object({ input: z.number(), output: z.number() }),
      templateId: z.string().optional(),
      cached: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal('error'),
    requestId: z.string(),
    message: z.string(),
    partialView: z.unknown().optional(), // Whatever was generated before failure
  }),
]);

export type DynamicUIRequest = z.infer<typeof DynamicUIRequestSchema>;
export type DynamicUIChunk = z.infer<typeof DynamicUIChunkSchema>;
```

#### `requestId` Multiplexing

Unlike the terminal WebSocket (1:1 with a shell session), the dynamic-ui WebSocket supports
multiple concurrent generations per connection. Each request has a `requestId` that the client
generates, and all response chunks include it. The frontend uses `requestId` to route chunks to
the correct `useStreamedView` hook instance.

This is simpler than Vercel's SSE transport because WebSocket is natively bidirectional — no
need for dual connections or custom event encoding.

#### Server-Side Handler

```typescript
// server/src/routes/dynamic-ui.ts (sketch)
import type { FastifyInstance } from 'fastify';

export async function dynamicUIRoutes(fastify: FastifyInstance) {
  fastify.get('/ws/dynamic-ui/:serverId', { websocket: true }, (socket, req) => {
    const { serverId } = req.params as { serverId: string };

    socket.on('message', async (msg: Buffer) => {
      const request = DynamicUIRequestSchema.parse(JSON.parse(msg.toString()));

      const generator = fastify.services.get('dynamic-ui-generator');

      try {
        for await (const chunk of generator.generateStreaming({
          tool: request.tool,
          command: request.command,
          rawOutput: request.rawOutput,
          serverId,
        })) {
          socket.send(JSON.stringify({ ...chunk, requestId: request.requestId }));
        }
      } catch (err) {
        socket.send(JSON.stringify({
          type: 'error',
          requestId: request.requestId,
          message: err instanceof Error ? err.message : 'Generation failed',
        }));
      }
    });
  });
}
```

---

## 9. State Management (Zustand)

### Why Not SWR / React Query

Vercel AI SDK uses SWR for its `useObject` hook's React re-renders. We use **Zustand** consistently
across the app (per AGENTS.md §8). Zustand's `set()` is simpler for streaming updates than
SWR's cache mutation.

### Dynamic UI Store

```typescript
// client/src/store/dynamic-ui-store.ts
import { create } from 'zustand';
import type { DynamicView } from '@headlessos/shared/schemas/dynamic-view';
import type { DeepPartial } from '@headlessos/shared/lib/streaming';

interface DynamicUISession {
  requestId: string;
  status: 'connecting' | 'streaming' | 'complete' | 'error';
  partialView: DeepPartial<DynamicView> | undefined;
  completeView: DynamicView | undefined;
  error: string | undefined;
  meta: {
    latencyMs?: number;
    tokensUsed?: { input: number; output: number };
    templateId?: string;
    cached?: boolean;
  };
}

interface DynamicUIStore {
  sessions: Record<string, DynamicUISession>;

  // Actions
  startSession: (requestId: string) => void;
  updatePartial: (requestId: string, view: DeepPartial<DynamicView>) => void;
  completeSession: (requestId: string, view: DynamicView, meta: DynamicUISession['meta']) => void;
  errorSession: (requestId: string, message: string, partialView?: DeepPartial<DynamicView>) => void;
  removeSession: (requestId: string) => void;
}

export const useDynamicUIStore = create<DynamicUIStore>((set) => ({
  sessions: {},

  startSession: (requestId) => set((state) => ({
    sessions: {
      ...state.sessions,
      [requestId]: {
        requestId,
        status: 'connecting',
        partialView: undefined,
        completeView: undefined,
        error: undefined,
        meta: {},
      },
    },
  })),

  updatePartial: (requestId, view) => set((state) => ({
    sessions: {
      ...state.sessions,
      [requestId]: {
        ...state.sessions[requestId],
        status: 'streaming',
        partialView: view,
      },
    },
  })),

  completeSession: (requestId, view, meta) => set((state) => ({
    sessions: {
      ...state.sessions,
      [requestId]: {
        ...state.sessions[requestId],
        status: 'complete',
        completeView: view,
        partialView: undefined,
        meta,
      },
    },
  })),

  errorSession: (requestId, message, partialView) => set((state) => ({
    sessions: {
      ...state.sessions,
      [requestId]: {
        ...state.sessions[requestId],
        status: 'error',
        error: message,
        partialView,
      },
    },
  })),

  removeSession: (requestId) => set((state) => {
    const { [requestId]: _, ...rest } = state.sessions;
    return { sessions: rest };
  }),
}));
```

### `useStreamedView` Hook

This is our adaptation of Vercel AI SDK's `useObject` hook:

```typescript
// client/src/hooks/useStreamedView.ts
import { useCallback, useEffect, useRef } from 'react';
import { useDynamicUIStore } from '../store/dynamic-ui-store';
import { parsePartialJson, isDeepEqualData } from '@headlessos/shared/lib/streaming';
import type { DynamicView } from '@headlessos/shared/schemas/dynamic-view';
import type { DeepPartial } from '@headlessos/shared/lib/streaming';

export function useStreamedView(requestId: string | null) {
  const session = useDynamicUIStore((s) => requestId ? s.sessions[requestId] : undefined);
  const { updatePartial, completeSession, errorSession } = useDynamicUIStore();
  const prevRef = useRef<DeepPartial<DynamicView> | undefined>();

  // View to render: complete > partial > undefined
  const view = session?.completeView ?? session?.partialView;
  const status = session?.status ?? 'connecting';

  return { view, status, error: session?.error, meta: session?.meta };
}
```

The actual WebSocket connection + JSON parsing happens in a separate `useDynamicUIWebSocket` hook
or client-side service class — keeping the rendering hook pure.

---

## 10. Template Library

### Pattern Source: rjsf's Schema/UISchema Separation

rjsf separates WHAT to render (`schema`) from HOW to render it (`uiSchema`). Our
`DynamicViewSchema` already embeds display hints (column types, badge variants, chart types),
so we don't need a separate uiSchema.

However, the template concept from phase-ex1.md maps to rjsf's idea of pre-built schemas:
a template is a **complete DynamicViewSchema** with placeholder data that the LLM customizes
for specific command output.

### Template Structure

```typescript
// server/src/dynamic-ui/templates/types.ts

export interface UITemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];               // ['system', 'monitoring', 'network']
  matchPatterns: RegExp[];      // Match against tool name or command
  schema: DynamicView;          // Complete schema with example data
  promptGuidance: string;       // Extra instructions for LLM when using this template
}
```

### Template Matching

```typescript
// server/src/dynamic-ui/template-library.ts

export class TemplateLibrary {
  private templates: UITemplate[] = [];

  register(template: UITemplate): void {
    this.templates.push(template);
  }

  findMatch(tool: string, command?: string): UITemplate | undefined {
    const searchText = `${tool} ${command ?? ''}`.toLowerCase();

    // Score each template: tag match + pattern match
    let bestMatch: UITemplate | undefined;
    let bestScore = 0;

    for (const t of this.templates) {
      let score = 0;
      // Tag match
      for (const tag of t.tags) {
        if (searchText.includes(tag)) score += 1;
      }
      // Pattern match (strong signal)
      for (const pattern of t.matchPatterns) {
        if (pattern.test(searchText)) score += 5;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = t;
      }
    }

    return bestScore > 0 ? bestMatch : undefined;
  }
}
```

### Template Example: System Overview

```typescript
// server/src/dynamic-ui/templates/system-overview.ts
export const systemOverviewTemplate: UITemplate = {
  id: 'system-overview',
  name: 'System Overview',
  description: 'CPU, memory, disk, and uptime stats in a card grid + progress bars',
  tags: ['system', 'monitoring', 'cpu', 'memory', 'disk', 'uptime'],
  matchPatterns: [/^(top|htop|free|df|vmstat|uptime|neofetch)$/i, /system.*overview/i],
  promptGuidance: 'Use stat-cards for headline metrics and progress bars for utilization percentages.',
  schema: {
    title: 'System Overview',
    icon: 'monitor',
    root: {
      layout: 'stack',
      gap: 'md',
      widgets: [
        {
          type: 'badge-grid',
          title: 'Quick Status',
          badges: [
            { label: 'Hostname', value: '...', variant: 'default' },
            { label: 'Uptime', value: '...', variant: 'success' },
            { label: 'OS', value: '...', variant: 'secondary' },
          ],
        },
        // ... stat cards, progress bars, etc.
      ],
    },
  },
};
```

---

## 11. LLM Integration

### Extending the Existing LLM Provider

The current `LLMProvider` interface supports `parseText<T>()` which returns a complete result.
For streaming, we need a **new method**:

```typescript
// Extension to server/src/llm/provider.ts

export interface StreamParseInput<T> {
  rawOutput: string;
  command: string;
  schema: ZodSchema<T>;
  systemPrompt?: string;
  template?: DynamicView;     // Optional template for guidance
}

export interface LLMProvider {
  name: string;
  parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>>;
  parseImage<T>(input: ParseImageInput<T>): Promise<ParseResult<T>>;

  // NEW: Streaming parse — yields text deltas
  streamParse?<T>(input: StreamParseInput<T>): AsyncGenerator<string>;
}
```

The `streamParse` method yields raw text deltas from the LLM. The caller accumulates them and
uses `parsePartialJson` to extract the growing object.

### OpenAI Streaming Implementation

```typescript
// server/src/llm/providers/openai.ts (addition)

async *streamParse<T>(input: StreamParseInput<T>): AsyncGenerator<string> {
  const response = await this.client.chat.completions.create({
    model: this.model,
    messages: [
      { role: 'system', content: input.systemPrompt ?? DYNAMIC_UI_SYSTEM_PROMPT },
      { role: 'user', content: buildDynamicUIPrompt(input) },
    ],
    response_format: zodResponseFormat(input.schema, 'dynamic_view'),
    stream: true,
  });

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}
```

### DynamicUIGenerator Service

```typescript
// server/src/dynamic-ui/generator.ts (core streaming logic)

async *generateStreaming(input: GenerateInput): AsyncGenerator<DynamicUIChunk> {
  const startTime = Date.now();

  // 1. Check cache
  const cacheKey = this.hashKey(input.tool, input.rawOutput);
  const cached = this.cache.get(cacheKey);
  if (cached) {
    yield { type: 'complete', view: cached.view, meta: { ...cached.meta, cached: true } };
    return;
  }

  // 2. Find template
  const template = this.templateLibrary.findMatch(input.tool, input.command);

  // 3. Get raw output (if not provided, exec the command)
  let rawOutput = input.rawOutput;
  if (!rawOutput && input.command) {
    rawOutput = await this.execCommand(input.serverId, input.command);
  }

  // 4. Stream LLM response
  let accumulatedText = '';
  let lastParsedView: DeepPartial<DynamicView> | undefined;

  const stream = this.llm.streamParse!({
    rawOutput: rawOutput!,
    command: input.command ?? input.tool,
    schema: DynamicViewSchema,
    systemPrompt: DYNAMIC_UI_SYSTEM_PROMPT,
    template: template?.schema,
  });

  for await (const textDelta of stream) {
    accumulatedText += textDelta;

    const { value, state } = parsePartialJson(accumulatedText);
    if (state === 'failed-parse' || !value) continue;

    // Skip if identical to last parse (whitespace-only delta)
    if (isDeepEqualData(lastParsedView, value)) continue;

    lastParsedView = value as DeepPartial<DynamicView>;
    yield { type: 'partial', view: lastParsedView };
  }

  // 5. Validate final result
  try {
    const validated = DynamicViewSchema.parse(lastParsedView);
    const latencyMs = Date.now() - startTime;
    this.cache.set(cacheKey, { view: validated, meta: { latencyMs } });
    yield {
      type: 'complete',
      view: validated,
      meta: { latencyMs, templateId: template?.id, cached: false },
    };
  } catch (err) {
    yield {
      type: 'error',
      message: err instanceof Error ? err.message : 'Validation failed',
      partialView: lastParsedView,
    };
  }
}
```

---

## 12. Patterns to Adopt vs Avoid

### ADOPT (proven patterns from reference projects)

| Pattern | Source | Why |
|---------|--------|-----|
| Simple `Map<string, Component>` widget registry | Grafana | Zero overhead, extensible, type-safe with generics |
| Recursive single-entry-point renderer | rjsf | Clean dispatch, avoids scattered switch statements |
| `fixJson` state machine for partial JSON | Vercel AI | Only proven solution for streaming JSON repair — regex approaches fail on nested structures |
| `isDeepEqualData` dedup before re-render | Vercel AI | Prevents needless React re-renders during streaming (many deltas produce same parsed structure) |
| `DeepPartial<T>` type for streaming state | Vercel AI | Type-safe progressive rendering — know exactly what might be undefined |
| Transport abstraction (typed protocol) | Vercel AI | Makes testing easy — mock the transport, test the pipeline |
| Template library for consistency | rjsf themes | LLM-only generation is inconsistent; templates give a baseline |
| Entrance animations for progressive build | Grafana LazyLoader | `IntersectionObserver` + fade-in creates the "magical" progressive build effect |

### AVOID (anti-patterns from reference projects)

| Anti-Pattern | Source | Why We Skip It |
|-------------|--------|----------------|
| Class-based scene graph (`SceneObject` base class, 453 lines) | Grafana | Functional React + Zustand is simpler, our widgets are stateless renderers |
| RxJS observables for state | Grafana | We use Zustand — no need for another reactive primitive |
| Event bus bubbling through tree | Grafana | Overkill for display-only widgets; React props + Zustand handles our needs |
| React Context for registry (`RegistryContext`) | rjsf | Context re-renders entire subtree on registry change; Map is static |
| Deep generics on everything (`<T, S, F>`) | rjsf | Our schemas are Zod-derived, generics add complexity without benefit |
| Class components | rjsf | React 19 functional components only |
| SSE transport | Vercel AI | We already have WebSocket — SSE would add complexity |
| SWR for streaming state | Vercel AI | We use Zustand consistently across the app |
| lodash dependency | rjsf | Our `cn()` + native JS covers all needs |
| `dangerouslySetInnerHTML` for any content | General | AGENTS.md rule — terminal output through xterm.js only |

---

## 13. File-by-File Build Plan

### Phase 1: Foundation (EX1.1 → EX1.6)

Build order follows the dependency graph from phase-ex1.md:

```
Step 1: EX1.1 — Schema + Streaming Utilities
  shared/schemas/dynamic-view.ts              ← Zod schema (from phase-ex1.md)
  shared/schemas/dynamic-ui-protocol.ts       ← WebSocket protocol types
  shared/schemas/index.ts                     ← Re-exports
  shared/lib/streaming/fix-json.ts            ← Port from Vercel AI SDK
  shared/lib/streaming/parse-partial-json.ts  ← Simplified port
  shared/lib/streaming/is-deep-equal-data.ts  ← Port from Vercel AI SDK
  shared/lib/streaming/deep-partial.ts        ← Simplified type
  shared/lib/streaming/index.ts               ← Re-exports
  Tests:
    server/tests/parsers/dynamic-view-schema.test.ts
    shared/lib/streaming/__tests__/fix-json.test.ts
    shared/lib/streaming/__tests__/parse-partial-json.test.ts

Step 2: EX1.2 — Widget Registry + Renderer + Base Widgets
  client/src/components/DynamicUI/widget-registry.ts
  client/src/components/DynamicUI/register-widgets.ts
  client/src/components/DynamicUI/DynamicViewRenderer.tsx
  client/src/components/DynamicUI/LayoutRenderer.tsx
  client/src/components/DynamicUI/WidgetRenderer.tsx
  client/src/components/DynamicUI/layouts/StackLayout.tsx
  client/src/components/DynamicUI/layouts/GridLayout.tsx
  client/src/components/DynamicUI/widgets/TableWidget.tsx
  client/src/components/DynamicUI/widgets/KeyValueWidget.tsx
  client/src/components/DynamicUI/widgets/BadgeGridWidget.tsx
  client/src/components/DynamicUI/widgets/StatCardWidget.tsx
  client/src/components/DynamicUI/widgets/ProgressBarWidget.tsx
  client/src/components/DynamicUI/widgets/CodeBlockWidget.tsx
  client/src/components/DynamicUI/widgets/AlertWidget.tsx
  Tests:
    client/tests/components/DynamicUI/WidgetRenderer.test.tsx
    client/tests/components/DynamicUI/widgets/*.test.tsx

Step 3: EX1.3 — AppWindow Wrapper
  client/src/components/DynamicUI/DynamicAppWindow.tsx
  Tests:
    client/tests/components/DynamicUI/DynamicAppWindow.test.tsx

Step 4: EX1.4 — JSON Playground
  client/src/components/DynamicUI/DynamicUIPlayground.tsx
  (Register in app registry)

Step 5: EX1.5 — Extended Widgets
  client/src/components/DynamicUI/widgets/ChartWidget.tsx
  client/src/components/DynamicUI/widgets/TreeWidget.tsx
  client/src/components/DynamicUI/widgets/LogViewerWidget.tsx
  (Update register-widgets.ts)
  Tests for each

Step 6: EX1.6 — Tab + Sidebar Layouts
  client/src/components/DynamicUI/layouts/TabsLayout.tsx
  client/src/components/DynamicUI/layouts/SidebarLayout.tsx
  Tests for each
```

### Phase 2: LLM Generation (EX1.7 → EX1.10)

```
Step 7: EX1.7 — Template Library
  server/src/dynamic-ui/template-library.ts
  server/src/dynamic-ui/templates/types.ts
  server/src/dynamic-ui/templates/system-overview.ts
  server/src/dynamic-ui/templates/package-list.ts
  ... (15+ templates)
  Tests:
    server/tests/dynamic-ui/template-library.test.ts

Step 8: EX1.8 — Generator Service + WebSocket + Streaming Hook
  server/src/dynamic-ui/generator.ts           ← DynamicUIGenerator (BaseService)
  server/src/routes/dynamic-ui.ts              ← WebSocket + REST endpoints
  server/src/llm/provider.ts                   ← Add streamParse method
  server/src/llm/providers/openai.ts           ← Implement streaming
  client/src/store/dynamic-ui-store.ts         ← Zustand store
  client/src/hooks/useStreamedView.ts          ← Streaming hook
  client/src/hooks/useDynamicUIWebSocket.ts    ← WebSocket connection
  Tests:
    server/tests/dynamic-ui/generator.test.ts
    client/tests/hooks/useStreamedView.test.ts

Step 9: EX1.9 — Command Palette Integration
  (Modify existing Command Palette component)
  client/src/components/DynamicUI/DynamicUICommand.tsx

Step 10: EX1.10 — Schema Caching
  server/src/dynamic-ui/schema-cache.ts
  Tests:
    server/tests/dynamic-ui/schema-cache.test.ts
```

### Phase 3: Full Integration (EX1.11 → EX1.14)

```
Step 11: EX1.11 — Terminal Buffer Capture
Step 12: EX1.12 — Live Data Refresh (dataSource field)
Step 13: EX1.13 — Desktop Tab Integration
Step 14: EX1.14 — Action Execution from Dynamic UI
```

---

## 14. Reference File Map

Quick reference for the source files we studied and what to take from each:

### Grafana Scenes (`temp/grafana-scenes/`)

| File | What We Learn |
|------|---------------|
| `packages/scenes/src/core/types.ts` | `SceneObjectState` interface — inspiration for our schema shape |
| `packages/scenes/src/components/VizPanel/registerRuntimePanelPlugin.ts` | Simple `Map` registry — our widget-registry.ts pattern |
| `packages/scenes/src/core/SceneComponentWrapper.tsx` | 30-line component that dispatches model → React component. Our `WidgetRenderer` is the same idea. |
| `packages/scenes/src/components/VizPanel/VizPanelRenderer.tsx` | Plugin dispatch: `pluginId` → `getPlugin()` → `PanelComponent`. Shows the full lookup chain. |
| `packages/scenes/src/components/SceneFlexLayout.tsx` | CSS flexbox layout with `direction` prop — our `StackLayout` |
| `packages/scenes/src/components/layout/CSSGrid/` | Native CSS Grid — our `GridLayout` |
| `packages/scenes/src/components/LazyLoader.tsx` | IntersectionObserver for deferred rendering — consider for large widget lists |

### react-jsonschema-form (`temp/react-jsonschema-form/`)

| File | What We Learn |
|------|---------------|
| `packages/utils/src/getWidget.tsx` | `widgetMap`: static lookup table for type→widget dispatch |
| `packages/core/src/components/fields/SchemaField.tsx` | Single entry point that dispatches by schema type — our `WidgetRenderer` |
| `packages/core/src/components/Form.tsx` | Registry construction with three-layer merge (defaults ← theme ← props) |
| `packages/utils/src/registry.ts` | Field/widget/template merging logic |

### Vercel AI SDK (`temp/vercel-ai-sdk/`)

| File | What We Learn |
|------|---------------|
| `packages/ai/src/util/fix-json.ts` | **PORT THIS** — 402-line state machine for partial JSON repair |
| `packages/ai/src/util/fix-json.test.ts` | **PORT THIS** — comprehensive test cases for the fixer |
| `packages/ai/src/util/parse-partial-json.ts` | **REWRITE** — simple try/catch wrapper around fixJson |
| `packages/ai/src/util/is-deep-equal-data.ts` | **PORT THIS** — prevents redundant re-renders |
| `packages/ai/src/util/is-deep-equal-data.test.ts` | **PORT THIS** — test cases |
| `packages/ai/src/util/deep-partial.ts` | **SIMPLIFY** — remove FlexibleSchema deps, keep core type |
| `packages/react/src/use-object.ts` | Inspiration for `useStreamedView` — accumulate + parse + SWR mutate (we use Zustand instead) |
| `packages/ai/src/core/generate-object/stream-object.ts` | Core streaming logic — accumulate text deltas → parsePartialJson → emit |

---

## Summary: The 5 Core Insights

1. **Widget registry = simple Map** (from Grafana). No class hierarchy, no DI, no middleware.
   Register components by string key, look them up with `Map.get()`.

2. **Recursive single-entry-point renderer** (from rjsf). `LayoutRenderer` dispatches by layout type,
   `WidgetRenderer` dispatches by widget type, layouts recurse back to `WidgetRenderer` for children.

3. **Port the streaming pipeline** (from Vercel AI SDK). Four files solve the hard problem:
   `fixJson` repairs incomplete JSON, `parsePartialJson` tries parse then repair,
   `isDeepEqualData` prevents redundant renders, `DeepPartial<T>` types the intermediate state.

4. **WebSocket transport with typed protocol** (adapted from Vercel's `ChatTransport`).
   Discriminated union chunks (`partial | complete | error`), multiplexed by `requestId`.

5. **Template library for consistency** (inspired by rjsf's theme system). LLM customizes
   pre-built templates for known tools, generates from scratch for unknown ones. Templates
   validate against the same `DynamicViewSchema` — they're just example instances.
