// EX9.2: change actions through the runner — park, ask, run only on allow
// @see docs/phases/phase-ex9.md §7

import { describe, it, expect, vi } from 'vitest';
import { ActionRunner, denialMessage, type ApprovalEvent } from '../../../src/agent/actions/runner.js';
import { ApprovalGate } from '../../../src/agent/actions/approvals.js';
import type { ActionAudit, AuditEntry } from '../../../src/agent/actions/audit.js';
import { currentAgentScope, runAsAgent } from '../../../src/services/policy/agent-scope.js';
import { CommandPolicy } from '../../../src/services/policy/command-policy.js';

function setup(answer?: (e: ApprovalEvent, gate: ApprovalGate) => void) {
  const policy = new CommandPolicy('command-policy');
  policy.setMode('enforce');
  const ssh = {
    exec: vi.fn(async (_s: string, command: string) => {
      policy.assertAllowed(command); // like ConnectionManager
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 4 };
    }),
    getSftp: vi.fn(),
  };
  const lines: Array<Omit<AuditEntry, 'ts'>> = [];
  const audit = { log: vi.fn(async (e: Omit<AuditEntry, 'ts'>) => { lines.push(e); }) } as unknown as ActionAudit;
  const gate = new ApprovalGate({ audit });
  const events: ApprovalEvent[] = [];
  const runner = new ActionRunner({
    ssh: ssh as never, approvals: gate, audit,
    describeServer: () => ({ name: 'web-1', host: '10.0.0.5', username: 'deploy' }),
  });
  const onApproval = (e: ApprovalEvent) => { events.push(e); answer?.(e, gate); };
  return { ssh, gate, runner, events, lines, onApproval };
}

const RESTART = { unit: 'nginx', reason: 'nginx is inactive since 09:12' };

describe('change actions in an agent run', () => {
  it('asks with the full card, then runs exactly the built command on allow', async () => {
    const t = setup((e, gate) => { if (e.type === 'approval_required') gate.resolve(e.request.approvalId, 'allow'); });
    const result = await runAsAgent({ runId: 'run-7', agent: 'investigation' }, () =>
      t.runner.run('srv', 'service_restart', RESTART, { runId: 'run-7', onApproval: t.onApproval, allowChange: true }),
    );

    expect(t.events[0]).toMatchObject({
      type: 'approval_required',
      request: {
        runId: 'run-7', serverId: 'srv', serverName: 'web-1', host: '10.0.0.5', loginUser: 'deploy',
        actionId: 'service_restart', title: 'Restart service', command: 'sudo -n systemctl restart -- nginx',
        reason: 'nginx is inactive since 09:12',
      },
    });
    expect(t.events[1]).toMatchObject({ type: 'approval_resolved', decision: 'allow', by: 'owner' });
    expect(t.ssh.exec).toHaveBeenCalledWith('srv', 'sudo -n systemctl restart -- nginx', 60_000);
    expect(result).toMatchObject({ ok: true, approval: { decision: 'allow', by: 'owner' } });
    expect(t.lines.map((l) => l.event)).toEqual(['asked', 'answered', 'ran']);
    expect(t.lines[2]).toMatchObject({ loginUser: 'deploy', exitCode: 0, command: 'sudo -n systemctl restart -- nginx' });
  });

  it('does nothing on deny and tells the model not to retry', async () => {
    const t = setup((e, gate) => { if (e.type === 'approval_required') gate.resolve(e.request.approvalId, 'deny'); });
    const result = await t.runner.run('srv', 'service_restart', RESTART, { runId: 'r', onApproval: t.onApproval, allowChange: true });
    expect(t.ssh.exec).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: denialMessage('owner'), approval: { decision: 'deny', by: 'owner' } });
    expect(result.error).toMatch(/do not retry/i);
    expect(t.lines.map((l) => l.event)).toEqual(['asked', 'answered']);
  });

  it('Stop (cancelRun) while waiting denies without running', async () => {
    const t = setup((e, gate) => { if (e.type === 'approval_required') queueMicrotask(() => gate.cancelRun('run-x')); });
    const result = await t.runner.run('srv', 'container_stop', { container: 'web', reason: 'runaway CPU' }, { runId: 'run-x', onApproval: t.onApproval, allowChange: true });
    expect(result.approval).toMatchObject({ decision: 'deny', by: 'stop' });
    expect(t.ssh.exec).not.toHaveBeenCalled();
  });

  it('an aborted signal while waiting cancels the approval', async () => {
    const controller = new AbortController();
    const t = setup((e) => { if (e.type === 'approval_required') queueMicrotask(() => controller.abort()); });
    const result = await t.runner.run('srv', 'service_stop', { unit: 'cron', reason: 'testing' }, { runId: 'r', signal: controller.signal, onApproval: t.onApproval, allowChange: true });
    expect(result.approval?.by).toBe('stop');
    expect(t.ssh.exec).not.toHaveBeenCalled();
  });

  it('refuses a change outright in a read-only run (no card)', async () => {
    const t = setup();
    const result = await t.runner.run('srv', 'service_restart', RESTART, { runId: 'r', onApproval: t.onApproval });
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain('this run is read-only');
    expect(t.events).toEqual([]);
    expect(t.ssh.exec).not.toHaveBeenCalled();
  });

  it('never asks the owner about an invalid call', async () => {
    const t = setup();
    const result = await t.runner.run('srv', 'service_restart', { unit: 'nginx; reboot', reason: 'x y z' }, { onApproval: t.onApproval });
    expect(result.ok).toBe(false);
    expect(t.events).toEqual([]);
    expect(t.gate.pending()).toEqual([]);
  });
});

