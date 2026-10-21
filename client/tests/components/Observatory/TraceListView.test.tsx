// EX4: TraceListView Component Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TraceListView } from '../../../src/components/Observatory/TraceListView';
import type { TraceSummary } from 'headlessos-shared/schemas/observatory';

const mockFetchTraces = vi.fn();
const mockSelectTrace = vi.fn();
const mockClearTraces = vi.fn();
const mockSetFilter = vi.fn();

let mockState = {
  traces: [] as TraceSummary[],
  totalTraces: 0,
  loading: false,
  error: null as string | null,
  filters: {} as Record<string, unknown>,
  setFilter: mockSetFilter,
  fetchTraces: mockFetchTraces,
  selectTrace: mockSelectTrace,
  clearTraces: mockClearTraces,
};

vi.mock('../../../src/store/observatory-store', () => ({
  useObservatoryStore: (selector?: (state: unknown) => unknown) =>
    selector ? selector(mockState) : mockState,
}));

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

describe('TraceListView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      traces: [],
      totalTraces: 0,
      loading: false,
      error: null,
      filters: {},
      setFilter: mockSetFilter,
      fetchTraces: mockFetchTraces,
      selectTrace: mockSelectTrace,
      clearTraces: mockClearTraces,
    };
  });

  it('shows empty state when no traces', () => {
    render(<TraceListView />);
    expect(screen.getByText(/No traces yet/)).toBeInTheDocument();
  });

  it('shows loading skeletons when loading with no data', () => {
    mockState.loading = true;
    const { container } = render(<TraceListView />);
    // Skeleton divs should be rendered
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error message', () => {
    mockState.error = 'Connection failed';
    render(<TraceListView />);
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('renders traces in a table', () => {
    mockState.traces = [makeSummary('t1'), makeSummary('t2')];
    mockState.totalTraces = 2;
    render(<TraceListView />);

    expect(screen.getByText('Traces (2)')).toBeInTheDocument();
    expect(screen.getByText('trace-t1')).toBeInTheDocument();
    expect(screen.getByText('trace-t2')).toBeInTheDocument();
  });

  it('calls selectTrace when a row is clicked', () => {
    mockState.traces = [makeSummary('t1')];
    mockState.totalTraces = 1;
    render(<TraceListView />);

    fireEvent.click(screen.getByText('trace-t1'));
    expect(mockSelectTrace).toHaveBeenCalledWith('t1');
  });

  it('calls fetchTraces when refresh button is clicked', () => {
    render(<TraceListView />);
    // RefreshCw icon is in a button - find it by role
    const buttons = screen.getAllByRole('button');
    // The refresh button is a ghost button with the clockwise RotateCw icon
    const refreshBtn = buttons.find(b => b.querySelector('.lucide-rotate-cw'));
    expect(refreshBtn).toBeTruthy();
    fireEvent.click(refreshBtn!);
    expect(mockFetchTraces).toHaveBeenCalled();
  });

  it('calls clearTraces when trash button is clicked', () => {
    render(<TraceListView />);
    const buttons = screen.getAllByRole('button');
    // The trash/clear button is the last ghost button (has text-destructive class)
    const trashBtn = buttons.find(b => b.className.includes('text-destructive'));
    expect(trashBtn).toBeTruthy();
    fireEvent.click(trashBtn!);
    expect(mockClearTraces).toHaveBeenCalled();
  });

  it('displays trigger filter buttons', () => {
    render(<TraceListView />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('ui-agent')).toBeInTheDocument();
    expect(screen.getByText('dynamic-ui')).toBeInTheDocument();
  });

  it('calls setFilter when a trigger button is clicked', () => {
    render(<TraceListView />);
    fireEvent.click(screen.getByText('dynamic-ui'));
    expect(mockSetFilter).toHaveBeenCalledWith({ trigger: 'dynamic-ui' });
  });

  it('renders status column with SpanStatusIcon SVGs', () => {
    mockState.traces = [
      makeSummary('t1', { status: 'OK' }),
      makeSummary('t2', { status: 'ERROR' }),
    ];
    mockState.totalTraces = 2;
    render(<TraceListView />);

    // SpanStatusIcon renders SVGs with title attribute
    // Filter buttons + table rows both render status icons
    const okIcons = screen.getAllByTitle('OK');
    const errorIcons = screen.getAllByTitle('ERROR');
    expect(okIcons.length).toBeGreaterThanOrEqual(2); // filter btn + table row
    expect(errorIcons.length).toBeGreaterThanOrEqual(2);
  });
});
