// EX10.4: UI Agent completion — finished, or stopped early with the reason
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UIAgentCompletion } from '../../src/components/Agent/UIAgentCompletion';

const meta = { sessionId: 's', latencyMs: 43_200, stepsCompleted: 11, reflectionLoops: 0, models: {} };

describe('UIAgentCompletion', () => {
  it('shows a finished view as before', () => {
    render(<UIAgentCompletion meta={meta} />);
    expect(screen.getByText('View Generated')).toBeInTheDocument();
    expect(screen.getByText(/Completed in 43\.2s · 11 steps · View is open in a desktop window/)).toBeInTheDocument();
    expect(screen.queryByTestId('ui-agent-incomplete')).toBeNull();
  });

  it('says a view is partial, why it stopped, and what is still empty', () => {
    render(<UIAgentCompletion meta={{ ...meta, warning: 'Stopped early — 2 sections empty', incomplete: { reason: 'the model’s context window is full', emptySections: ['Docker', 'Network'] } }} />);
    expect(screen.getByTestId('ui-agent-incomplete')).toBeInTheDocument();
    expect(screen.getByText('View Partly Generated')).toBeInTheDocument();
    expect(screen.getByText('Stopped early: the model’s context window is full. Still empty: Docker, Network.')).toBeInTheDocument();
    expect(screen.queryByText('View Generated')).toBeNull();
  });

  it('leaves out "still empty" when every section has something', () => {
    render(<UIAgentCompletion meta={{ ...meta, incomplete: { reason: 'it reached the maximum step limit (30)', emptySections: [] } }} />);
    expect(screen.getByText('Stopped early: it reached the maximum step limit (30).')).toBeInTheDocument();
  });
});
