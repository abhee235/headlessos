// EX2.11: Agent UI Panel — Tests
// @see docs/phases/phase-ex2.md — EX2.11

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentPanel, type AgentEventType, type AgentMetaType } from '@/components/Agent/AgentPanel';

// ── Helpers ──

let stepIdCounter = 0;

function makeStep(event: AgentEventType) {
  return { id: ++stepIdCounter, event, timestamp: Date.now() };
}

function resetCounter() {
  stepIdCounter = 0;
}

// ── Tests ──

describe('AgentPanel', () => {
  beforeEach(() => resetCounter());

  describe('basic rendering', () => {
    it('renders the panel with header', () => {
      render(<AgentPanel events={[]} isRunning={false} />);
      expect(screen.getByTestId('agent-panel')).toBeInTheDocument();
      expect(screen.getByText('UI Agent')).toBeInTheDocument();
    });

    it('shows working indicator when running', () => {
      render(<AgentPanel events={[]} isRunning={true} />);
      expect(screen.getByText('Working...')).toBeInTheDocument();
    });

    it('does not show working indicator when not running', () => {
      render(<AgentPanel events={[]} isRunning={false} />);
      expect(screen.queryByText('Working...')).not.toBeInTheDocument();
    });

    it('shows abort button when running', () => {
      const onAbort = vi.fn();
      render(<AgentPanel events={[]} isRunning={true} onAbort={onAbort} />);
      const abortBtn = screen.getByTestId('abort-button');
      expect(abortBtn).toBeInTheDocument();
      fireEvent.click(abortBtn);
      expect(onAbort).toHaveBeenCalledTimes(1);
    });

    it('does not show abort button when not running', () => {
      render(<AgentPanel events={[]} isRunning={false} />);
      expect(screen.queryByTestId('abort-button')).not.toBeInTheDocument();
    });
  });

  describe('event rendering', () => {
    it('renders thinking events', () => {
      const events = [makeStep({ type: 'thinking', message: 'Understanding your request...' })];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.getByText('Understanding your request...')).toBeInTheDocument();
    });

    it('renders tool_result events with timing', () => {
      const events = [
        makeStep({ type: 'tool_result', tool: 'exec_command', success: true, outputPreview: 'Ubuntu 22.04', latencyMs: 340 }),
      ];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.getByText('exec_command()')).toBeInTheDocument();
      expect(screen.getByText('340ms')).toBeInTheDocument();
    });

    it('renders failed tool_result events', () => {
      const events = [
        makeStep({ type: 'tool_result', tool: 'exec_command', success: false, outputPreview: 'command not found', latencyMs: 50 }),
      ];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.getByText('exec_command()')).toBeInTheDocument();
    });

    it('renders tool_blocked events', () => {
      const events = [
        makeStep({ type: 'tool_blocked', tool: 'exec_command', reason: 'Command not in allowlist' }),
      ];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.getByText('exec_command() — blocked')).toBeInTheDocument();
    });

    it('renders generation_complete events', () => {
      const events = [
        makeStep({ type: 'generation_complete', view: {} }),
      ];
      render(<AgentPanel events={events} isRunning={false} />);
      expect(screen.getByText('Schema generated — Zod validation passed')).toBeInTheDocument();
    });

    it('renders reflection approve events', () => {
      const events = [
        makeStep({ type: 'reflection', feedback: 'Schema is complete', action: 'approve' }),
      ];
      render(<AgentPanel events={events} isRunning={false} />);
      expect(screen.getByText(/Reflection: Approved/)).toBeInTheDocument();
    });

    it('renders reflection fix events', () => {
      const events = [
        makeStep({ type: 'reflection', feedback: 'Missing data rows', action: 'fix' }),
      ];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.getByText(/Reflection: Fix needed/)).toBeInTheDocument();
    });

    it('renders safety_warning for tool repetition', () => {
      const events = [
        makeStep({ type: 'safety_warning', warning: 'tool_repetition', tool: 'exec_command', message: 'Called 5 times' }),
      ];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.getByText(/Tool repetition: exec_command/)).toBeInTheDocument();
    });

    it('renders safety_warning for consecutive mistakes', () => {
      const events = [
        makeStep({ type: 'safety_warning', warning: 'consecutive_mistakes', message: 'Agent stopped making progress' }),
      ];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.getByText('Agent stopped making progress')).toBeInTheDocument();
    });

    it('renders rate_limited events with countdown', () => {
      const events = [
        makeStep({ type: 'rate_limited', retryInMs: 4000, attempt: 2 }),
      ];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.getByTestId('rate-limit-countdown')).toBeInTheDocument();
      expect(screen.getByText(/Rate limited/)).toBeInTheDocument();
    });

    it('renders context_compacted events', () => {
      const events = [
        makeStep({ type: 'context_compacted', originalTokens: 12000, compactedTokens: 3000 }),
      ];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.getByText(/12000 → 3000 tokens/)).toBeInTheDocument();
    });

    it('renders error events', () => {
      const events = [
        makeStep({ type: 'error', message: 'Agent reached max steps' }),
      ];
      render(<AgentPanel events={events} isRunning={false} />);
      expect(screen.getByText('Agent reached max steps')).toBeInTheDocument();
    });
  });

  describe('expandable tool results', () => {
    it('expands tool_result on click to show output', () => {
      const events = [
        makeStep({ type: 'tool_result', tool: 'exec_command', success: true, outputPreview: 'Ubuntu 22.04 LTS', latencyMs: 100 }),
      ];
      render(<AgentPanel events={events} isRunning={false} />);
      // Not expanded initially
      expect(screen.queryByText('Ubuntu 22.04 LTS')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByText('exec_command()'));
      expect(screen.getByText('Ubuntu 22.04 LTS')).toBeInTheDocument();
    });
  });

  describe('meta footer', () => {
    it('renders meta when complete event is present', () => {
      const meta: AgentMetaType = {
        sessionId: 'test-123',
        latencyMs: 2300,
        stepsCompleted: 6,
        reflectionLoops: 1,
        models: { reasoning: 'o4-mini', 'structured-output': 'gpt-4.1' },
      };
      const events = [
        makeStep({ type: 'thinking', message: 'Starting...' }),
        makeStep({ type: 'complete', view: {}, meta }),
      ];
      render(<AgentPanel events={events} isRunning={false} />);

      const footer = screen.getByTestId('agent-meta');
      expect(footer).toBeInTheDocument();
      expect(footer.textContent).toContain('6 steps');
      expect(footer.textContent).toContain('2.3s');
    });

    it('does not render meta when no complete event', () => {
      const events = [
        makeStep({ type: 'thinking', message: 'Working...' }),
      ];
      render(<AgentPanel events={events} isRunning={true} />);
      expect(screen.queryByTestId('agent-meta')).not.toBeInTheDocument();
    });
  });

  describe('collapse/expand', () => {
    it('collapses to minimal view', () => {
      const { container } = render(<AgentPanel events={[]} isRunning={false} />);
      expect(screen.getByTestId('agent-panel')).toBeInTheDocument();

      // Click minimize button
      const minimizeBtn = container.querySelector('[data-testid="agent-panel"] button:last-child');
      expect(minimizeBtn).toBeInTheDocument();
      fireEvent.click(minimizeBtn!);

      expect(screen.getByTestId('agent-panel-collapsed')).toBeInTheDocument();
      expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    });

    it('expands from collapsed view', () => {
      const { container } = render(<AgentPanel events={[]} isRunning={false} />);
      // Collapse first
      const minimizeBtn = container.querySelector('[data-testid="agent-panel"] button:last-child');
      fireEvent.click(minimizeBtn!);

      expect(screen.getByTestId('agent-panel-collapsed')).toBeInTheDocument();

      // Expand
      const expandBtn = screen.getByTestId('agent-panel-collapsed').querySelector('button');
      fireEvent.click(expandBtn!);
      expect(screen.getByTestId('agent-panel')).toBeInTheDocument();
    });
  });

  describe('multiple events timeline', () => {
    it('renders a complete flow of events', () => {
      const meta: AgentMetaType = {
        sessionId: 'flow-test',
        latencyMs: 3500,
        stepsCompleted: 5,
        reflectionLoops: 0,
        models: { reasoning: 'o4-mini' },
      };

      const events = [
        makeStep({ type: 'thinking', message: 'Understanding request...' }),
        makeStep({ type: 'tool_result', tool: 'get_server_context', success: true, outputPreview: 'Ubuntu 22.04', latencyMs: 45 }),
        makeStep({ type: 'tool_result', tool: 'exec_command', success: true, outputPreview: 'nginx running', latencyMs: 340 }),
        makeStep({ type: 'generation_complete', view: {} }),
        makeStep({ type: 'reflection', feedback: 'Approved', action: 'approve' }),
        makeStep({ type: 'complete', view: {}, meta }),
      ];

      render(<AgentPanel events={events} isRunning={false} />);

      // All visible steps
      expect(screen.getByText('Understanding request...')).toBeInTheDocument();
      expect(screen.getByText('get_server_context()')).toBeInTheDocument();
      expect(screen.getByText('exec_command()')).toBeInTheDocument();
      expect(screen.getByText('Schema generated — Zod validation passed')).toBeInTheDocument();
      expect(screen.getByText(/Reflection: Approved/)).toBeInTheDocument();
      expect(screen.getByTestId('agent-meta')).toBeInTheDocument();
    });
  });
});
