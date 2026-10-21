// M11.5 / EX9.1: Investigation agent — runs catalog actions, never model-written commands
// @see docs/phases/phase-ex9.md, docs/DECISIONS.md (ADR-024)

import { describe, it, expect, vi } from 'vitest';
import { InvestigationAgent } from '../../src/agent/investigation-agent.js';
import { CommandPolicy } from '../../src/services/policy/command-policy.js';
import { currentAgentScope } from '../../src/services/policy/agent-scope.js';
import { ApprovalGate } from '../../src/agent/actions/approvals.js';

type Thought = { thought: string; action: string | null; params: string | null; answer: string | null; decision: 'run_action' | 'answer' };

const act = (action: string, params = '{}', thought = `run ${action}`): Thought =>
  ({ thought, action, params, answer: null, decision: 'run_action' });
const answer = (text: string): Thought => ({ thought: 'done', action: null, params: null, answer: text, decision: 'answer' });

function scripted(thoughts: Thought[]) {
  const parseText = vi.fn();
  for (const data of thoughts) parseText.mockResolvedValueOnce({ data, tokensUsed: { input: 10, output: 5 }, model: 'fake' });
  return { parseText };
}

/** SSH stub that behaves like ConnectionManager: the policy checks every command first. */
function policedSsh(stdout = 'output') {
  const policy = new CommandPolicy('command-policy');
  policy.setMode('enforce');
  const seen: string[] = [];
  return {
    seen,
    exec: vi.fn(async (_serverId: string, command: string) => {
      policy.assertAllowed(command);
      seen.push(command);
      return { stdout, stderr: '', exitCode: 0, durationMs: 1 };
    }),
    getSftp: vi.fn(async () => {
      policy.assertSftpAllowed();
      throw new Error('no sftp in this test');
    }),
  };
}

describe('InvestigationAgent (EX9.1)', () => {
  it('runs the action the model names and records the command the server built', async () => {
    const ssh = policedSsh('Filesystem  Size  Used Avail Use% Mounted on\n/dev/sda1  50G  45G  5G  90% /');
    const llm = scripted([act('disk_usage'), answer('The root filesystem is 90% full.')]);
    const agent = new InvestigationAgent(ssh as never, llm as never);

    const result = await agent.investigate('srv', 'Why is the disk full?');

    expect(result.status).toBe('completed');
    expect(result.answer).toBe('The root filesystem is 90% full.');
    expect(ssh.seen).toEqual(['df -hT']);
    expect(result.steps[0]).toMatchObject({ action: 'disk_usage', command: 'df -hT', decision: 'continue' });
    expect(result.steps[0]!.output).toContain('90%');
  });

  it('passes typed params through validation before building the command', async () => {
    const ssh = policedSsh('active (running)');
    const llm = scripted([act('service_status', '{"unit":"nginx","lines":5}'), answer('nginx is running')]);
    const result = await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'is nginx up?');
    expect(ssh.seen).toEqual(['systemctl status --no-pager --lines=5 -- nginx']);
    expect(result.steps[0]!.command).toBe('systemctl status --no-pager --lines=5 -- nginx');
  });

  it('feeds a parameter error back to the model and never touches SSH', async () => {
    const ssh = policedSsh();
    const llm = scripted([act('service_status', '{"unit":"nginx; rm -rf /"}'), answer('gave up')]);
    const result = await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'q');

    expect(ssh.exec).not.toHaveBeenCalled();
    expect(result.steps[0]!.output).toMatch(/^error: service_status: unit: expected a systemd unit name/);
    // the next prompt shows the model what was wrong
    const secondPrompt = llm.parseText.mock.calls[1]![0].userPrompt as string;
    expect(secondPrompt).toContain('you sent "nginx; rm -rf /"');
  });

  it('explains malformed params JSON and unknown actions', async () => {
    const ssh = policedSsh();
    const llm = scripted([act('disk_usage', '{unit:'), act('rm_rf'), answer('ok')]);
    const result = await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'q');

    expect(ssh.exec).not.toHaveBeenCalled();
    expect(result.steps[0]!.output).toContain('params is not valid JSON');
    expect(result.steps[1]!.output).toMatch(/No such action: rm_rf\. Closest:/);
  });

  it('nudges a model that says run_action but names no action', async () => {
    const llm = scripted([{ thought: 'hmm', action: null, params: null, answer: null, decision: 'run_action' }, answer('ok')]);
    await new InvestigationAgent(policedSsh() as never, llm as never).investigate('srv', 'q');
    expect(llm.parseText.mock.calls[1]![0].userPrompt).toContain('no action was named');
  });

  it('runs the whole investigation inside an agent scope', async () => {
    const scopes: unknown[] = [];
    const ssh = {
      exec: vi.fn(async () => { scopes.push(currentAgentScope()); return { stdout: '', stderr: '', exitCode: 0, durationMs: 1 }; }),
      getSftp: vi.fn(),
    };
    const llm = scripted([act('uptime'), answer('fine')]);
    const result = await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'q', { sessionId: 'session-abc-123' });
    expect(result.sessionId).toBe('session-abc-123');
    expect(scopes).toEqual([{ runId: 'session-abc-123', agent: 'investigation', grant: { kind: 'exec', actionId: 'uptime', command: 'uptime' } }]);
  });

  it('lists actions (with signatures) in the system prompt and asks for no shell commands', async () => {
    const llm = scripted([answer('ok')]);
    await new InvestigationAgent(policedSsh() as never, llm as never).investigate('srv', 'why does nginx keep failing?');
    const system = llm.parseText.mock.calls[0]![0].systemPrompt as string;
    expect(system).toContain('You cannot write shell commands');
    expect(system).toContain('- service_status(unit: systemd unit, e.g. nginx or nginx.service; lines?: ');
    expect(system).toContain('- service_logs(');
    expect(system).not.toMatch(/Available commands include/);
  });

  it('answers without a provider by asking for a key', async () => {
    const result = await new InvestigationAgent(policedSsh() as never, null).investigate('srv', 'q');
    expect(result.status).toBe('error');
    expect(result.answer).toContain('API key');
  });
});

