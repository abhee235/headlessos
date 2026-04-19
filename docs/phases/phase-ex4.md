# Phase EX4: LLM Observatory — Embedded Trace & Span Debugger

> **Milestone:** EX4 | **Est. Effort:** Large (5 sub-phases, 16 tasks) | **Depends on:** EX2 (UI Agent), M4.8 (LLM Usage Stats)
>
> Build an embedded, Phoenix-inspired **LLM Observatory** inside HeadlessOS — a self-contained, zero-dependency tracing and debugging system that captures every LLM call as a **trace tree** (traces → spans → child spans), stores prompts/responses/tokens/costs, and renders an interactive tree-view UI for debugging agent sessions.
>
> **Zero external services.** Everything is in-process, in-memory, localhost only.

---

## Guiding Principles

1. **Zero overhead.** Tracing is pure in-memory Map operations (~0.01ms per span start/end) vs LLM calls (1-10s). Must never block the main thread or slow down agent execution.

2. **Zero dependencies.** No OpenTelemetry, no Langfuse, no external services. The TraceStore is an in-memory ring buffer with REST + WebSocket APIs.

3. **Hierarchical, not flat.** Every LLM interaction is a **span** within a **trace**. Agent sessions create parent→child→grandchild hierarchies (session → plan/execute/reflect → individual LLM calls → tool executions).

4. **Content-rich.** Each span stores its input (prompt/messages) and output (response/schema), not just tokens and timing. This enables debugging what the LLM saw and what it produced.

5. **Phoenix-inspired UI.** Tree view with expandable spans, timeline bars showing relative duration, color-coded span kinds, and a detail panel showing inputs/outputs/assessments per span. Modeled after Arize Phoenix's trace tree.

---

## Research Context

### Phoenix Architecture (Reference — NOT a dependency)

