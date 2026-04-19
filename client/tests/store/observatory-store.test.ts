// EX4: Observatory Store Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useObservatoryStore } from '../../src/store/observatory-store';
import type { TraceSummary, ObservatoryStats, ObservatoryEvent } from 'headlessos-shared/schemas/observatory';

function mockResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

const makeSummary = (id: string, overrides: Partial<TraceSummary> = {}): TraceSummary => ({
  traceId: id,
  name: `trace-${id}`,
  trigger: 'ui-agent',
  status: 'OK',
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  latencyMs: 100,
  totalSpans: 2,
  totalTokens: 500,
  totalCostUsd: 0.01,
  spansByKind: {},
  ...overrides,
});

const makeStats = (overrides: Partial<ObservatoryStats> = {}): ObservatoryStats => ({
  totalTraces: 5,
  totalSpans: 20,
  totalTokens: 1000,
  totalCostUsd: 0.05,
  averageLatencyMs: 200,
  spansByKind: { LLM: 10, AGENT: 5, CHAIN: 3, TOOL: 2 },
  tokensByModel: { 'gpt-4.1': 500, 'gpt-4.1-mini': 500 },
  ...overrides,
});

describe('observatory-store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useObservatoryStore.setState({
      traces: [],
      totalTraces: 0,
      stats: null,
      selectedTraceId: null,
      selectedTrace: null,
      selectedSpanTree: null,
      selectedSpanId: null,
      selectedSpan: null,
      filters: {},
      loading: false,
      error: null,
    });
  });

  describe('fetchTraces', () => {
    it('fetches traces and updates state', async () => {
      const traces = [makeSummary('t1'), makeSummary('t2')];
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({ traces, total: 2 }),
      );

      await useObservatoryStore.getState().fetchTraces();

      const state = useObservatoryStore.getState();
      expect(state.traces).toHaveLength(2);
      expect(state.totalTraces).toBe(2);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('applies filters to query params', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({ traces: [], total: 0 }),
      );
      useObservatoryStore.setState({ filters: { trigger: 'ui-agent', status: 'ERROR' } });

      await useObservatoryStore.getState().fetchTraces();

      const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain('trigger=ui-agent');
      expect(url).toContain('status=ERROR');
    });

    it('sets error on fetch failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse(null, false, 500),
      );

      await useObservatoryStore.getState().fetchTraces();

      expect(useObservatoryStore.getState().error).toBe('HTTP 500');
      expect(useObservatoryStore.getState().loading).toBe(false);
    });
  });

  describe('fetchStats', () => {
    it('fetches stats', async () => {
      const stats = makeStats();
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(stats));

      await useObservatoryStore.getState().fetchStats();

      expect(useObservatoryStore.getState().stats).toEqual(stats);
    });

    it('silently ignores stats fetch failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse(null, false, 500),
      );

      await useObservatoryStore.getState().fetchStats();

      expect(useObservatoryStore.getState().stats).toBeNull();
      expect(useObservatoryStore.getState().error).toBeNull();
    });
  });

  describe('selectTrace', () => {
    it('fetches trace detail and span tree', async () => {
      const trace = { traceId: 't1', name: 'test', trigger: 'ui-agent', status: 'OK' };
      const spanTree = { span: { spanId: 's1' }, children: [] };
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({ trace, spanTree }),
      );

      await useObservatoryStore.getState().selectTrace('t1');

      const state = useObservatoryStore.getState();
      expect(state.selectedTraceId).toBe('t1');
      expect(state.selectedTrace).toEqual(trace);
      expect(state.selectedSpanTree).toEqual(spanTree);
      expect(state.selectedSpanId).toBeNull();
    });

    it('sets error on failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse(null, false, 404),
      );

      await useObservatoryStore.getState().selectTrace('bad');

      expect(useObservatoryStore.getState().error).toBe('HTTP 404');
    });
  });

  describe('selectSpan', () => {
    it('fetches span detail', async () => {
      const span = { spanId: 's1', name: 'llm-call' };
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({ span }),
      );

      await useObservatoryStore.getState().selectSpan('s1');

      const state = useObservatoryStore.getState();
      expect(state.selectedSpanId).toBe('s1');
      expect(state.selectedSpan).toEqual(span);
    });
  });

  describe('clearSelection', () => {
    it('clears all selected state', () => {
      useObservatoryStore.setState({
        selectedTraceId: 't1',
        selectedTrace: {} as never,
        selectedSpanTree: {} as never,
        selectedSpanId: 's1',
        selectedSpan: {} as never,
      });

      useObservatoryStore.getState().clearSelection();

      const state = useObservatoryStore.getState();
      expect(state.selectedTraceId).toBeNull();
      expect(state.selectedTrace).toBeNull();
      expect(state.selectedSpanTree).toBeNull();
      expect(state.selectedSpanId).toBeNull();
      expect(state.selectedSpan).toBeNull();
    });
  });

  describe('setFilter', () => {
    it('merges new filters and re-fetches', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({ traces: [], total: 0 }),
      );

      useObservatoryStore.getState().setFilter({ trigger: 'dynamic-ui' });

      // Wait for the fetchTraces call triggered by setFilter
      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      expect(useObservatoryStore.getState().filters.trigger).toBe('dynamic-ui');
    });

    it('preserves existing filters when setting new ones', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({ traces: [], total: 0 }),
      );

      useObservatoryStore.setState({ filters: { trigger: 'ui-agent' } });
      useObservatoryStore.getState().setFilter({ status: 'ERROR' });

      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      const filters = useObservatoryStore.getState().filters;
      expect(filters.trigger).toBe('ui-agent');
      expect(filters.status).toBe('ERROR');
    });
  });

  describe('clearTraces', () => {
    it('posts clear and resets state', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({}));
      useObservatoryStore.setState({
        traces: [makeSummary('t1')],
        totalTraces: 1,
        stats: makeStats(),
      });

      await useObservatoryStore.getState().clearTraces();

      const state = useObservatoryStore.getState();
      expect(state.traces).toHaveLength(0);
      expect(state.totalTraces).toBe(0);
      expect(state.stats).toBeNull();

      const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain('/api/observatory/clear');
    });
  });

  describe('handleEvent', () => {
    it('adds new trace on trace:start', () => {
      const existing = makeSummary('old');
      useObservatoryStore.setState({ traces: [existing] });

      const newTrace = makeSummary('new');
      useObservatoryStore.getState().handleEvent({
        type: 'trace:start',
        trace: newTrace,
        timestamp: new Date().toISOString(),
      } as ObservatoryEvent);

      const traces = useObservatoryStore.getState().traces;
      expect(traces).toHaveLength(2);
      expect(traces[0].traceId).toBe('new');
    });

    it('limits traces to 50', () => {
      const many = Array.from({ length: 50 }, (_, i) => makeSummary(`t${i}`));
      useObservatoryStore.setState({ traces: many });

      useObservatoryStore.getState().handleEvent({
        type: 'trace:start',
        trace: makeSummary('new'),
        timestamp: new Date().toISOString(),
      } as ObservatoryEvent);

      expect(useObservatoryStore.getState().traces).toHaveLength(50);
    });

    it('updates trace on trace:end', () => {
      const trace = makeSummary('t1', { status: 'UNSET' });
      useObservatoryStore.setState({ traces: [trace] });

      const updated = makeSummary('t1', { status: 'OK', latencyMs: 500 });
      useObservatoryStore.getState().handleEvent({
        type: 'trace:end',
        trace: updated,
        timestamp: new Date().toISOString(),
      } as ObservatoryEvent);

      const result = useObservatoryStore.getState().traces;
      expect(result[0].status).toBe('OK');
      expect(result[0].latencyMs).toBe(500);
    });

    it('refreshes selected trace on trace:end', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({ trace: {}, spanTree: null }),
      );

      useObservatoryStore.setState({
        traces: [makeSummary('t1')],
        selectedTraceId: 't1',
      });

      useObservatoryStore.getState().handleEvent({
        type: 'trace:end',
        trace: makeSummary('t1', { status: 'OK' }),
        timestamp: new Date().toISOString(),
      } as ObservatoryEvent);

      // Should have called selectTrace → fetch
      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });
    });

    it('locally inserts span on span:start when trace is selected', () => {
      // Set up selected trace with an existing span tree
      const existingTree = {
        span: {
          spanId: 'root', traceId: 't1', parentSpanId: null,
          name: 'root-span', kind: 'AGENT', status: 'OK',
          startTime: '2025-01-01T00:00:00.000Z', endTime: '2025-01-01T00:00:01.000Z',
          latencyMs: 1000, model: null, modelRole: null,
          tokenUsage: null, costUsd: null, input: null, output: null,
          error: null, cumulative: null,
        },
        children: [],
      };
      useObservatoryStore.setState({
        selectedTraceId: 't1',
        selectedSpanTree: existingTree,
        traces: [],
      });

      // Simulate a new child span arriving
      useObservatoryStore.getState().handleEvent({
        type: 'span:start',
        span: {
          spanId: 's1', traceId: 't1', parentSpanId: 'root',
          name: 'child-span', kind: 'LLM', status: 'RUNNING',
          startTime: '2025-01-01T00:00:00.100Z', endTime: null,
          latencyMs: null, model: null, modelRole: null,
          tokenUsage: null, costUsd: null, input: null, output: null,
          error: null, cumulative: null,
        },
        traceId: 't1',
        timestamp: new Date().toISOString(),
      } as ObservatoryEvent);

      // The span should be inserted locally into the tree (no fetch needed)
      const tree = useObservatoryStore.getState().selectedSpanTree;
      expect(tree?.children).toHaveLength(1);
      expect(tree?.children[0].span.spanId).toBe('s1');
    });
  });
});
