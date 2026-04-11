// EX4: TraceTree Component Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TraceTree } from '../../../src/components/Observatory/TraceTree';
import type { SpanTreeNode } from 'headlessos-shared/schemas/observatory';

const mockSelectSpan = vi.fn();

vi.mock('../../../src/store/observatory-store', () => ({
  useObservatoryStore: (selector?: (state: unknown) => unknown) => {
    const state = { selectedSpanId: null, selectSpan: mockSelectSpan };
    return selector ? selector(state) : state;
  },
}));

const makeNode = (overrides: Partial<SpanTreeNode['span']> = {}, children: SpanTreeNode[] = []): SpanTreeNode => ({
  span: {
    spanId: 's1',
    traceId: 't1',
    parentSpanId: null,
    name: 'root-span',
    kind: 'AGENT',
    status: 'OK',
    startTime: '2025-01-01T00:00:00.000Z',
    endTime: '2025-01-01T00:00:01.000Z',
    latencyMs: 1000,
    model: null,
    modelRole: null,
    tokenUsage: null,
    costUsd: null,
    input: null,
    output: null,
    error: null,
    cumulative: null,
    ...overrides,
  },
  children,
});

describe('TraceTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a span row', () => {
    const tree = makeNode({ name: 'my-agent' });
    render(
      <TraceTree tree={tree} traceStartTime="2025-01-01T00:00:00.000Z" traceLatencyMs={1000} />,
    );
    expect(screen.getByText('my-agent')).toBeInTheDocument();
  });

  it('renders child spans', () => {
    const child = makeNode({
      spanId: 's2',
      parentSpanId: 's1',
      name: 'child-llm',
      kind: 'LLM',
    });
    const tree = makeNode({ name: 'parent-agent' }, [child]);

    render(
      <TraceTree tree={tree} traceStartTime="2025-01-01T00:00:00.000Z" traceLatencyMs={1000} />,
    );

    // Both parent and child should be visible (auto-expand depth < 3)
    expect(screen.getByText('parent-agent')).toBeInTheDocument();
    expect(screen.getByText('child-llm')).toBeInTheDocument();
  });

  it('can collapse/expand nodes', () => {
    const child = makeNode({
      spanId: 's2',
      parentSpanId: 's1',
      name: 'hidden-child',
      kind: 'LLM',
    });
    const tree = makeNode({ name: 'parent' }, [child]);

    const { container } = render(
      <TraceTree tree={tree} traceStartTime="2025-01-01T00:00:00.000Z" traceLatencyMs={1000} />,
    );

    // Child should be visible initially (auto-expand)
    expect(screen.getByText('hidden-child')).toBeInTheDocument();

    // Click the row's collapse/expand button (inside .span-controls)
    const toggleBtn = container.querySelector('.span-controls button') as HTMLElement;
    fireEvent.click(toggleBtn);

    // After collapse, child should disappear
    expect(screen.queryByText('hidden-child')).not.toBeInTheDocument();
  });

  it('shows "Show N hidden spans" when collapsed', () => {
    const child = makeNode({
      spanId: 's2',
      parentSpanId: 's1',
      name: 'hidden-child',
      kind: 'LLM',
    });
    const tree = makeNode({ name: 'parent' }, [child]);

    const { container } = render(
      <TraceTree tree={tree} traceStartTime="2025-01-01T00:00:00.000Z" traceLatencyMs={1000} />,
    );

    // Collapse the parent (click the row's toggle button)
    const toggleBtn = container.querySelector('.span-controls button') as HTMLElement;
    fireEvent.click(toggleBtn);

    // Should show "Show 1 hidden span"
    expect(screen.getByText('Show 1 hidden span')).toBeInTheDocument();
  });

  it('calls selectSpan when a row is clicked', () => {
    const tree = makeNode({ spanId: 'span-123', name: 'clickable-span' });
    render(
      <TraceTree tree={tree} traceStartTime="2025-01-01T00:00:00.000Z" traceLatencyMs={1000} />,
    );

    fireEvent.click(screen.getByText('clickable-span'));
    expect(mockSelectSpan).toHaveBeenCalledWith('span-123');
  });

  it('shows kind-specific icons', () => {
    const tree = makeNode({ kind: 'LLM', name: 'llm-span' });
    const { container } = render(
      <TraceTree tree={tree} traceStartTime="2025-01-01T00:00:00.000Z" traceLatencyMs={1000} />,
    );

    // SpanKindIcon renders SVG with kind as title attribute
    expect(container.querySelector('[title="LLM"]')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders error spans correctly', () => {
    const tree = makeNode({ status: 'ERROR', name: 'error-span' });
    render(
      <TraceTree tree={tree} traceStartTime="2025-01-01T00:00:00.000Z" traceLatencyMs={1000} />,
    );

    // Error span renders with its name and a data-testid
    expect(screen.getByText('error-span')).toBeInTheDocument();
    expect(screen.getByTestId('span-row-s1')).toBeInTheDocument();
  });

  it('shows token count badge for LLM spans', () => {
    const tree = makeNode({
      kind: 'LLM',
      name: 'llm-with-tokens',
      tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
    });
    render(
      <TraceTree tree={tree} traceStartTime="2025-01-01T00:00:00.000Z" traceLatencyMs={1000} />,
    );

    expect(screen.getByText('700')).toBeInTheDocument();
  });

  it('shows descendant count badge when collapsed', () => {
    const grandchild = makeNode({
      spanId: 's3',
      parentSpanId: 's2',
      name: 'grandchild',
      kind: 'TOOL',
    });
    const child = makeNode({
      spanId: 's2',
      parentSpanId: 's1',
      name: 'child',
      kind: 'LLM',
    }, [grandchild]);
    const tree = makeNode({ name: 'root' }, [child]);

    const { container } = render(
      <TraceTree tree={tree} traceStartTime="2025-01-01T00:00:00.000Z" traceLatencyMs={1000} />,
    );

    // Collapse root (click the root's toggle button)
    const toggleBtn = container.querySelector('.span-controls button') as HTMLElement;
    fireEvent.click(toggleBtn);

    // Should show descendant count badge
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