describe('runApproved (view buttons)', () => {
  it('runs the recorded command once, inside a view-action scope', async () => {
    const t = setup();
    let scope: unknown;
    t.ssh.exec.mockImplementation(async () => { scope = currentAgentScope(); return { stdout: 'ok', stderr: '', exitCode: 0, durationMs: 1 }; });
    const preview = t.runner.preview('container_restart', { container: 'web-1', reason: 'Button “Restart”' });
    if (!preview.ok) throw new Error(preview.error);
    const staged = t.gate.stage(
      { runId: 'view-srv', serverId: 'srv', serverName: 'web-1', host: 'h', loginUser: 'deploy', actionId: 'container_restart', title: 't', command: preview.command, reason: 'Button' },
      { serverId: 'srv', actionId: 'container_restart', params: preview.params, command: preview.command },
    );
    const { ticket } = t.gate.take(staged.approvalId, 'srv')!;

    const first = await t.runner.runApproved(ticket);
    const second = await t.runner.runApproved(ticket);

    expect(first).toMatchObject({ ok: true, command: 'docker restart -- web-1', approval: { decision: 'allow' } });
    expect(scope).toMatchObject({ agent: 'view-action', grant: { command: 'docker restart -- web-1' } });
    expect(second).toMatchObject({ ok: false, error: 'This approval was already used or is not valid.' });
    expect(t.ssh.exec).toHaveBeenCalledTimes(1);
  });

  it('refuses a ticket whose recorded command no longer matches its params', async () => {
    const t = setup();
    const staged = t.gate.stage(
      { runId: 'v', serverId: 'srv', serverName: 'n', host: 'h', loginUser: 'u', actionId: 'container_restart', title: 't', command: 'docker restart -- evil', reason: 'r' },
      { serverId: 'srv', actionId: 'container_restart', params: { container: 'web-1', reason: 'r r r' }, command: 'docker restart -- evil' },
    );
    const { ticket } = t.gate.take(staged.approvalId, 'srv')!;
    const result = await t.runner.runApproved(ticket);
    expect(result.ok).toBe(false);
    expect(t.ssh.exec).not.toHaveBeenCalled();
  });
});
