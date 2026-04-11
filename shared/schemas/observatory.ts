// EX4-A.1: Observatory Schemas — Trace & Span Zod schemas for LLM Observatory
// @see docs/phases/phase-ex4.md
//
// Core data models for hierarchical LLM tracing: Trace → Span tree.
// Used for validation, TypeScript types, and API response shapes.

import { z } from 'zod';

// ── Span Kind ──────────────────────────────────────────

export const SpanKindSchema = z.enum([
  'LLM',    // Individual LLM call (prompt → response)
  'AGENT',  // Top-level agent session (UIAgent, InvestigationAgent)
  'CHAIN',  // Pipeline phase (plan, execute, reflect, classify, generate)
  'TOOL',   // Tool execution (exec_command, read_file, etc.)
]);
export type SpanKind = z.infer<typeof SpanKindSchema>;

// ── Span Status ────────────────────────────────────────

export const SpanStatusSchema = z.enum([
  'RUNNING', // Span is active
  'OK',      // Completed successfully
  'ERROR',   // Completed with error
]);
export type SpanStatus = z.infer<typeof SpanStatusSchema>;

// ── Token Usage (per-span) ─────────────────────────────

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(), // input + output
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

// ── Cumulative Usage (own + all descendants) ───────────

export const CumulativeUsageSchema = z.object({
  tokenUsage: TokenUsageSchema,
  costUsd: z.number().nonnegative(),
  spanCount: z.number().int().positive(), // includes self
});
export type CumulativeUsage = z.infer<typeof CumulativeUsageSchema>;

// ── Trace Trigger ──────────────────────────────────────

export const TraceTriggerSchema = z.enum([
  'ui-agent',
  'investigation-agent',
  'dynamic-ui',
  'api',
]);
export type TraceTrigger = z.infer<typeof TraceTriggerSchema>;

// ── Model Role ─────────────────────────────────────────

export const ModelRoleSchema = z.enum([
  'reasoning',
  'structured-output',
  'fast',
  'weak',
]);
export type ModelRole = z.infer<typeof ModelRoleSchema>;

// ── Span ───────────────────────────────────────────────

export const SpanSchema = z.object({
  spanId: z.string().uuid(),
  traceId: z.string().uuid(),
  parentSpanId: z.string().uuid().nullable(), // null = root span
  name: z.string(),                           // e.g. "ModelRouter.reason"
  kind: SpanKindSchema,
  status: SpanStatusSchema,
  startTime: z.string().datetime(),
  endTime: z.string().datetime().nullable(),   // null while RUNNING
  latencyMs: z.number().nonnegative().nullable(), // computed at end

  // LLM-specific fields (only for kind=LLM)
  model: z.string().nullable(),
  modelRole: ModelRoleSchema.nullable(),
  tokenUsage: TokenUsageSchema.nullable(),     // own tokens (LLM spans only)
  costUsd: z.number().nonnegative().nullable(),

  // Content (lazy-serialized — only populated when detail is requested)
  input: z.unknown().nullable(),   // prompt/messages (stored as reference)
  output: z.unknown().nullable(),  // response/parsed result

  // Error
  error: z.string().nullable(),

  // Cumulative (own + descendants — computed at span end)
  cumulative: CumulativeUsageSchema.nullable(),

  // Metadata
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type Span = z.infer<typeof SpanSchema>;

// ── Trace ──────────────────────────────────────────────

export const TraceSchema = z.object({
  traceId: z.string().uuid(),
  rootSpanId: z.string().uuid(),
  name: z.string(),                            // e.g. "UIAgent: docker overview"
  status: SpanStatusSchema,                    // derived from root span
  startTime: z.string().datetime(),
  endTime: z.string().datetime().nullable(),
  latencyMs: z.number().nonnegative().nullable(),

  // Aggregates (from root span cumulative)
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  totalSpans: z.number().int().positive(),
  spansByKind: z.record(SpanKindSchema, z.number().int().nonnegative()),

  // Context
  serverId: z.string().nullable(),
  trigger: TraceTriggerSchema.nullable(),
});
export type Trace = z.infer<typeof TraceSchema>;

// ── Trace Summary (for list views — same shape as Trace) ──

export const TraceSummarySchema = TraceSchema;
export type TraceSummary = z.infer<typeof TraceSummarySchema>;

// ── Span Tree Node (recursive, for tree rendering) ────

export type SpanTreeNode = {
  span: Span;
  children: SpanTreeNode[];
};

export const SpanTreeNodeSchema: z.ZodType<SpanTreeNode> = z.lazy(() =>
  z.object({
    span: SpanSchema,
    children: z.array(SpanTreeNodeSchema),
  }),
);

// ── Observatory Stats (global aggregates) ──────────────

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
  recentTraces: z.array(TraceSummarySchema), // last 10
});
export type ObservatoryStats = z.infer<typeof ObservatoryStatsSchema>;

// ── WebSocket Event Schemas ────────────────────────────

export const TraceStartEventSchema = z.object({
  type: z.literal('trace:start'),
  trace: TraceSummarySchema,
});

export const TraceEndEventSchema = z.object({
  type: z.literal('trace:end'),
  trace: TraceSummarySchema,
});

export const SpanStartEventSchema = z.object({
  type: z.literal('span:start'),
  traceId: z.string().uuid(),
  span: SpanSchema,
});

export const SpanEndEventSchema = z.object({
  type: z.literal('span:end'),
  traceId: z.string().uuid(),
  span: SpanSchema,
});

export const ObservatoryEventSchema = z.discriminatedUnion('type', [
  TraceStartEventSchema,
  TraceEndEventSchema,
  SpanStartEventSchema,
  SpanEndEventSchema,
]);
export type ObservatoryEvent = z.infer<typeof ObservatoryEventSchema>;

// ── API Request/Response Schemas ───────────────────────

export const TraceListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  trigger: TraceTriggerSchema.optional(),
  status: SpanStatusSchema.optional(),
  serverId: z.string().optional(),
});
export type TraceListQuery = z.infer<typeof TraceListQuerySchema>;

export const TraceListResponseSchema = z.object({
  traces: z.array(TraceSummarySchema),
  total: z.number().int().nonnegative(),
});
export type TraceListResponse = z.infer<typeof TraceListResponseSchema>;

export const TraceDetailResponseSchema = z.object({
  trace: TraceSchema,
  spanTree: SpanTreeNodeSchema,
});
export type TraceDetailResponse = z.infer<typeof TraceDetailResponseSchema>;

export const SpanDetailResponseSchema = z.object({
  span: SpanSchema,
});
export type SpanDetailResponse = z.infer<typeof SpanDetailResponseSchema>;