Deep analysis of [Arize Phoenix](https://github.com/Arize-AI/phoenix) codebase informed the design:

- **Data Models:** Trace (collection of spans), Span (individual operation with kind, status, tokens, cost, parent reference), SpanCost (per-model pricing), cumulative token rollup at write time
- **Span Kinds:** LLM, CHAIN, TOOL, AGENT, RETRIEVER, EMBEDDING, EVALUATOR, GUARDRAIL, RERANKER
- **GUI:** TraceTree.tsx (recursive tree with timeline bars), SpanDetails.tsx (per-kind detail views), TracesTable.tsx (filterable list)
- **Key Insight:** Cumulative tokens (own + all descendants) are computed at span-end time by walking the parent chain — not by querying at read time

### HeadlessOS Current State (Gaps)

| Feature | Current | Needed |
|---------|---------|--------|
| LLM call tracking | Flat `UsageEntry[]` in `LLMUsageTracker` | Hierarchical trace → span tree |
| Call content | Not stored (only tokens/latency/model) | Full prompt/response per span |
| Per-session breakdown | None (global aggregate only) | Per-trace totals, per-span detail |
| API | `GET /api/stats/llm` (aggregate only) | Per-trace, per-span REST + WS |
| UI | None (stats are API-only) | Interactive trace tree + detail panel |

### Instrumentation Points

These are the code paths that will create spans:

| Component | Span Kind | Parent |
|-----------|-----------|--------|
| `UIAgent.run()` | AGENT (root) | — (creates trace) |
| `Planner.plan()` | CHAIN | AGENT |
| `ReactiveExecutor.execute()` | CHAIN | AGENT |
| `PostGenerationReflector.reflect()` | CHAIN | AGENT |
| `ModelRouter.reason()` | LLM | parent CHAIN |
| `ModelRouter.chat()` | LLM | parent CHAIN |
| `ModelRouter.fast()` | LLM | parent CHAIN |
| `ModelRouter.summarize()` | LLM | parent CHAIN |
| `DynamicUIGenerator.generate()` | CHAIN (root) | — (creates trace) |
| `DesignClassifier.classify()` | LLM | CHAIN |
| Tool executions (exec_command, etc.) | TOOL | LLM |
| `InvestigationAgent.run()` | AGENT (root) | — (creates trace) |

---

## Sub-Phase Overview

| Sub-Phase | Focus | Tasks | Key Outcome |
|-----------|-------|-------|-------------|
| **EX4-A** | **Data Models & TraceStore** | 3 tasks | Zod schemas, in-memory ring buffer, AsyncLocalStorage context |
| **EX4-B** | **Instrumentation** | 3 tasks | ModelRouter, Agent pipeline, DynamicUIGenerator all emit spans |
| **EX4-C** | **Backend API** | 2 tasks | REST endpoints + WebSocket live trace streaming |
| **EX4-D** | **Frontend: Trace List & Stats** | 3 tasks | Observatory app window, trace list, global stats dashboard |
| **EX4-E** | **Frontend: Trace Tree & Detail** | 5 tasks | Recursive trace tree, span detail panel, timeline bars, content viewer |

### Execution Order

```
EX4-A (data models + store + context) ──────────────────+
                                                         v
EX4-B (instrument ModelRouter + Agent + Generator) ─────+
                                                         v
EX4-C (REST + WebSocket API) ───────────────────────────+
                                                         v
EX4-D (trace list + stats dashboard) ───────────────────+
EX4-E (trace tree + detail panel) ─────────────────────  + parallel
```

> **Gate:** EX4-A must be complete before EX4-B. EX4-B must be complete before EX4-C. EX4-D and EX4-E can be done in parallel after EX4-C.

---

## Sub-Phase EX4-A: Data Models & TraceStore

> Foundation: Zod schemas for traces/spans, in-memory storage with ring buffer eviction, and AsyncLocalStorage-based context propagation for automatic parent-child span linking.

---

### EX4-A.1: Trace & Span Zod Schemas

**File:** `shared/schemas/observatory.ts`

Define the core data models as Zod schemas (single source of truth for types + validation + API responses).

```typescript
// === Span Kinds ===
export const SpanKindSchema = z.enum([
  'LLM',       // Individual LLM call (prompt → response)
  'AGENT',     // Top-level agent session (UIAgent, InvestigationAgent)
  'CHAIN',     // Pipeline phase (plan, execute, reflect, classify, generate)
  'TOOL',      // Tool execution (exec_command, read_file, etc.)
]);
export type SpanKind = z.infer<typeof SpanKindSchema>;

// === Span Status ===
export const SpanStatusSchema = z.enum([
  'RUNNING',   // Span is active
  'OK',        // Completed successfully
  'ERROR',     // Completed with error
]);
export type SpanStatus = z.infer<typeof SpanStatusSchema>;

// === Token Usage (per-span) ===
export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),     // input + output
}).strict();
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

// === Cumulative Usage (own + all descendants) ===
export const CumulativeUsageSchema = z.object({
  tokenUsage: TokenUsageSchema,
  costUsd: z.number().nonnegative(),
  spanCount: z.number().int().positive(),           // includes self
}).strict();
export type CumulativeUsage = z.infer<typeof CumulativeUsageSchema>;

// === Span (individual operation) ===
export const SpanSchema = z.object({
  spanId: z.string().uuid(),
  traceId: z.string().uuid(),
  parentSpanId: z.string().uuid().nullable(),       // null = root span
  name: z.string(),                                  // e.g. "ModelRouter.reason", "exec_command(df -h)"
  kind: SpanKindSchema,
  status: SpanStatusSchema,
  startTime: z.string().datetime(),
  endTime: z.string().datetime().nullable(),         // null while RUNNING
  latencyMs: z.number().nonnegative().nullable(),    // computed at end
  // LLM-specific fields (only for kind=LLM)
  model: z.string().nullable(),                      // e.g. "gpt-4.1"
  modelRole: z.enum(['reasoning', 'structured-output', 'fast', 'weak']).nullable(),
  tokenUsage: TokenUsageSchema.nullable(),           // own tokens (LLM spans only)
  costUsd: z.number().nonnegative().nullable(),      // own cost
  // Content (lazy-serialized — only populated when detail is requested)
  input: z.unknown().nullable(),                     // prompt/messages (stored as reference)
  output: z.unknown().nullable(),                    // response/parsed result
  // Error
  error: z.string().nullable(),
  // Cumulative (own + descendants — computed at span end)
  cumulative: CumulativeUsageSchema.nullable(),
  // Metadata
  attributes: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type Span = z.infer<typeof SpanSchema>;

// === Trace (collection of spans, always has exactly one root span) ===
export const TraceSchema = z.object({
  traceId: z.string().uuid(),
  rootSpanId: z.string().uuid(),
  name: z.string(),                                  // e.g. "UIAgent: docker overview"
  status: SpanStatusSchema,                          // derived from root span
  startTime: z.string().datetime(),
  endTime: z.string().datetime().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  // Aggregates (from root span cumulative)
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  totalSpans: z.number().int().positive(),
  spansByKind: z.record(SpanKindSchema, z.number().int().nonnegative()),
  // Context
  serverId: z.string().nullable(),                   // which server this trace is for
  trigger: z.enum(['ui-agent', 'investigation-agent', 'dynamic-ui', 'api']).nullable(),
}).strict();
export type Trace = z.infer<typeof TraceSchema>;

// === Trace Summary (for list views — no span content) ===
export const TraceSummarySchema = TraceSchema.omit({});  // Same shape, used for listing
export type TraceSummary = z.infer<typeof TraceSummarySchema>;

// === Span Tree Node (for tree rendering) ===
export const SpanTreeNodeSchema: z.ZodType<SpanTreeNode> = z.lazy(() =>
  z.object({
    span: SpanSchema,
    children: z.array(SpanTreeNodeSchema),
  })
);
export type SpanTreeNode = {
  span: Span;
  children: SpanTreeNode[];
};

// === Observatory Stats (global) ===
export const ObservatoryStatsSchema = z.object({
  totalTraces: z.number().int().nonnegative(),
  totalSpans: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  averageLatencyMs: z.number().nonnegative(),
  tracesByTrigger: z.record(z.string(), z.number().int().nonnegative()),
  spansByKind: z.record(z.string(), z.number().int().nonnegative()),
  tokensByModel: z.record(z.string(), z.number().int().nonnegative()),
  costByModel: z.record(z.string(), z.number().nonnegative()),
  recentTraces: z.array(TraceSummarySchema),         // last 10
}).strict();
export type ObservatoryStats = z.infer<typeof ObservatoryStatsSchema>;
```

**Verification:**
- Schema compiles with `tsc --noEmit`
- All types derived via `z.infer<>`
- `SpanTreeNodeSchema` handles recursive tree via `z.lazy()`
- 15+ unit tests covering schema validation, edge cases, recursive tree

**Est. Tests:** 15

---

### EX4-A.2: TraceStore (In-Memory Ring Buffer)

**File:** `server/src/observatory/trace-store.ts`

In-memory storage with bounded capacity. Ring buffer evicts oldest traces when full.

```typescript
export class TraceStore {
  private traces: Map<string, Trace>;          // traceId → Trace
  private spans: Map<string, Span>;            // spanId → Span
  private traceSpans: Map<string, Set<string>>; // traceId → Set<spanId>
  private traceOrder: string[];                 // FIFO for eviction
  private readonly maxTraces: number;           // default 200

  // Write operations (called by instrumentation)
  startTrace(traceId: string, name: string, serverId?: string, trigger?: string): Trace;
  endTrace(traceId: string): Trace;
  startSpan(opts: StartSpanOpts): Span;
  endSpan(spanId: string, result?: SpanResult): Span;

  // Read operations (called by API routes)
  getTrace(traceId: string): Trace | undefined;
  getTraceSpans(traceId: string): Span[];
  getSpan(spanId: string): Span | undefined;
  getSpanTree(traceId: string): SpanTreeNode | undefined;  // build tree from flat spans
  listTraces(opts?: ListOpts): TraceSummary[];               // paginated, filterable
  getStats(): ObservatoryStats;

  // Lifecycle
  clear(): void;
  getSize(): { traces: number; spans: number; memoryEstimateBytes: number };
}
```

**Key Design:**
- **Ring buffer:** When `traces.size >= maxTraces`, evict oldest trace (and all its spans) before inserting new one. O(1) amortized via `traceOrder` array.
- **Cumulative rollup at span end:** When `endSpan()` is called, walk up parent chain to root, updating `cumulative.tokenUsage`, `cumulative.costUsd`, `cumulative.spanCount` at each ancestor. This is the Phoenix pattern — compute at write time, not read time.
- **Tree building:** `getSpanTree()` builds a recursive tree from flat spans by iterating once and grouping by `parentSpanId`. Same algorithm as Phoenix `createSpanTree()`.
- **Content storage:** `input` and `output` on spans are stored as references (not deep copies). Serialized to JSON only when API requests span detail.
- **Thread safety:** Node.js is single-threaded, so no locking needed. All operations are synchronous in-memory Map operations.

**Verification:**
- Ring buffer eviction works correctly at capacity
- Cumulative rollup propagates tokens/cost up parent chain
- Tree building produces correct hierarchy from flat spans
- Memory estimate is reasonable (< 50MB for 200 traces)
- 20+ unit tests

**Est. Tests:** 20

---

### EX4-A.3: Instrumentation Context (AsyncLocalStorage)

**File:** `server/src/observatory/context.ts`

Provides automatic parent-child span linking using Node.js `AsyncLocalStorage`. Any code running inside a span automatically becomes a child of that span.

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

interface ObservatoryContext {
  traceId: string;
  spanId: string;       // current active span
}

const storage = new AsyncLocalStorage<ObservatoryContext>();

// Run a function within a new trace (creates root span)
export function withTrace<T>(
  name: string,
  opts: TraceOpts,
  fn: () => T | Promise<T>
): T | Promise<T>;

// Run a function within a child span of the current context
export function withSpan<T>(
  name: string,
  kind: SpanKind,
  fn: () => T | Promise<T>
): T | Promise<T>;

// Get current context (for manual span creation)
export function currentContext(): ObservatoryContext | undefined;

// Get the TraceStore singleton
export function getTraceStore(): TraceStore;
```

**How it works:**
1. `withTrace('UIAgent: docker', { trigger: 'ui-agent' }, async () => { ... })` creates a new Trace + root AGENT span, sets `{ traceId, spanId }` in AsyncLocalStorage, runs `fn()`.
2. Inside `fn()`, calling `withSpan('Planner.plan', 'CHAIN', async () => { ... })` reads the current context, creates a child span with `parentSpanId = context.spanId`, and pushes a new context.
3. Deep inside the chain, `ModelRouter.reason()` calls `withSpan('ModelRouter.reason', 'LLM', async () => { ... })` — automatically becomes a child of the CHAIN span.
4. When each `fn()` returns (or throws), the span is ended, cumulative rollup runs, and the context pops back.

**Key Design:**
- AsyncLocalStorage is Node.js native (zero-overhead, used by major frameworks like Next.js/Fastify)
- No manual parent tracking needed — the context propagates automatically through async call stacks
- If no context exists (code running outside a trace), `withSpan` is a no-op pass-through — zero overhead for non-traced code paths
- Works with `Promise`, `async/await`, and sync functions

**Verification:**
- Nested `withSpan` calls create correct parent-child hierarchy
- Context propagates through `async/await` boundaries
- No-context fallback works (no trace = transparent pass-through)
- Error in `fn()` properly ends span with ERROR status
- 10+ unit tests

**Est. Tests:** 10

---

## Sub-Phase EX4-B: Instrumentation

> Wire the `withTrace()`/`withSpan()` wrappers into actual LLM call sites. After this phase, every LLM call in the system creates spans in the TraceStore.

---

### EX4-B.1: Instrument ModelRouter

**File modified:** `server/src/llm/model-router.ts`

Wrap each public method (`reason`, `chat`, `fast`, `summarize`) in `withSpan()`:

```typescript
// Before:
async reason<T>(input: ReasonInput<T>): Promise<ParseResult<T>> {
  const result = await this.reasoningProvider.parseStructured(/* ... */);
  this.trackUsage(/* ... */);
  return result;
}

// After:
async reason<T>(input: ReasonInput<T>): Promise<ParseResult<T>> {
  return withSpan(`ModelRouter.reason`, 'LLM', async () => {
    const result = await this.reasoningProvider.parseStructured(/* ... */);
    this.trackUsage(/* ... */);
    // Record span detail
    const span = currentSpan();
    if (span) {
      setSpanAttributes(span.spanId, {
        model: result.model,
        modelRole: 'reasoning',
        tokenUsage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, totalTokens: result.inputTokens + result.outputTokens },
        costUsd: this.calculateCost(result),
        input: input.prompt || input.messages,   // stored as reference
        output: result.data,                      // stored as reference
      });
    }
    return result;
  });
}
```

Same pattern for `chat()`, `fast()`, `summarize()`. The existing `usageTracker.recordCall()` continues working — spans are additive, not replacing the existing tracking.

**Verification:**
- Every `ModelRouter` method creates an LLM span when called within a trace context
- Spans have correct model, role, token usage, cost
- Input/output are captured as references
- Existing `LLMUsageTracker` still works unchanged
- 8+ unit tests

**Est. Tests:** 8

---

### EX4-B.2: Instrument Agent Pipeline

**Files modified:** `server/src/agent/ui-agent.ts`, `server/src/agent/executor.ts`, `server/src/agent/planner.ts`, `server/src/agent/reflector.ts`, `server/src/agent/investigation-agent.ts`

**UIAgent.run():**
```typescript
// Wrap entire session in a trace
async *run(request: string, serverId: string): AsyncGenerator<UIAgentEvent> {
  yield* withTrace(`UIAgent: ${request.slice(0, 50)}`, {
    trigger: 'ui-agent',
    serverId,
  }, async function*() {
    // Plan phase → withSpan('Planner.plan', 'CHAIN', ...)
    // Execute phase → withSpan('ReactiveExecutor.execute', 'CHAIN', ...)
    // Reflect phase → withSpan('PostReflector.reflect', 'CHAIN', ...)
  });
}
```

**ReactiveExecutor.execute():**
```typescript
// Each tool-calling iteration → child span
async *execute(messages, plannerHints): AsyncGenerator<AgentEvent> {
  return withSpan('ReactiveExecutor', 'CHAIN', async function*() {
    for (let step = 0; step < maxSteps; step++) {
      // ModelRouter.chat() → automatically creates LLM child span
      // Each tool call → withSpan(`tool:${toolName}`, 'TOOL', ...)
    }
  });
}
```

**InvestigationAgent.run():**
```typescript
// Wrap in separate trace
async *investigate(question, serverId): AsyncGenerator<AgentEvent> {
  yield* withTrace(`Investigation: ${question.slice(0, 50)}`, {
    trigger: 'investigation-agent',
    serverId,
  }, async function*() {
    // ReAct loop iterations → child spans
  });
}
```

**Verification:**
- Agent session creates a complete trace with AGENT root span
- Plan/Execute/Reflect are CHAIN child spans
- Individual LLM calls within each phase are LLM grandchild spans
- Tool executions are TOOL spans under the LLM that requested them
- InvestigationAgent creates its own separate traces
- 8+ unit tests

**Est. Tests:** 8

---

### EX4-B.3: Instrument DynamicUIGenerator

**Files modified:** `server/src/dynamic-ui/generator.ts`, `server/src/dynamic-ui/classifier.ts`

```typescript
// DynamicUIGenerator.generate():
async generate(input: GenerateInput): Promise<GenerateResult> {
  return withTrace(`DynamicUI: ${input.tool || input.command}`, {
    trigger: 'dynamic-ui',
    serverId: input.serverId,
  }, async () => {
    // Pass 1: classify → withSpan('DesignClassifier.classify', 'CHAIN', ...)
    //   Inside: ModelRouter.fast() → LLM span auto-created
    // Pass 2: generate → withSpan('LLMGenerate', 'LLM', ...)
    //   Records full prompt + response
  });
}
```

**Verification:**
- `generate()` creates a trace with CHAIN root
- Classifier and generator are child spans
- LLM calls within each are LLM grandchild spans
- Template matches skip LLM generation (fewer spans)
- 5+ unit tests

**Est. Tests:** 5

---

## Sub-Phase EX4-C: Backend API

> REST endpoints and WebSocket events for the frontend to consume trace data.

---

### EX4-C.1: Observatory REST Routes

**File:** `server/src/routes/observatory.ts`

```typescript
// Trace list (paginated, filterable)
GET /api/observatory/traces
  ?limit=50&offset=0
  &trigger=ui-agent|investigation-agent|dynamic-ui
  &status=OK|ERROR|RUNNING
  &serverId=<uuid>
  → { traces: TraceSummary[], total: number }

