// EX9.2: approval cards — the AI Agent's "Allow changes (asks first)" and generated view buttons
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { ApprovalRequest } from '../../src/lib/api';

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
  answerAgentApproval: vi.fn(async () => ({ success: true })),
  previewViewAction: vi.fn(),
  runViewAction: vi.fn(async () => ({ success: true, output: 'done' })),
  denyViewAction: vi.fn(async () => ({ success: true })),
  executeWidgetAction: vi.fn(async () => ({ success: true, output: 'legacy ok' })),
}));
vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, ...api };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

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

import { ApprovalCard } from '../../src/components/Agent/ApprovalCard';
import { AgentView } from '../../src/components/Agent/AgentView';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { TableWidget } from '../../src/components/DynamicUI/widgets/TableWidget';
import { DynamicViewProvider } from '../../src/components/DynamicUI/DynamicViewContext';
import { fillParams } from '../../src/components/DynamicUI/view-actions';

const REQUEST: ApprovalRequest = {
  approvalId: 'appr-1', runId: 'run-1', source: 'agent', serverId: 'srv-1', serverName: 'web-1', host: '10.0.0.5',
  loginUser: 'deploy', actionId: 'service_restart', title: 'Restart service',
  command: 'sudo -n systemctl restart -- nginx', reason: 'nginx has been inactive since 09:12',
  requestedAt: '2026-10-22T10:00:00Z', expiresAt: '2026-10-22T10:10:00Z',
};

