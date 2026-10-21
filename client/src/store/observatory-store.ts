// EX4-D.2: Observatory Zustand Store
// @see docs/phases/phase-ex4.md

import { create } from 'zustand';
import type {
  TraceSummary,
  Trace,
  SpanTreeNode,
  Span,
  ObservatoryStats,
  ObservatoryEvent,
  SpanStatus,
  TraceTrigger,
} from 'headlessos-shared/schemas/observatory';

import { BACKEND_ORIGIN, isElectronProd } from '../lib/api';

// EX8.23: same-origin in the browser, so the Vite proxy adds the API token (a direct
// call to :3001 has none and is refused, which showed as "Failed to fetch"); the
// backend origin only in Electron, where fetch is patched to add the token.
const API_BASE = isElectronProd ? BACKEND_ORIGIN : '';

interface ObservatoryFilters {
  trigger?: TraceTrigger;
  status?: SpanStatus;
}

interface ObservatoryState {
  // Data
  traces: TraceSummary[];
  totalTraces: number;
  stats: ObservatoryStats | null;
  selectedTraceId: string | null;
  selectedTrace: Trace | null;
  selectedSpanTree: SpanTreeNode | null;
  selectedSpanId: string | null;
  selectedSpan: Span | null;
  filters: ObservatoryFilters;
  loading: boolean;
  error: string | null;

  // Actions
  fetchTraces: () => Promise<void>;
  fetchStats: () => Promise<void>;
  selectTrace: (traceId: string) => Promise<void>;
  selectSpan: (spanId: string) => Promise<void>;
  clearSelection: () => void;
  setFilter: (filters: Partial<ObservatoryFilters>) => void;
  clearTraces: () => Promise<void>;

  // WebSocket live updates
  handleEvent: (event: ObservatoryEvent) => void;
}

export const useObservatoryStore = create<ObservatoryState>((set, get) => ({
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

  fetchTraces: async () => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (filters.trigger) params.set('trigger', filters.trigger);
      if (filters.status) params.set('status', filters.status);

      const res = await fetch(`${API_BASE}/api/observatory/traces?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ traces: data.traces, totalTraces: data.total, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/observatory/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ stats: data });
    } catch {
      // Stats are non-critical
    }
  },

  selectTrace: async (traceId: string) => {
    set({ selectedTraceId: traceId, selectedSpanId: null, selectedSpan: null });
    try {
      const res = await fetch(`${API_BASE}/api/observatory/traces/${traceId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ selectedTrace: data.trace, selectedSpanTree: data.spanTree });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  selectSpan: async (spanId: string) => {
    set({ selectedSpanId: spanId });
    try {
      const res = await fetch(`${API_BASE}/api/observatory/spans/${spanId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ selectedSpan: data.span });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  clearSelection: () => {
    set({
      selectedTraceId: null,
      selectedTrace: null,
      selectedSpanTree: null,
      selectedSpanId: null,
      selectedSpan: null,
    });
    // Refresh list to ensure it's up-to-date after returning from detail view
    get().fetchTraces();
  },

  setFilter: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
    // Re-fetch with new filters
    get().fetchTraces();
  },

  clearTraces: async () => {
    try {
      await fetch(`${API_BASE}/api/observatory/clear`, { method: 'POST' });
      set({ traces: [], totalTraces: 0, stats: null });
    } catch {
      // ignore
    }
  },

  handleEvent: (event: ObservatoryEvent) => {
    const state = get();

    switch (event.type) {
      case 'trace:start': {
        // Add new trace at the top (deduplicate by traceId)
        const newTrace: TraceSummary = event.trace;
        const existing = state.traces.some(t => t.traceId === newTrace.traceId);
        if (!existing) {
          set({ traces: [newTrace, ...state.traces].slice(0, 50) });
        }
        break;
      }
      case 'trace:end': {
        // Use fresh state to avoid race with trace:start
        const currentTraces = get().traces;
        const found = currentTraces.some(t => t.traceId === event.trace.traceId);
        if (found) {
          const updated = currentTraces.map(t =>
            t.traceId === event.trace.traceId ? event.trace : t,
          );
          set({ traces: updated });
        } else {
          // trace:end arrived before trace:start was processed — add it
          set({ traces: [event.trace, ...currentTraces].slice(0, 50) });
        }

        // If this trace is selected, refresh the tree to get final data
        if (state.selectedTraceId === event.trace.traceId) {
          get().selectTrace(event.trace.traceId);
        }
        break;
      }
      case 'span:start': {
        // If the trace is selected, add the new span to the local tree
        // instead of refetching — prevents excessive API calls during active traces
        if (state.selectedTraceId === event.traceId && state.selectedSpanTree) {
          const newNode: SpanTreeNode = { span: event.span, children: [] };
          const updatedTree = insertSpanInTree(state.selectedSpanTree, newNode);
          if (updatedTree) {
            set({ selectedSpanTree: updatedTree });
          }
        }
        break;
      }
      case 'span:end': {
        // Update the span in the local tree with the completed data
        if (state.selectedTraceId === event.traceId && state.selectedSpanTree) {
          const updatedTree = updateSpanInTree(state.selectedSpanTree, event.span);
          if (updatedTree) {
            set({ selectedSpanTree: updatedTree });
          }
          // If this is the currently selected span, re-fetch its full detail
          if (state.selectedSpanId === event.span.spanId) {
            get().selectSpan(event.span.spanId);
          }
        }
        break;
      }
    }
  },
}));

// ── Tree Helpers ──

/** Insert a new span node into the tree under its parent */
function insertSpanInTree(root: SpanTreeNode, newNode: SpanTreeNode): SpanTreeNode | null {
  const parentId = newNode.span.parentSpanId;
  if (!parentId) return null; // Can't insert another root

  function visit(node: SpanTreeNode): SpanTreeNode {
    if (node.span.spanId === parentId) {
      // Found parent — add child (deduplicate)
      const exists = node.children.some(c => c.span.spanId === newNode.span.spanId);
      if (exists) return node;
      return {
        ...node,
        children: [...node.children, newNode].sort((a, b) =>
          a.span.startTime.localeCompare(b.span.startTime),
        ),
      };
    }
    const newChildren = node.children.map(visit);
    if (newChildren.some((c, i) => c !== node.children[i])) {
      return { ...node, children: newChildren };
    }
    return node;
  }

  return visit(root);
}

/** Update a span's data in the tree (e.g., when it ends) */
function updateSpanInTree(root: SpanTreeNode, updatedSpan: Span): SpanTreeNode | null {
  function visit(node: SpanTreeNode): SpanTreeNode {
    if (node.span.spanId === updatedSpan.spanId) {
      return { ...node, span: updatedSpan };
    }
    const newChildren = node.children.map(visit);
    if (newChildren.some((c, i) => c !== node.children[i])) {
      return { ...node, children: newChildren };
    }
    return node;
  }

  return visit(root);
}