// Single trace with full span tree
GET /api/observatory/traces/:traceId
  → { trace: Trace, spanTree: SpanTreeNode }

// Single span detail (with input/output content)
GET /api/observatory/spans/:spanId
  → { span: Span }  // input/output serialized to JSON here

// Global observatory stats
GET /api/observatory/stats
  → ObservatoryStats

// Clear all traces
POST /api/observatory/clear
  → { success: true }
```

**Key Design:**
- Span `input`/`output` are serialized to JSON only when the detail endpoint is called (lazy serialization — avoids serializing all spans on list/tree requests)
- List endpoint returns `TraceSummary` (no span content)
- Tree endpoint returns full hierarchy but without span `input`/`output` (set to `null`)
- Only the single-span detail endpoint populates `input`/`output`

**Verification:**
- All endpoints return Zod-valid responses
- Pagination works correctly
- Filtering by trigger/status/serverId works
- Lazy serialization: list/tree responses don't include span content
- 10+ unit tests (route tests with mocked TraceStore)

**Est. Tests:** 10

---

### EX4-C.2: WebSocket Live Trace Events

**File:** Extend `server/src/routes/observatory.ts` (or new WebSocket route)

```typescript
// WebSocket endpoint for live trace updates
WS /ws/observatory

// Events sent to client:
{ type: 'trace:start', trace: TraceSummary }
{ type: 'trace:end', trace: TraceSummary }
{ type: 'span:start', traceId: string, span: SpanSummary }
{ type: 'span:end', traceId: string, span: SpanSummary }
```

**Key Design:**
- TraceStore emits events (EventEmitter pattern) when traces/spans start/end
- WebSocket route subscribes to these events and broadcasts to connected clients
- Events include summary data only (no input/output — client fetches detail on-demand)
- Clients can watch all traces or subscribe to a specific traceId
- Fire-and-forget: if no clients are connected, events are silently dropped

**Verification:**
- WebSocket connection receives trace/span events in real-time
- Events arrive within 10ms of span start/end (negligible delay)
- Multiple clients receive same events
- Disconnected clients don't cause errors
- 5+ unit tests

**Est. Tests:** 5

---

## Sub-Phase EX4-D: Frontend — Trace List & Stats

> The Observatory app window with a list of traces and global LLM stats.

---

### EX4-D.1: Observatory App Registration

**Files:**
- `client/src/components/Observatory/` — new directory
- Register in app registry with icon, window config

Register "LLM Observatory" as a desktop app:
- **Icon:** Lucide `Activity` or `Scan` icon (or custom SVG)
- **Window:** Opens as `AppWindow` (full overlay, not embedded)
- **SingleInstance:** true (only one Observatory window)
- **Location:** Accessible from Start Menu → system apps, and Command Palette

**Verification:**
- App appears in Start Menu and Command Palette
- Opens as AppWindow overlay
- Single instance enforced
- 3+ tests

**Est. Tests:** 3

---

### EX4-D.2: Trace List View

**File:** `client/src/components/Observatory/TraceListView.tsx`

A table/list of all traces, sorted by most recent. Columns:

| Column | Content |
|--------|---------|
| Status | Colored dot (green=OK, red=ERROR, blue=RUNNING) |
| Name | Trace name (e.g. "UIAgent: docker overview") |
| Trigger | Badge (ui-agent / investigation / dynamic-ui) |
| Spans | Count of total spans |
| Tokens | Total tokens (formatted: "12.4k") |
| Cost | Estimated cost (formatted: "$0.03") |
| Latency | Duration (formatted: "2.3s") |
| Time | Relative timestamp ("2m ago") |

**Features:**
- Click a row → navigates to Trace Detail (EX4-E.1)
- Filter by trigger type (tabs or dropdown)
- Filter by status (OK/ERROR/RUNNING)
- Auto-refresh via WebSocket (new traces appear at top)
- Empty state: "No traces yet. Generate a Dynamic UI or run an agent to see traces here."

**Zustand Store:** `client/src/store/observatory-store.ts`
```typescript
interface ObservatoryState {
  traces: TraceSummary[];
  selectedTraceId: string | null;
  selectedSpanId: string | null;
  filters: { trigger?: string; status?: string };
  stats: ObservatoryStats | null;
  // Actions
  fetchTraces(): Promise<void>;
  fetchStats(): Promise<void>;
  selectTrace(traceId: string): void;
  selectSpan(spanId: string): void;
}
```

**Verification:**
- Traces load from API and display in table
- Filtering works (trigger, status)
- WebSocket updates add new traces in real-time
- Click navigates to trace detail
- 8+ tests

**Est. Tests:** 8

---

### EX4-D.3: Observatory Stats Dashboard

**File:** `client/src/components/Observatory/StatsPanel.tsx`

A stats panel (sidebar or top section) showing global observatory metrics:

- **Total Traces / Spans / Tokens / Cost** — stat-cards with large numbers
- **Tokens by Model** — horizontal bar chart (recharts)
- **Cost by Model** — horizontal bar chart
- **Traces by Trigger** — small donut/pie chart
- **Spans by Kind** — small donut/pie chart (LLM/CHAIN/TOOL/AGENT breakdown)
- **Average Latency** — stat-card

Uses the existing `ChartContainer` + recharts components from shadcn/ui.

**Verification:**
- Stats load from `GET /api/observatory/stats`
- Charts render correctly with theme colors
- Updates when new traces complete
- 5+ tests

**Est. Tests:** 5

---

## Sub-Phase EX4-E: Frontend — Trace Tree & Span Detail

> The core debugging experience: click a trace → see its full span tree with timeline bars → click a span → see its inputs/outputs.

---

### EX4-E.1: Trace Detail Layout

**File:** `client/src/components/Observatory/TraceDetailView.tsx`

When a trace is selected, the Observatory switches to a two-panel layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back to Traces    "UIAgent: docker overview"    ⏱ 4.2s  $0.05 │
├───────────────────────────────────┬──────────────────────────────┤
│                                   │                              │
│   TRACE TREE (left panel)        │   SPAN DETAIL (right panel)  │
│   (EX4-E.2)                      │   (EX4-E.4)                  │
│                                   │                              │
│   ▼ UIAgent: docker [AGENT]      │   Name: ModelRouter.reason   │
│     ▼ Planner.plan [CHAIN]       │   Kind: LLM                  │
│       ModelRouter.reason [LLM]   │   Model: o4-mini             │
│     ▼ ReactiveExecutor [CHAIN]   │   Role: reasoning            │
│       ModelRouter.chat [LLM] ←   │   Tokens: 1,240 → 380       │
│       tool:exec_command [TOOL]   │   Cost: $0.012               │
│       ModelRouter.chat [LLM]     │   Latency: 1.8s              │
│       tool:exec_command [TOOL]   │   ─────────────────────────── │
│       ModelRouter.chat [LLM]     │   INPUT:                     │
│       generate_schema [TOOL]     │   [system prompt...]          │
│     ▼ PostReflector [CHAIN]      │   [user message...]           │
│       ModelRouter.fast [LLM]     │   ─────────────────────────── │
│                                   │   OUTPUT:                    │
│   TIMELINE BAR (EX4-E.3)        │   { "data": ... }            │
│   |████████████████████████|     │                              │
│   0s         2s         4.2s     │                              │
│                                   │                              │
├───────────────────────────────────┴──────────────────────────────┤
│ Totals: 12 spans | 8,432 tokens | $0.05 | 4 LLM calls          │
└──────────────────────────────────────────────────────────────────┘
```

