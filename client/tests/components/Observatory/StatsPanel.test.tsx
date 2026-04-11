// EX4: StatsPanel Component Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsPanel } from '../../../src/components/Observatory/StatsPanel';
import type { ObservatoryStats } from 'headlessos-shared/schemas/observatory';

vi.mock('../../../src/store/observatory-store', () => {
  let mockStats: ObservatoryStats | null = null;
  return {
    useObservatoryStore: (selector: (state: unknown) => unknown) =>
      selector({ stats: mockStats }),
    __setMockStats: (s: ObservatoryStats | null) => { mockStats = s; },
  };
});

const { __setMockStats } = await import('../../../src/store/observatory-store') as unknown as {
  __setMockStats: (s: ObservatoryStats | null) => void;
};

const makeStats = (overrides: Partial<ObservatoryStats> = {}): ObservatoryStats => ({
  totalTraces: 10,
  totalSpans: 50,
  totalTokens: 5000,
  totalCostUsd: 0.15,
  averageLatencyMs: 1250,
  spansByKind: { LLM: 20, AGENT: 15, CHAIN: 10, TOOL: 5 },
  tokensByModel: { 'gpt-4.1': 3000, 'gpt-4.1-mini': 2000 },
  ...overrides,
});

describe('StatsPanel', () => {
  beforeEach(() => {
    __setMockStats(null);
  });

  it('returns null when stats is null', () => {
    __setMockStats(null);
    const { container } = render(<StatsPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders stats cards when data exists', () => {
    __setMockStats(makeStats());
    render(<StatsPanel />);

    expect(screen.getByText('Traces')).toBeInTheDocument();
    expect(screen.getByText('Spans')).toBeInTheDocument();
    expect(screen.getByText('Tokens')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
    expect(screen.getByText('Avg Latency')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
  });

  it('formats large token counts with K suffix', () => {
    __setMockStats(makeStats({ totalTokens: 15000 }));
    render(<StatsPanel />);
    expect(screen.getByText('15.0k')).toBeInTheDocument();
  });

  it('formats cost in USD', () => {
    __setMockStats(makeStats({ totalCostUsd: 0.15 }));
    render(<StatsPanel />);
    expect(screen.getByText('$0.15')).toBeInTheDocument();
  });

  it('displays span kind breakdown', () => {
    __setMockStats(makeStats({
      spansByKind: { LLM: 10, AGENT: 5, CHAIN: 0, TOOL: 3 },
    }));
    render(<StatsPanel />);
    // SpanKindIcon renders with title attribute for each non-zero kind
    expect(screen.getByTitle('LLM')).toBeInTheDocument();
    expect(screen.getByTitle('AGENT')).toBeInTheDocument();
    expect(screen.getByTitle('TOOL')).toBeInTheDocument();
    // CHAIN has 0 count — should not be shown
    expect(screen.queryByTitle('CHAIN')).not.toBeInTheDocument();
  });
});
