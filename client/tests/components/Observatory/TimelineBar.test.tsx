// EX4: TimelineBar Component Tests
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineBar } from '../../../src/components/Observatory/TimelineBar';

describe('TimelineBar', () => {
  const base = {
    traceStartTime: '2025-01-01T00:00:00.000Z',
    traceLatencyMs: 1000,
    kind: 'LLM',
  };

  it('renders a bar with correct left and width', () => {
    const { container } = render(
      <TimelineBar
        spanStartTime="2025-01-01T00:00:00.200Z"
        spanLatencyMs={300}
        {...base}
      />,
    );

    // Find the inner bar (has position: absolute)
    const divs = container.querySelectorAll('div');
    const bar = Array.from(divs).find(d => d.style.position === 'absolute') as HTMLElement;
    expect(bar).toBeTruthy();
    // 200ms offset / 1000ms total = 20% left
    expect(bar.style.left).toBe('20%');
    // 300ms / 1000ms = 30% width
    expect(bar.style.width).toBe('30%');
  });

  it('renders empty div when traceLatencyMs is 0', () => {
    const { container } = render(
      <TimelineBar
        spanStartTime="2025-01-01T00:00:00.000Z"
        spanLatencyMs={100}
        traceStartTime="2025-01-01T00:00:00.000Z"
        traceLatencyMs={0}
        kind="LLM"
      />,
    );

    // Returns a plain div with height — no inner bar with position: absolute
    const divs = container.querySelectorAll('div');
    const bar = Array.from(divs).find(d => d.style.position === 'absolute');
    expect(bar).toBeFalsy();
  });

  it('handles null spanLatencyMs', () => {
    const { container } = render(
      <TimelineBar
        spanStartTime="2025-01-01T00:00:00.000Z"
        spanLatencyMs={null}
        {...base}
      />,
    );

    const divs = container.querySelectorAll('div');
    const bar = Array.from(divs).find(d => d.style.position === 'absolute') as HTMLElement;
    expect(bar).toBeTruthy();
    // duration = 0, minimum width 0.5%
    expect(bar.style.width).toBe('0.5%');
  });

  it('clamps left percentage to 0-100', () => {
    // spanStart before traceStart (negative offset)
    const { container } = render(
      <TimelineBar
        spanStartTime="2024-12-31T23:59:59.000Z"
        spanLatencyMs={100}
        {...base}
      />,
    );

    const divs = container.querySelectorAll('div');
    const bar = Array.from(divs).find(d => d.style.position === 'absolute') as HTMLElement;
    expect(parseFloat(bar.style.left)).toBe(0);
  });

  it('applies correct inline color for different kinds', () => {
    const findBar = (c: HTMLElement) => {
      const divs = c.querySelectorAll('div');
      return Array.from(divs).find(d => d.style.position === 'absolute') as HTMLElement;
    };

    const { container: c1 } = render(
      <TimelineBar spanStartTime={base.traceStartTime} spanLatencyMs={100} {...base} kind="LLM" />,
    );
    expect(findBar(c1).style.backgroundColor).toBe('rgb(255, 162, 59)');

    const { container: c2 } = render(
      <TimelineBar spanStartTime={base.traceStartTime} spanLatencyMs={100} {...base} kind="AGENT" />,
    );
    expect(findBar(c2).style.backgroundColor).toBe('rgb(176, 176, 176)');

    const { container: c3 } = render(
      <TimelineBar spanStartTime={base.traceStartTime} spanLatencyMs={100} {...base} kind="TOOL" />,
    );
    expect(findBar(c3).style.backgroundColor).toBe('rgb(247, 216, 4)');
  });

  it('falls back to default color for unknown kinds', () => {
    const { container } = render(
      <TimelineBar spanStartTime={base.traceStartTime} spanLatencyMs={100} {...base} kind="UNKNOWN" />,
    );
    const divs = container.querySelectorAll('div');
    const bar = Array.from(divs).find(d => d.style.position === 'absolute') as HTMLElement;
    // Unknown kind falls back to AGENT color
    expect(bar.style.backgroundColor).toBe('rgb(176, 176, 176)');
  });

  it('ensures minimum bar width with minWidth style', () => {
    const { container } = render(
      <TimelineBar
        spanStartTime={base.traceStartTime}
        spanLatencyMs={0}
        {...base}
      />,
    );

    const divs = container.querySelectorAll('div');
    const bar = Array.from(divs).find(d => d.style.position === 'absolute') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.minWidth).toBe('2px');
  });
});