Uses `ResizablePanelGroup` with `ResizablePanel` + `ResizableHandle` for the two-panel layout.

**Verification:**
- Two-panel layout renders correctly
- Back button returns to trace list
- Trace header shows name, latency, cost
- Footer shows aggregate stats
- Resizable panels work
- 5+ tests

**Est. Tests:** 5

---

### EX4-E.2: Trace Tree Component

**File:** `client/src/components/Observatory/TraceTree.tsx`

Recursive tree component rendering the span hierarchy. Inspired by Phoenix's `TraceTree.tsx`.

**Per-span row:**
```
[▶/▼] [Icon] [Name]                    [tokens] [cost] [latency] [timeline bar]
```

- **Expand/Collapse:** Click chevron or span name to expand/collapse children
- **Icons:** Color-coded by SpanKind:
  - LLM → purple `Bot` icon
  - AGENT → blue `Brain` icon
  - CHAIN → gray `GitBranch` icon
  - TOOL → orange `Wrench` icon
- **Selected state:** Click selects span → highlights row, shows detail in right panel
- **Status indicator:** Small dot (green/red/blue) for OK/ERROR/RUNNING
- **Connector lines:** Vertical + horizontal lines connecting parent to children (CSS `border-left` + `::before` pseudo-elements)
- **Auto-expand:** Root span and first level are auto-expanded on load

