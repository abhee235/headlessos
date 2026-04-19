// EX4-A.3: Instrumentation Context — AsyncLocalStorage-based trace/span context
// @see docs/phases/phase-ex4.md
//
// Provides automatic parent-child span linking. Any code running inside
// withTrace/withSpan automatically becomes a child of the current span.
// If no trace is active, withSpan is a no-op pass-through (zero overhead).

import { AsyncLocalStorage } from 'node:async_hooks';
import { TraceStore } from './trace-store.js';
import type { SpanKind, SpanStatus, TraceTrigger, ModelRole, TokenUsage } from 'headlessos-shared/schemas/observatory';

// ── Context ──

interface ObservatoryContext {
  traceId: string;
  spanId: string; // current active span
}

const storage = new AsyncLocalStorage<ObservatoryContext>();

// ── Singleton TraceStore ──

let _traceStore: TraceStore | null = null;

export function initObservatory(store: TraceStore): void {
  _traceStore = store;
}

export function getTraceStore(): TraceStore | null {
  return _traceStore;
}

// ── Context Accessors ──

export function currentContext(): ObservatoryContext | undefined {
  return storage.getStore();
}

export function currentTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}

export function currentSpanId(): string | undefined {
  return storage.getStore()?.spanId;
}

// ── Trace Wrapper ──

export interface TraceOpts {
  trigger?: TraceTrigger;
  serverId?: string;
  kind?: SpanKind; // root span kind; defaults to AGENT
}

/**
 * Run a function within a new trace (creates root span).
 * If the TraceStore is not initialized, runs fn() directly (no-op).
 */
export async function withTrace<T>(
  name: string,
  opts: TraceOpts,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!_traceStore) return fn();

  const { trace, rootSpan } = _traceStore.startTrace(name, {
    serverId: opts.serverId,
    trigger: opts.trigger,
  });

  // If a non-default root span kind was requested, update it
  if (opts.kind && opts.kind !== 'AGENT') {
    const span = _traceStore.getSpan(rootSpan.spanId);
    if (span) {
      // Directly mutate since we just created it
      (span as Record<string, unknown>).kind = opts.kind;
    }
  }

  const context: ObservatoryContext = {
    traceId: trace.traceId,
    spanId: rootSpan.spanId,
  };

  try {
    const result = await storage.run(context, fn);
    _traceStore.endSpan(rootSpan.spanId, { output: result });
    _traceStore.endTrace(trace.traceId);
    return result;
  } catch (err) {
    _traceStore.endSpan(rootSpan.spanId, {
      error: err instanceof Error ? err.message : String(err),
    });
    _traceStore.endTrace(trace.traceId);
    throw err;
  }
}

// ── Span Wrapper ──

export interface SpanOpts {
  input?: unknown;
  attributes?: Record<string, unknown>;
}

/**
 * Run a function within a child span of the current context.
 * If no trace context exists, runs fn() directly (no-op pass-through).
 */
