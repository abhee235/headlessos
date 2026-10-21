// EX8.24: AI Agent window — steps appear while the investigation runs; Stop aborts it
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

let resolveRun: (v: unknown) => void = () => {};
const api = vi.hoisted(() => ({
  startAgentInvestigation: vi.fn(),
  abortAgentInvestigation: vi.fn(async () => ({ success: true })),
}));
vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, ...api };
});

class FakeSocket {
  static last: FakeSocket | null = null;
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  closed = false;
  constructor(url: string) { this.url = url; FakeSocket.last = this; setTimeout(() => this.onopen?.(), 0); }
  send() {}
  close() { this.closed = true; }
  emit(e: unknown) { this.onmessage?.({ data: JSON.stringify(e) }); }
}

import { AgentView } from '../../src/components/Agent/AgentView';
import { TooltipProvider } from '../../src/components/ui/tooltip';

describe('AgentView live progress', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeSocket as unknown as typeof WebSocket);
    api.startAgentInvestigation.mockImplementation(() => new Promise((r) => { resolveRun = r; }));
    api.abortAgentInvestigation.mockClear();
  });

  it('opens the progress socket for its own session id, shows each step, then the diagnosis', async () => {
    render(<TooltipProvider><AgentView serverId="srv-1" /></TooltipProvider>);
    fireEvent.click(screen.getByText('High memory usage'));

    await waitFor(() => expect(api.startAgentInvestigation).toHaveBeenCalled());
    const ws = FakeSocket.last!;
    const sessionId = api.startAgentInvestigation.mock.calls[0][2].sessionId as string;
    expect(ws.url).toContain(`/ws/agent/srv-1/${sessionId}`);
    expect(screen.getByText('Thinking…')).toBeInTheDocument();

    act(() => ws.emit({ kind: 'thought', step: 1, thought: 'Check memory', decision: 'run_action', action: 'memory_usage', command: 'free -m' }));
    expect(screen.getByText('Running command…')).toBeInTheDocument();
    expect(screen.getByText('free -m')).toBeInTheDocument();

    act(() => ws.emit({ kind: 'step', step: 1, data: { stepNumber: 1, thought: 'Check memory', action: 'memory_usage', command: 'free -m', output: 'Mem: 16G', decision: 'continue' } }));
    expect(screen.getByText('Check memory')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument(); // the next step is already thinking

    await act(async () => resolveRun({
      success: true,
      data: { sessionId, question: 'q', steps: [{ stepNumber: 1, thought: 'Check memory', command: 'free -h', decision: 'continue' }], answer: '9 of 16 GB used', totalSteps: 1, totalTokens: 15, totalLatencyMs: 4200, status: 'completed' },
    }));
    expect(screen.getByText('9 of 16 GB used')).toBeInTheDocument();
    expect(screen.queryByText('Step 2')).toBeNull();
    expect(ws.closed).toBe(true);
  });

  it('Stop aborts the running session', async () => {
    render(<TooltipProvider><AgentView serverId="srv-1" /></TooltipProvider>);
    fireEvent.click(screen.getByText('High memory usage'));
    await waitFor(() => expect(api.startAgentInvestigation).toHaveBeenCalled());
    const sessionId = api.startAgentInvestigation.mock.calls.at(-1)![2].sessionId;
    fireEvent.click(screen.getByRole('button', { name: 'Stop investigation' }));
    expect(api.abortAgentInvestigation).toHaveBeenCalledWith('srv-1', sessionId);
    expect(screen.getByText('Stopping…')).toBeInTheDocument();
  });
});