**Tree Building:**
```typescript
function buildSpanTree(spans: Span[]): SpanTreeNode {
  const map = new Map<string, SpanTreeNode>();
  let root: SpanTreeNode;

  // Create nodes
  for (const span of spans) {
    map.set(span.spanId, { span, children: [] });
  }

  // Link parents
  for (const span of spans) {
    const node = map.get(span.spanId)!;
    if (span.parentSpanId) {
      map.get(span.parentSpanId)?.children.push(node);
    } else {
      root = node;
    }
  }

  // Sort children by startTime
  const sortChildren = (node: SpanTreeNode) => {
    node.children.sort((a, b) => a.span.startTime.localeCompare(b.span.startTime));
    node.children.forEach(sortChildren);
  };
  sortChildren(root!);

  return root!;
}
```

**Verification:**
- Tree renders correct hierarchy from API response
- Expand/collapse works
- Click selects span and updates detail panel
- Color-coded icons per SpanKind
- Connector lines render correctly
- 8+ tests

**Est. Tests:** 8

---

### EX4-E.3: Timeline Bars

**File:** `client/src/components/Observatory/TimelineBar.tsx`

Each span row in the tree includes a horizontal bar showing its duration relative to the trace total.

```
Trace total: |----------------------------------------| (0s → 4.2s)

UIAgent       |████████████████████████████████████████|
  Planner     |████████|
    reason    |████████|
  Executor              |████████████████████████|
    chat                |████████|
    tool                          |████|
    chat                                |████████|
    gen_schema                                    |██|
  Reflector                                            |████|
    fast                                               |████|
```