export async function withSpan<T>(
  name: string,
  kind: SpanKind,
  fn: () => T | Promise<T>,
  opts?: SpanOpts,
): Promise<T> {
  const parentCtx = storage.getStore();
  if (!_traceStore || !parentCtx) return fn();

  const span = _traceStore.startSpan({
    traceId: parentCtx.traceId,
    parentSpanId: parentCtx.spanId,
    name,
    kind,
    input: opts?.input,
    attributes: opts?.attributes,
  });

  const childCtx: ObservatoryContext = {
    traceId: parentCtx.traceId,
    spanId: span.spanId,
  };

  try {
    const result = await storage.run(childCtx, fn);
    _traceStore.endSpan(span.spanId, { output: result });
    return result;
  } catch (err) {
    _traceStore.endSpan(span.spanId, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ── Span Attribute Setters ──

/**
 * Set attributes on the current span. Call this from within withSpan/withTrace.
 */
export function setSpanAttributes(attrs: {
  model?: string;
  modelRole?: ModelRole;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  output?: unknown;
  input?: unknown;
  error?: string;
  attributes?: Record<string, unknown>;
}): void {
  const ctx = storage.getStore();
  if (!_traceStore || !ctx) return;

  const span = _traceStore.getSpan(ctx.spanId);
  if (!span || span.status !== 'RUNNING') return;

  // Update mutable fields on the running span
  const s = span as Record<string, unknown>;
  if (attrs.model !== undefined) s.model = attrs.model;
  if (attrs.modelRole !== undefined) s.modelRole = attrs.modelRole;
  if (attrs.tokenUsage !== undefined) s.tokenUsage = attrs.tokenUsage;
  if (attrs.costUsd !== undefined) s.costUsd = attrs.costUsd;
  if (attrs.output !== undefined) s.output = attrs.output;
  if (attrs.input !== undefined) s.input = attrs.input;
  if (attrs.error !== undefined) s.error = attrs.error;
  if (attrs.attributes) {
    s.attributes = { ...(span.attributes ?? {}), ...attrs.attributes };
  }
}

// ── Async Generator Wrappers ──
// AsyncGenerators (yield*) need special wrappers because withTrace/withSpan
// use Promise<T>, but generators yield multiple values. These wrappers create
// the generator inside storage.run() so the context is inherited across yields.

/**
 * Run an async generator within a new trace (creates root span).
 * The AsyncLocalStorage context is inherited across yield boundaries.
 * If the TraceStore is not initialized, delegates to fn() directly.
 */
export async function* withTraceGen<T>(
  name: string,
  opts: TraceOpts,
  fn: () => AsyncGenerator<T>,
): AsyncGenerator<T> {
  if (!_traceStore) {
    yield* fn();
    return;
  }

  const { trace, rootSpan } = _traceStore.startTrace(name, {
    serverId: opts.serverId,
    trigger: opts.trigger,
  });

  if (opts.kind && opts.kind !== 'AGENT') {
    const span = _traceStore.getSpan(rootSpan.spanId);
    if (span) (span as Record<string, unknown>).kind = opts.kind;
  }

  const context: ObservatoryContext = {
    traceId: trace.traceId,
    spanId: rootSpan.spanId,
  };

  // Create generator inside AsyncLocalStorage context.
  const gen = storage.run(context, fn);

  // Wrap each generator resumption inside the ALS context so that
  // setSpanAttributes / withSpan calls inside the generator see the context.
  try {
    let sendValue: unknown;
    while (true) {
      const { value, done } = await storage.run(context, () => gen.next(sendValue as T));
      if (done) break;
      sendValue = yield value;
    }
  } catch (err) {
    _traceStore.endSpan(rootSpan.spanId, {
      error: err instanceof Error ? err.message : String(err),
    });
    _traceStore.endTrace(trace.traceId);
    throw err;
  }

  _traceStore.endSpan(rootSpan.spanId);
  _traceStore.endTrace(trace.traceId);
}

/**
 * Run an async generator within a child span of the current context.
 * If no trace context exists, delegates to fn() directly (no-op).
 */
export async function* withSpanGen<T>(
  name: string,
  kind: SpanKind,
  fn: () => AsyncGenerator<T>,
  opts?: SpanOpts,
): AsyncGenerator<T> {
  const parentCtx = storage.getStore();
  if (!_traceStore || !parentCtx) {
    yield* fn();
    return;
  }

  const span = _traceStore.startSpan({
    traceId: parentCtx.traceId,
    parentSpanId: parentCtx.spanId,
    name,
    kind,
    input: opts?.input,
    attributes: opts?.attributes,
  });

  const childCtx: ObservatoryContext = {
    traceId: parentCtx.traceId,
    spanId: span.spanId,
  };

  const gen = storage.run(childCtx, fn);

  // Wrap each generator resumption inside the ALS context
  try {
    let sendValue: unknown;
    while (true) {
      const { value, done } = await storage.run(childCtx, () => gen.next(sendValue as T));
      if (done) break;
      sendValue = yield value;
    }
  } catch (err) {
    _traceStore.endSpan(span.spanId, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  _traceStore.endSpan(span.spanId);
}

/**
 * End the current span with optional result data.
 * Useful when you need to end a span before the function returns.
 */
export function endCurrentSpan(result?: {
  status?: SpanStatus;
  output?: unknown;
  error?: string;
  model?: string;
  modelRole?: ModelRole;
  tokenUsage?: TokenUsage;
  costUsd?: number;
}): void {
  const ctx = storage.getStore();
  if (!_traceStore || !ctx) return;
  _traceStore.endSpan(ctx.spanId, result);
}
