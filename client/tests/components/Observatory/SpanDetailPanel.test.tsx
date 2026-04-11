// EX4: SpanDetailPanel Component Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpanDetailPanel } from '../../../src/components/Observatory/SpanDetailPanel';
import type { Span } from 'headlessos-shared/schemas/observatory';

vi.mock('../../../src/store/observatory-store', () => {
  let _span: Span | null = null;
  let _spanId: string | null = null;
  return {
    useObservatoryStore: (selector?: (state: unknown) => unknown) => {
      const state = { selectedSpan: _span, selectedSpanId: _spanId };
      return selector ? selector(state) : state;
    },
    __setSpan: (s: Span | null) => { _span = s; _spanId = s?.spanId ?? null; },
  };
});

const { __setSpan } = await import('../../../src/store/observatory-store') as unknown as {
  __setSpan: (s: Span | null) => void;
};

const makeSpan = (overrides: Partial<Span> = {}): Span => ({
  spanId: 's1',
  traceId: 't1',
  parentSpanId: null,
  name: 'llm-call',
  kind: 'LLM',
  status: 'OK',
  startTime: '2025-01-01T00:00:00.000Z',
  endTime: '2025-01-01T00:00:01.500Z',
  latencyMs: 1500,
  model: 'gpt-4.1',
  modelRole: 'structured-output',
  tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
  costUsd: 0.003,
  input: { prompt: 'test prompt' },
  output: { result: 'test result' },
  error: null,
  cumulative: null,
  attributes: { source: 'test' },
  ...overrides,
});

describe('SpanDetailPanel', () => {
  beforeEach(() => {
    __setSpan(null);
  });

  it('shows empty state when no span selected', () => {
    render(<SpanDetailPanel />);
    expect(screen.getByText('Select a span to view details')).toBeInTheDocument();
  });

  it('renders span name and kind', () => {
    __setSpan(makeSpan());
    render(<SpanDetailPanel />);
    expect(screen.getByText('llm-call')).toBeInTheDocument();
    // SpanKindToken renders kind in lowercase
    expect(screen.getByText('llm')).toBeInTheDocument();
  });

  it('renders model information for LLM spans', () => {
    __setSpan(makeSpan());
    render(<SpanDetailPanel />);
    expect(screen.getByText('gpt-4.1')).toBeInTheDocument();
    expect(screen.getByText('structured-output')).toBeInTheDocument();
  });

  it('renders token usage with up/down arrows', () => {
    __setSpan(makeSpan());
    render(<SpanDetailPanel />);
    expect(screen.getByText('↑500')).toBeInTheDocument(); // input tokens
    expect(screen.getByText('↓200')).toBeInTheDocument(); // output tokens
  });

  it('renders latency in header', () => {
    __setSpan(makeSpan({ latencyMs: 2500 }));
    render(<SpanDetailPanel />);
    // formatLatency(2500) → '2.5s'
    expect(screen.getByText(/2\.5s/)).toBeInTheDocument();
  });

  it('renders error banner for error spans', () => {
    __setSpan(makeSpan({
      status: 'ERROR',
      error: 'Something went wrong',
    }));
    render(<SpanDetailPanel />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders OK status icon', () => {
    __setSpan(makeSpan({ status: 'OK' }));
    render(<SpanDetailPanel />);
    // SpanStatusIcon renders with title attribute
    expect(screen.getByTitle('OK')).toBeInTheDocument();
  });

  it('has Inputs/Outputs, Attributes, and JSON tabs', () => {
    __setSpan(makeSpan());
    render(<SpanDetailPanel />);
    expect(screen.getByText('Inputs / Outputs')).toBeInTheDocument();
    expect(screen.getByText('Attributes')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
  });

  it('shows chat-style messages for LLM spans', () => {
    __setSpan(makeSpan());
    render(<SpanDetailPanel />);
    // Chat view shows user/assistant labels
    expect(screen.getByText('user')).toBeInTheDocument();
    expect(screen.getByText('assistant')).toBeInTheDocument();
  });

  it('shows tool call format for TOOL spans', () => {
    __setSpan(makeSpan({
      kind: 'TOOL',
      name: 'validate-path',
      model: null,
      modelRole: null,
      tokenUsage: null,
      input: { path: '/home' },
      output: { valid: true },
    }));
    render(<SpanDetailPanel />);
    // ToolCallBlock renders separate Input and Output cards
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
  });
});
