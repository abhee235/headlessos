// EX4: TraceDetailView Component Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TraceDetailView } from '../../../src/components/Observatory/TraceDetailView';
import type { Trace, SpanTreeNode } from 'headlessos-shared/schemas/observatory';

const mockOnBack = vi.fn();

let mockState: {
  selectedTrace: Trace | null;
  selectedSpanTree: SpanTreeNode | null;
  selectedSpanId: string | null;
  selectSpan: ReturnType<typeof vi.fn>;
};

vi.mock('../../../src/store/observatory-store', () => ({
  useObservatoryStore: (selector?: (state: unknown) => unknown) =>
    selector ? selector(mockState) : mockState,
}));

// Mock ResizablePanelGroup since it doesn't work in jsdom
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children, ...props }: { children: React.ReactNode }) => <div data-testid="panel-group" {...props}>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div data-testid="resize-handle" />,
}));

// Mock child components to avoid complex rendering
vi.mock('../../../src/components/Observatory/TraceTree', () => ({
  TraceTree: ({ tree }: { tree: SpanTreeNode }) => <div data-testid="trace-tree">{tree.span.name}</div>,
}));

vi.mock('../../../src/components/Observatory/SpanDetailPanel', () => ({
  SpanDetailPanel: () => <div data-testid="span-detail-panel">Span Detail</div>,
}));

const makeTrace = (overrides: Partial<Trace> = {}): Trace => ({
  traceId: 't1',
  rootSpanId: 'root-s1',
  name: 'Test Trace',
  trigger: 'ui-agent',
  status: 'OK',
  startTime: '2025-01-01T00:00:00.000Z',
  endTime: '2025-01-01T00:00:01.000Z',
  latencyMs: 1000,
  totalSpans: 3,
  totalTokens: 1500,
  totalCostUsd: 0.05,
  spansByKind: { LLM: 2, AGENT: 1 },
  serverId: null,
  ...overrides,
});

const makeTree = (): SpanTreeNode => ({
  span: {
    spanId: 's1',
    traceId: 't1',
    parentSpanId: null,
    name: 'root',
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
  },
  children: [],
});

describe('TraceDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      selectedTrace: makeTrace(),
      selectedSpanTree: makeTree(),
      selectedSpanId: null,
      selectSpan: vi.fn(),
    };
  });

  it('renders loading state when no trace', () => {
    mockState.selectedTrace = null;
    render(<TraceDetailView onBack={mockOnBack} />);
    expect(screen.getByText('Loading trace...')).toBeInTheDocument();
  });

  it('renders trace name in header', () => {
    render(<TraceDetailView onBack={mockOnBack} />);
    expect(screen.getByText('Test Trace')).toBeInTheDocument();
  });

  it('shows status badge', () => {
    render(<TraceDetailView onBack={mockOnBack} />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    render(<TraceDetailView onBack={mockOnBack} />);
    // Back button is an icon-only button (ArrowLeft) — find by role
    const backButton = screen.getAllByRole('button')[0];
    fireEvent.click(backButton);
    expect(mockOnBack).toHaveBeenCalled();
  });

  it('shows trace tree when span tree available', () => {
    render(<TraceDetailView onBack={mockOnBack} />);
    expect(screen.getByTestId('trace-tree')).toBeInTheDocument();
  });

  it('shows span detail panel', () => {
    render(<TraceDetailView onBack={mockOnBack} />);
    expect(screen.getByTestId('span-detail-panel')).toBeInTheDocument();
  });

  it('shows loading message when no span tree', () => {
    mockState.selectedSpanTree = null;
    render(<TraceDetailView onBack={mockOnBack} />);
    expect(screen.getByText('Loading span tree...')).toBeInTheDocument();
  });

  it('shows span count in header', () => {
    render(<TraceDetailView onBack={mockOnBack} />);
    // Span count "3" appears in both header stats and panel badge
    const elements = screen.getAllByText('3');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-selects root span when tree loads', () => {
    render(<TraceDetailView onBack={mockOnBack} />);
    expect(mockState.selectSpan).toHaveBeenCalledWith('s1');
  });
});