**Implementation:**
- Calculate `left%` as `(span.startTime - trace.startTime) / trace.latencyMs * 100`
- Calculate `width%` as `span.latencyMs / trace.latencyMs * 100`
- Render as a colored `<div>` with `position: absolute`, `left`, `width` in percent
- Color matches SpanKind (LLM=purple, CHAIN=gray, TOOL=orange, AGENT=blue)
- Minimum width of 2px for very short spans
- Hover tooltip shows exact start, end, duration

**Verification:**
- Bars align correctly with actual timing
- Colors match SpanKind
- Very short spans still visible (min-width)
- Hover shows timing detail
- 5+ tests

**Est. Tests:** 5

---

### EX4-E.4: Span Detail Panel

**File:** `client/src/components/Observatory/SpanDetailPanel.tsx`

Right panel showing full detail for the selected span. Content varies by SpanKind:

**All Spans:**
- Name, Kind (badge), Status (badge)
- Start time, End time, Latency
- Cumulative usage (own + descendants)

**LLM Spans (additional):**
- Model name + role
- Token usage: input → output (with bar visualization)
- Cost breakdown
- **Input tab:** Full prompt/messages (syntax-highlighted JSON or formatted messages)
- **Output tab:** Full response (syntax-highlighted JSON)
- Token bar: visual bar showing input vs output token ratio

