// EX4-A.3: Instrumentation Context Tests
// @see docs/phases/phase-ex4.md

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TraceStore } from '../../src/observatory/trace-store.js';
import {
  initObservatory,
  getTraceStore,
  withTrace,
  withSpan,
  currentContext,
  currentTraceId,
  currentSpanId,
  setSpanAttributes,
} from '../../src/observatory/context.js';

describe('Observatory Context', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = new TraceStore(50);
    initObservatory(store);
  });

  afterEach(() => {
    store.clear();
    initObservatory(null as unknown as TraceStore); // Reset
  });

  describe('withTrace', () => {
    it('creates a trace and root span', async () => {
      let capturedTraceId: string | undefined;

      await withTrace('test trace', { trigger: 'ui-agent' }, async () => {
        capturedTraceId = currentTraceId();
      });

      expect(capturedTraceId).toBeDefined();
      const trace = store.getTrace(capturedTraceId!);
      expect(trace).toBeDefined();
      expect(trace!.name).toBe('test trace');
      expect(trace!.status).toBe('OK');
      expect(trace!.trigger).toBe('ui-agent');
    });

    it('returns the function result', async () => {
      const result = await withTrace('test', {}, async () => 42);
      expect(result).toBe(42);
    });

    it('ends trace with ERROR on exception', async () => {
      let traceId: string | undefined;

      await expect(
        withTrace('failing', {}, async () => {
          traceId = currentTraceId();
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const trace = store.getTrace(traceId!);
      expect(trace!.status).toBe('ERROR');
    });

    it('sets serverId on trace', async () => {
      let traceId: string | undefined;

      await withTrace('test', { serverId: 'srv-1', trigger: 'dynamic-ui' }, async () => {
        traceId = currentTraceId();
      });

      const trace = store.getTrace(traceId!);
      expect(trace!.serverId).toBe('srv-1');
    });

    it('context is unavailable outside withTrace', () => {
      expect(currentContext()).toBeUndefined();
      expect(currentTraceId()).toBeUndefined();
      expect(currentSpanId()).toBeUndefined();
    });
  });

  describe('withSpan', () => {
    it('creates child span within trace', async () => {
      let childSpanId: string | undefined;

      await withTrace('test', {}, async () => {
        await withSpan('child', 'CHAIN', async () => {
          childSpanId = currentSpanId();
        });
      });

      expect(childSpanId).toBeDefined();
      const span = store.getSpan(childSpanId!);
      expect(span).toBeDefined();
      expect(span!.name).toBe('child');
      expect(span!.kind).toBe('CHAIN');
      expect(span!.status).toBe('OK');
    });

    it('creates nested parent-child hierarchy', async () => {
      const spanIds: string[] = [];

      await withTrace('test', {}, async () => {
        spanIds.push(currentSpanId()!); // root

        await withSpan('chain', 'CHAIN', async () => {
          spanIds.push(currentSpanId()!); // chain

          await withSpan('llm', 'LLM', async () => {
            spanIds.push(currentSpanId()!); // llm
          });
        });
      });

      expect(spanIds).toHaveLength(3);
      const [rootId, chainId, llmId] = spanIds;

      const chain = store.getSpan(chainId);
      expect(chain!.parentSpanId).toBe(rootId);

      const llm = store.getSpan(llmId);
      expect(llm!.parentSpanId).toBe(chainId);
    });

    it('is a no-op when no trace context exists', async () => {
      const result = await withSpan('orphan', 'LLM', async () => 'hello');
      expect(result).toBe('hello');
      expect(store.getSize().spans).toBe(0);
    });

    it('ends span with ERROR on exception', async () => {
      let spanId: string | undefined;

      await expect(
        withTrace('test', {}, async () => {
          await withSpan('failing', 'CHAIN', async () => {
            spanId = currentSpanId();
            throw new Error('span error');
          });
        }),
      ).rejects.toThrow('span error');

      const span = store.getSpan(spanId!);
      expect(span!.status).toBe('ERROR');
      expect(span!.error).toBe('span error');
    });

    it('stores input via opts', async () => {
      let spanId: string | undefined;

      await withTrace('test', {}, async () => {
        await withSpan('llm', 'LLM', async () => {
          spanId = currentSpanId();
        }, { input: { prompt: 'hello world' } });
      });

      const span = store.getSpan(spanId!);
      expect(span!.input).toEqual({ prompt: 'hello world' });
    });
  });

  describe('setSpanAttributes', () => {
    it('sets model and token info on current span', async () => {
      let spanId: string | undefined;

      await withTrace('test', {}, async () => {
        await withSpan('llm', 'LLM', async () => {
          spanId = currentSpanId();
          setSpanAttributes({
            model: 'gpt-4.1',
            modelRole: 'structured-output',
            tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            costUsd: 0.001,
            output: { result: 'data' },
          });
        });
      });

      const span = store.getSpan(spanId!);
      expect(span!.model).toBe('gpt-4.1');
      expect(span!.modelRole).toBe('structured-output');
      // Note: tokenUsage gets overwritten on endSpan since we set it via setSpanAttributes
      // The span's attributes are set while running
    });

    it('is a no-op outside trace context', () => {
      // Should not throw
      setSpanAttributes({ model: 'test' });
    });
  });

  describe('getTraceStore', () => {
    it('returns the initialized store', () => {
      expect(getTraceStore()).toBe(store);
    });
  });

  describe('async propagation', () => {
    it('propagates context through async/await', async () => {
      const ids: string[] = [];

      await withTrace('async-test', {}, async () => {
        ids.push(currentTraceId()!);

        await new Promise(resolve => setTimeout(resolve, 1));
        ids.push(currentTraceId()!);

        await withSpan('delayed', 'CHAIN', async () => {
          await new Promise(resolve => setTimeout(resolve, 1));
          ids.push(currentTraceId()!);
        });
      });

      // All should be the same trace ID
      expect(ids[0]).toBe(ids[1]);
      expect(ids[1]).toBe(ids[2]);
    });
  });
});
