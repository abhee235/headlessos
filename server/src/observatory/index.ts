// EX4: Observatory Module — exports
// @see docs/phases/phase-ex4.md

export { TraceStore } from './trace-store.js';
export type { StartSpanOpts, SpanResult, ListOpts } from './trace-store.js';

export {
  initObservatory,
  getTraceStore,
  currentContext,
  currentTraceId,
  currentSpanId,
  withTrace,
  withSpan,
  withTraceGen,
  withSpanGen,
  setSpanAttributes,
  endCurrentSpan,
} from './context.js';
export type { TraceOpts, SpanOpts } from './context.js';