**TOOL Spans (additional):**
- Tool name
- Tool arguments (JSON)
- Tool result (JSON or text)
- Execution time

**AGENT Spans (additional):**
- Session overview (total calls, reflection loops, model map)

**Content Rendering:**
- Use `CodeBlock` component (already exists from DynamicUI) for JSON display
- Messages array rendered as chat-style bubbles (system/user/assistant/tool)
- Large content is collapsible (show first 500 chars, "Expand" button)

**Verification:**
- Correct detail panel for each SpanKind
- Input/output load on-demand (API call when span selected)
- JSON syntax highlighting works
- Large content is collapsible
- Chat-style message rendering for LLM spans
- 8+ tests

**Est. Tests:** 8

---

### EX4-E.5: Live Trace Updates

**File:** Extend `client/src/hooks/useObservatorySocket.ts`

WebSocket hook that keeps the trace list and active trace detail in sync:

```typescript
export function useObservatorySocket() {
  // Connect to WS /ws/observatory
  // On trace:start → add to traces list
  // On trace:end → update trace in list
  // On span:start → if viewing this trace, add span to tree
  // On span:end → if viewing this trace, update span in tree
}
```

**Key behavior:**
- When viewing the trace list: new traces appear at top, running traces update status
- When viewing a specific trace: new spans appear in real-time (tree grows live as agent executes)
- This creates the "live debugging" experience — watch the agent's LLM calls happen in real-time

**Verification:**
- New traces appear in list without refresh
- Viewing a running trace shows spans appearing live
- Status transitions (RUNNING → OK/ERROR) update correctly
- 5+ tests

**Est. Tests:** 5

---