describe('InvestigationAgent changes (EX9.2)', () => {
  const RESTART = act('service_restart', '{"unit":"nginx","reason":"nginx is inactive since 09:12"}', 'restart it');

  function changeAgent(thoughts: Thought[], answerWith: (gate: ApprovalGate, approvalId: string, agent: InvestigationAgent) => void) {
    const ssh = policedSsh('ok');
    const gate = new ApprovalGate();
    const llm = scripted(thoughts);
    const agent = new InvestigationAgent(ssh as never, llm as never, {
      approvals: gate,
      describeServer: () => ({ name: 'web-1', host: '10.0.0.5', username: 'deploy' }),
    });
    const events: Array<Record<string, unknown>> = [];
    agent.events.on('step:sess-change-1', (e: Record<string, unknown>) => {
      events.push(e);
      if (e.kind === 'approval') answerWith(gate, (e.request as { approvalId: string }).approvalId, agent);
    });
    return { ssh, gate, llm, agent, events };
  }

  it('offers change actions only when readOnly is false', async () => {
    const readOnly = scripted([answer('ok')]);
    await new InvestigationAgent(policedSsh() as never, readOnly as never).investigate('srv', 'nginx is down');
    expect(readOnly.parseText.mock.calls[0]![0].systemPrompt).not.toContain('service_restart(');

    const changes = scripted([answer('ok')]);
    await new InvestigationAgent(policedSsh() as never, changes as never).investigate('srv', 'nginx is down', { readOnly: false });
    const system = changes.parseText.mock.calls[0]![0].systemPrompt as string;
    expect(system).toContain('- service_restart(unit: systemd unit, e.g. nginx or nginx.service; reason: why this change is needed');
    expect(system).toContain('[changes the server]');
    expect(system).toContain('If the owner declines, that is final for this run');
  });

  it('runs a change only after the owner allows it, and streams the card with the step', async () => {
    const t = changeAgent([RESTART, answer('restarted')], (gate, id) => gate.resolve(id, 'allow'));
    const result = await t.agent.investigate('srv', 'nginx is down', { readOnly: false, sessionId: 'sess-change-1' });

    expect(t.ssh.seen).toEqual(['sudo -n systemctl restart -- nginx']);
    const card = t.events.find((e) => e.kind === 'approval')!;
    expect(card).toMatchObject({
      step: 1,
      request: { command: 'sudo -n systemctl restart -- nginx', serverName: 'web-1', loginUser: 'deploy', reason: 'nginx is inactive since 09:12' },
    });
    expect(t.events.find((e) => e.kind === 'approval_resolved')).toMatchObject({ step: 1, decision: 'allow', by: 'owner' });
    expect(result.steps[0]).toMatchObject({ action: 'service_restart', approval: { decision: 'allow', by: 'owner' } });
  });

  it('does not run a denied change and tells the model not to retry', async () => {
    const t = changeAgent([RESTART, answer('owner declined')], (gate, id) => gate.resolve(id, 'deny'));
    const result = await t.agent.investigate('srv', 'nginx is down', { readOnly: false, sessionId: 'sess-change-1' });
    expect(t.ssh.exec).not.toHaveBeenCalled();
    expect(result.steps[0]!.approval).toMatchObject({ decision: 'deny', by: 'owner' });
    expect(result.steps[0]!.output).toMatch(/declined this change.*do not retry/i);
  });

  it('Stop while a card is waiting denies it and ends the run', async () => {
    const t = changeAgent([RESTART, answer('never reached')], (_gate, _id, agent) => agent.abort('sess-change-1'));
    const result = await t.agent.investigate('srv', 'nginx is down', { readOnly: false, sessionId: 'sess-change-1' });
    expect(t.ssh.exec).not.toHaveBeenCalled();
    expect(result.steps[0]!.approval).toMatchObject({ decision: 'deny', by: 'stop' });
    expect(result.status).toBe('aborted');
    expect(t.gate.pending()).toEqual([]);
  });

  it('refuses change actions in a read-only run even if the model names one', async () => {
    const t = changeAgent([RESTART, answer('ok')], (gate, id) => gate.resolve(id, 'allow'));
    const result = await t.agent.investigate('srv', 'nginx is down', { sessionId: 'sess-change-1' });
    expect(t.ssh.exec).not.toHaveBeenCalled();
    expect(t.events.some((e) => e.kind === 'approval')).toBe(false);
    expect(result.steps[0]!.output).toContain('read-only');
  });
});