describe('ApprovalCard', () => {
  it('shows the full command, server, login user and reason', () => {
    render(<ApprovalCard request={REQUEST} status="pending" />);
    const card = screen.getByRole('alertdialog', { name: 'Allow Restart service?' });
    expect(card).toHaveTextContent('sudo -n systemctl restart -- nginx');
    expect(card).toHaveTextContent('web-1 (10.0.0.5)');
    expect(card).toHaveTextContent('deploy');
    expect(card).toHaveTextContent('nginx has been inactive since 09:12');
    expect(screen.queryByText(/always/i)).toBeNull();
  });

  it('focuses Allow once; Allow, Deny and Esc answer', () => {
    const onDecide = vi.fn();
    render(<ApprovalCard request={REQUEST} status="pending" onDecide={onDecide} />);
    expect(screen.getByRole('button', { name: 'Allow once' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onDecide.mock.calls).toEqual([['allow'], ['deny'], ['deny']]);
  });

  it('disables both buttons while the answer is on its way', () => {
    const onDecide = vi.fn();
    render(<ApprovalCard request={REQUEST} status="pending" busy onDecide={onDecide} />);
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onDecide).not.toHaveBeenCalled();
  });

  it.each([
    ['allowed', 'You allowed:'],
    ['denied', 'You denied:'],
    ['stopped', 'Stopped before an answer:'],
    ['expired', 'Not answered in time:'],
  ] as const)('collapses to one line when %s', (status, text) => {
    render(<ApprovalCard request={REQUEST} status={status} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('approval-settled')).toHaveTextContent(`${text}sudo -n systemctl restart -- nginx`);
  });
});

describe('AgentView — Allow changes (asks first)', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeSocket as unknown as typeof WebSocket);
    api.startAgentInvestigation.mockImplementation(() => new Promise((r) => { resolveRun = r; }));
    api.answerAgentApproval.mockClear();
  });

  it('is off by default, so runs are read-only', async () => {
    render(<TooltipProvider><AgentView serverId="srv-1" /></TooltipProvider>);
    expect(screen.getByRole('switch', { name: 'Allow changes (asks first)' })).not.toBeChecked();
    expect(screen.getByText(/Read-only — the agent can only run diagnostic actions/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('High memory usage'));
    await waitFor(() => expect(api.startAgentInvestigation).toHaveBeenCalled());
    expect(api.startAgentInvestigation.mock.calls.at(-1)![2]).toMatchObject({ readOnly: true });
    await act(async () => resolveRun({ success: true, data: { sessionId: 's', question: 'q', steps: [], answer: 'ok', totalSteps: 0, totalTokens: 0, totalLatencyMs: 1, status: 'completed' } }));
  });

  it('shows the card while the run waits, sends the answer, and collapses it', async () => {
    render(<TooltipProvider><AgentView serverId="srv-1" /></TooltipProvider>);
    fireEvent.click(screen.getByRole('switch', { name: 'Allow changes (asks first)' }));
    expect(screen.getByText(/Each change shows you the exact command/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Service down?'));
    await waitFor(() => expect(api.startAgentInvestigation).toHaveBeenCalled());
    expect(api.startAgentInvestigation.mock.calls.at(-1)![2]).toMatchObject({ readOnly: false });
    expect(screen.getByRole('switch', { name: 'Allow changes (asks first)' })).toBeDisabled();
    const ws = FakeSocket.last!;

    act(() => ws.emit({ kind: 'thought', step: 1, thought: 'nginx is down; restart it', decision: 'run_action', action: 'service_restart', command: REQUEST.command }));
    act(() => ws.emit({ kind: 'approval', step: 1, request: REQUEST }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(REQUEST.command);
    expect(screen.getByText('Waiting for your approval…')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }));
    await waitFor(() => expect(api.answerAgentApproval).toHaveBeenCalledWith('srv-1', 'appr-1', 'allow'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByTestId('approval-settled')).toHaveTextContent('You allowed:');

    act(() => ws.emit({ kind: 'approval_resolved', step: 1, approvalId: 'appr-1', decision: 'allow', by: 'owner' }));
    act(() => ws.emit({ kind: 'step', step: 1, data: { stepNumber: 1, thought: 'restart', action: 'service_restart', command: REQUEST.command, output: '', decision: 'continue', approval: { approvalId: 'appr-1', decision: 'allow', by: 'owner' } } }));
    expect(screen.getAllByTestId('approval-settled')).toHaveLength(1);
    await act(async () => resolveRun({ success: true, data: { sessionId: 's', question: 'q', steps: [], answer: 'restarted', totalSteps: 1, totalTokens: 0, totalLatencyMs: 1, status: 'completed' } }));
  });

  it('marks a card the run never heard back about as stopped', async () => {
    render(<TooltipProvider><AgentView serverId="srv-1" /></TooltipProvider>);
    fireEvent.click(screen.getByRole('switch', { name: 'Allow changes (asks first)' }));
    fireEvent.click(screen.getByText('Service down?'));
    await waitFor(() => expect(api.startAgentInvestigation).toHaveBeenCalled());
    act(() => FakeSocket.last!.emit({ kind: 'approval', step: 1, request: REQUEST }));
    await act(async () => resolveRun({ success: true, data: { sessionId: 's', question: 'q', steps: [], answer: 'stopped', totalSteps: 0, totalTokens: 0, totalLatencyMs: 1, status: 'aborted' } }));
    expect(screen.getByTestId('approval-settled')).toHaveTextContent('Stopped before an answer:');
  });
});

describe('generated view buttons', () => {
  const ROWS = [{ name: 'web-1', id: 'abcdef123456' }];
  const widget = (actions: unknown[]) => ({
    type: 'table' as const, columns: [{ key: 'name', label: 'Name' }], rows: ROWS, actions,
  });
  const renderTable = (actions: unknown[]) => render(
    <DynamicViewProvider serverId="srv-1">
      <TableWidget widget={widget(actions) as never} />
    </DynamicViewProvider>,
  );

  beforeEach(() => {
    for (const fn of [api.previewViewAction, api.runViewAction, api.denyViewAction, api.executeWidgetAction]) fn.mockClear();
  });

  it('fills {column} placeholders from the row', () => {
    expect(fillParams({ container: '{name}', note: 'id={id}', keep: '{missing}' }, ROWS[0]!))
      .toEqual({ container: 'web-1', note: 'id=abcdef123456', keep: '{missing}' });
  });

  it('runs a read action straight away', async () => {
    api.previewViewAction.mockResolvedValue({ success: true, risk: 'read', actionId: 'docker_logs', title: 'Container logs', command: 'docker logs …' });
    renderTable([{ id: 'logs', label: 'Logs', action: { id: 'docker_logs', params: { container: '{name}' } } }]);
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));
    await waitFor(() => expect(api.runViewAction).toHaveBeenCalledWith('srv-1', { actionId: 'docker_logs', params: { container: 'web-1' } }));
    expect(api.previewViewAction).toHaveBeenCalledWith('srv-1', 'docker_logs', { container: 'web-1' }, 'Logs');
  });

  it('shows the approval card for a change, and Allow runs the previewed approval', async () => {
    api.previewViewAction.mockResolvedValue({
      success: true, risk: 'change', actionId: 'container_restart', title: 'Restart container', command: 'docker restart -- web-1',
      approval: { ...REQUEST, approvalId: 'appr-view', source: 'view', command: 'docker restart -- web-1', reason: 'Button “Restart” in a generated view' },
    });
    renderTable([{ id: 'restart', label: 'Restart', confirm: true, action: { id: 'container_restart', params: { container: '{name}' } } }]);
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    const card = await screen.findByRole('alertdialog');
    expect(card).toHaveTextContent('docker restart -- web-1');
    expect(api.runViewAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }));
    await waitFor(() => expect(api.runViewAction).toHaveBeenCalledWith('srv-1', { approvalId: 'appr-view' }));
    expect(api.runViewAction).toHaveBeenCalledTimes(1);
  });

  it('Deny drops the approval and runs nothing', async () => {
    api.previewViewAction.mockResolvedValue({
      success: true, risk: 'change', actionId: 'container_stop', title: 'Stop container', command: 'docker stop -- web-1',
      approval: { ...REQUEST, approvalId: 'appr-deny', source: 'view', command: 'docker stop -- web-1' },
    });
    renderTable([{ id: 'stop', label: 'Stop', action: { id: 'container_stop', params: { container: '{name}' } } }]);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    await waitFor(() => expect(api.denyViewAction).toHaveBeenCalledWith('srv-1', 'appr-deny'));
    expect(api.denyViewAction).toHaveBeenCalledTimes(1);
    expect(api.runViewAction).not.toHaveBeenCalled();
  });

  it('keeps legacy command buttons on the old path', async () => {
    renderTable([{ id: 'ps', label: 'List', command: 'docker ps' }]);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(api.executeWidgetAction).toHaveBeenCalledWith('srv-1', 'docker ps', { name: 'web-1', id: 'abcdef123456' }));
    expect(api.previewViewAction).not.toHaveBeenCalled();
  });
});