## API Summary

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/observatory/traces` | List traces (paginated, filterable) |
| GET | `/api/observatory/traces/:traceId` | Get trace with span tree |
| GET | `/api/observatory/spans/:spanId` | Get span detail (with content) |
| GET | `/api/observatory/stats` | Global observatory stats |
| POST | `/api/observatory/clear` | Clear all traces |

### WebSocket

| Path | Direction | Events |
|------|-----------|--------|
| `WS /ws/observatory` | Server → Client | `trace:start`, `trace:end`, `span:start`, `span:end` |

---

## File Creation Map

| Task | New Files | Modified Files |
|------|-----------|---------------|
| EX4-A.1 | `shared/schemas/observatory.ts` | `shared/schemas/index.ts` |
| EX4-A.2 | `server/src/observatory/trace-store.ts` | `server/src/services/container.ts` |
| EX4-A.3 | `server/src/observatory/context.ts` | — |
| EX4-B.1 | — | `server/src/llm/model-router.ts` |
| EX4-B.2 | — | `server/src/agent/ui-agent.ts`, `executor.ts`, `planner.ts`, `reflector.ts`, `investigation-agent.ts` |
| EX4-B.3 | — | `server/src/dynamic-ui/generator.ts`, `classifier.ts` |
| EX4-C.1 | `server/src/routes/observatory.ts` | `server/src/index.ts` |
| EX4-C.2 | — | `server/src/routes/observatory.ts` |
| EX4-D.1 | `client/src/components/Observatory/index.ts` | App registry files |
| EX4-D.2 | `client/src/components/Observatory/TraceListView.tsx`, `client/src/store/observatory-store.ts` | — |
| EX4-D.3 | `client/src/components/Observatory/StatsPanel.tsx` | — |
| EX4-E.1 | `client/src/components/Observatory/TraceDetailView.tsx` | — |
| EX4-E.2 | `client/src/components/Observatory/TraceTree.tsx` | — |
| EX4-E.3 | `client/src/components/Observatory/TimelineBar.tsx` | — |
| EX4-E.4 | `client/src/components/Observatory/SpanDetailPanel.tsx` | — |
| EX4-E.5 | `client/src/hooks/useObservatorySocket.ts` | — |

---

## Test Plan

| Sub-Phase | Test File | Est. Tests |
|-----------|-----------|------------|
| EX4-A.1 | `server/tests/observatory/schemas.test.ts` | 15 |
| EX4-A.2 | `server/tests/observatory/trace-store.test.ts` | 20 |
| EX4-A.3 | `server/tests/observatory/context.test.ts` | 10 |
| EX4-B.1 | `server/tests/llm/model-router-spans.test.ts` | 8 |
| EX4-B.2 | `server/tests/agent/agent-spans.test.ts` | 8 |
| EX4-B.3 | `server/tests/dynamic-ui/generator-spans.test.ts` | 5 |
| EX4-C.1 | `server/tests/routes/observatory.test.ts` | 10 |
| EX4-C.2 | `server/tests/routes/observatory-ws.test.ts` | 5 |
| EX4-D.1 | `client/tests/components/Observatory/registration.test.tsx` | 3 |
| EX4-D.2 | `client/tests/components/Observatory/TraceListView.test.tsx` | 8 |
| EX4-D.3 | `client/tests/components/Observatory/StatsPanel.test.tsx` | 5 |
| EX4-E.1 | `client/tests/components/Observatory/TraceDetailView.test.tsx` | 5 |
| EX4-E.2 | `client/tests/components/Observatory/TraceTree.test.tsx` | 8 |
| EX4-E.3 | `client/tests/components/Observatory/TimelineBar.test.tsx` | 5 |
| EX4-E.4 | `client/tests/components/Observatory/SpanDetailPanel.test.tsx` | 8 |
| EX4-E.5 | `client/tests/hooks/useObservatorySocket.test.ts` | 5 |
| **Total** | | **~128** |

---

## Performance Budget

| Operation | Budget | Actual (expected) |
|-----------|--------|-------------------|
| `startSpan()` | < 0.1ms | ~0.01ms (Map.set + UUID) |
| `endSpan()` | < 0.5ms | ~0.05ms (Map.set + parent chain walk) |
| `withSpan()` overhead | < 0.5ms | ~0.1ms (AsyncLocalStorage enter/exit) |
| Ring buffer eviction | < 1ms | ~0.1ms (Map.delete × spans-per-trace) |
| `getSpanTree()` | < 5ms | ~1ms (single-pass tree build, 200 spans max per trace) |
| WebSocket broadcast | < 1ms | ~0.1ms (JSON.stringify of summary, fire-and-forget) |
| Memory per trace (avg) | < 250KB | ~50-100KB (depends on prompt/response sizes) |
| Total memory (200 traces) | < 50MB | ~10-20MB |

---

## Success Criteria

1. **Every LLM call creates a span** — no blind spots in the trace tree
2. **Agent sessions are fully debuggable** — can see exactly what the planner suggested, what the executor did, what each tool returned, and what the reflector assessed
3. **Tree view matches agent execution** — the visual hierarchy mirrors the actual call stack
4. **Live updates work** — watching a running agent session shows spans appearing in real-time
5. **Zero impact on LLM latency** — tracing overhead is < 1ms per span (verified in tests)
6. **Ring buffer prevents memory growth** — 200-trace cap keeps memory bounded
