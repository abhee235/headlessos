// M11.5 / EX9.1–EX9.3: Investigation agent — native tool calls on the shared loop,
// catalog actions only, change actions behind the owner's approval
// @see docs/phases/phase-ex9.md, docs/DECISIONS.md (ADR-024)

import { describe, it, expect, vi } from 'vitest';
import { InvestigationAgent } from '../../src/agent/investigation-agent.js';
import { CommandPolicy } from '../../src/services/policy/command-policy.js';
import { currentAgentScope } from '../../src/services/policy/agent-scope.js';
import { ApprovalGate } from '../../src/agent/actions/approvals.js';
import type { ChatWithToolsInput, ChatWithToolsResult } from '../../src/llm/provider.js';

type Turn = { calls?: Array<{ name: string; args: unknown }>; text?: string };

/** A provider that answers each turn from a script; records what it was sent. */
function scripted(turns: Turn[], opts: { name?: string; contextWindow?: number } = {}) {
  let n = 0;
  const chatWithTools = vi.fn(async (_input: ChatWithToolsInput): Promise<ChatWithToolsResult> => {
    const t = turns[n++] ?? { text: 'done' };
    const calls = (t.calls ?? []).map((c, i) => ({
      id: `call_${n}_${i}`, type: 'function' as const,
      function: { name: c.name, arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args) },
    }));
    return {
      message: { role: 'assistant', content: t.text ?? null, ...(calls.length ? { tool_calls: calls } : {}) },
      tokensUsed: { input: 10, output: 5 }, latencyMs: 1, model: 'fake', finishReason: calls.length ? 'tool_calls' : 'stop',
    };
  });
  return { name: opts.name ?? 'openai', model: 'fake', contextWindow: opts.contextWindow, parseText: vi.fn(), parseImage: vi.fn(), chatWithTools };
}
const toolMessages = (input: ChatWithToolsInput) => input.messages.filter((m) => m.role === 'tool').map((m) => m.content);

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

describe('InvestigationAgent on the shared loop (EX9.1 / EX9.3)', () => {
  it('runs the actions the model calls and records the commands the server built', async () => {
    const ssh = policedSsh('Filesystem  Size  Used Avail Use% Mounted on\n/dev/sda1  50G  45G  5G  90% /');
    const llm = scripted([{ text: 'Checking disk.', calls: [{ name: 'disk_usage', args: {} }] }, { text: 'The root filesystem is 90% full.' }]);
    const result = await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'Why is the disk full?');

    expect(result.status).toBe('completed');
    expect(result.answer).toBe('The root filesystem is 90% full.');
    expect(ssh.seen).toEqual(['df -hT']);
    expect(result.steps[0]).toMatchObject({ stepNumber: 1, thought: 'Checking disk.', action: 'disk_usage', command: 'df -hT', decision: 'continue' });
    expect(result.steps[0]!.output).toContain('90%');
    expect(result.steps[1]).toMatchObject({ stepNumber: 2, thought: 'The root filesystem is 90% full.', decision: 'answer' });
    expect(result.totalTokens).toBe(30);
  });

  it('runs several calls from one turn as separate steps', async () => {
    const ssh = policedSsh('ok');
    const llm = scripted([{ calls: [{ name: 'uptime', args: {} }, { name: 'memory_usage', args: {} }] }, { text: 'fine' }]);
    const result = await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'q');
    expect(ssh.seen).toEqual(['uptime', 'free -m']);
    expect(result.steps.map((s) => [s.stepNumber, s.action, s.thought])).toEqual([[1, 'uptime', 'Uptime and load'], [2, 'memory_usage', 'Memory usage'], [3, undefined, 'fine']]);
  });

  it('feeds a parameter error back and never touches SSH for it', async () => {
    const ssh = policedSsh();
    const llm = scripted([{ calls: [{ name: 'service_status', args: { unit: 'nginx; rm -rf /' } }] }, { text: 'gave up' }]);
    const result = await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'q');
    expect(ssh.exec).not.toHaveBeenCalled();
    expect(result.steps[0]!.output).toMatch(/^error: service_status: unit: expected a systemd unit name/);
    expect(toolMessages(llm.chatWithTools.mock.calls[1]![0])[0]).toContain('you sent "nginx; rm -rf /"');
  });

  it('accepts what small models send: misnamed keys, text numbers, broken JSON', async () => {
    const ssh = policedSsh('active');
    const llm = scripted([
      { calls: [{ name: 'service_status', args: '{service: "nginx", n: "5",}' }] },
      { text: 'nginx is active' },
    ]);
    const result = await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'q');
    expect(ssh.seen).toEqual(['systemctl status --no-pager --lines=5 -- nginx']);
    expect(result.status).toBe('completed');
  });

  it('explains unrepairable arguments and unknown tools', async () => {
    const llm = scripted([
      { calls: [{ name: 'service_status', args: 'unit=nginx' }, { name: 'rm_rf', args: {} }] },
      { text: 'ok' },
    ]);
    await new InvestigationAgent(policedSsh() as never, llm as never).investigate('srv', 'q');
    const [bad, unknown] = toolMessages(llm.chatWithTools.mock.calls[1]![0]);
    expect(bad).toContain('service_status was called with arguments that are not valid JSON');
    expect(bad).toContain('using these keys: unit, lines');
    expect(unknown).toMatch(/^No such tool: rm_rf\. Closest: /);
  });

  it('runs a catalog action that was not offered this run', async () => {
    const ssh = policedSsh('Linux');
    const llm = scripted([{ calls: [{ name: 'kernel_info', args: {} }] }, { text: 'Linux' }], { name: 'ollama', contextWindow: 8192 });
    await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'what docker containers are running?');
    const offered = (llm.chatWithTools.mock.calls[0]![0].tools ?? []).map((t) => t.function.name);
    expect(offered).toHaveLength(8); // 10% of an 8k window
    expect(ssh.seen).toEqual(['uname -a']);
  });

  it('offers OpenAI models 40 actions natively, with plain JSON schemas', async () => {
    const llm = scripted([{ text: 'ok' }]);
    await new InvestigationAgent(policedSsh() as never, llm as never).investigate('srv', 'why does nginx keep failing?');
    const input = llm.chatWithTools.mock.calls[0]![0];
    const tools = input.tools ?? [];
    expect(tools).toHaveLength(40);
    const status = tools.find((t) => t.function.name === 'service_status')!;
    expect(status.function.parameters).toMatchObject({ type: 'object', required: ['unit'] });
    expect(input.messages[0]!.content).toContain('You cannot write shell commands');
    expect(input.messages[0]!.content).toContain('you cannot change the server');
  });

  it('nudges a turn with neither text nor a tool call', async () => {
    const llm = scripted([{}, { text: 'ok' }]);
    await new InvestigationAgent(policedSsh() as never, llm as never).investigate('srv', 'q');
    expect(llm.chatWithTools.mock.calls[1]![0].messages.at(-1)).toMatchObject({ role: 'user', content: expect.stringContaining('final answer') });
  });

  it('asks for a conclusion with tools off when turns run out', async () => {
    const llm = scripted([{ calls: [{ name: 'uptime', args: {} }] }, { calls: [{ name: 'uptime', args: {} }] }, { text: 'Up 3 days, load is low.' }]);
    const result = await new InvestigationAgent(policedSsh('up') as never, llm as never).investigate('srv', 'q', { maxSteps: 2 });
    expect(result.status).toBe('max_steps_reached');
    expect(result.answer).toBe('Up 3 days, load is low.');
    expect(llm.chatWithTools.mock.calls[2]![0].tool_choice).toBe('none');
  });

  it('runs the whole investigation inside an agent scope', async () => {
    const scopes: unknown[] = [];
    const ssh = {
      exec: vi.fn(async () => { scopes.push(currentAgentScope()); return { stdout: '', stderr: '', exitCode: 0, durationMs: 1 }; }),
      getSftp: vi.fn(),
    };
    const llm = scripted([{ calls: [{ name: 'uptime', args: {} }] }, { text: 'fine' }]);
    const result = await new InvestigationAgent(ssh as never, llm as never).investigate('srv', 'q', { sessionId: 'session-abc-123' });
    expect(result.sessionId).toBe('session-abc-123');
    expect(scopes).toEqual([{ runId: 'session-abc-123', agent: 'investigation', grant: { kind: 'exec', actionId: 'uptime', command: 'uptime' } }]);
  });

  it('reports an LLM failure as an error step', async () => {
    const llm = scripted([]);
    llm.chatWithTools.mockRejectedValueOnce(new Error('Ollama is not reachable at http://127.0.0.1:11434'));
    const result = await new InvestigationAgent(policedSsh() as never, llm as never).investigate('srv', 'q');
    expect(result.status).toBe('error');
    expect(result.answer).toContain('Ollama is not reachable');
  });

  it('needs a provider that can call tools', async () => {
    const noTools = { name: 'x', model: 'old', parseText: vi.fn(), parseImage: vi.fn() };
    const result = await new InvestigationAgent(policedSsh() as never, noTools as never).investigate('srv', 'q');
    expect(result).toMatchObject({ status: 'error', answer: expect.stringContaining('cannot call tools') });
  });

  it('answers without a provider by asking for a key', async () => {
    const result = await new InvestigationAgent(policedSsh() as never, null).investigate('srv', 'q');
    expect(result.status).toBe('error');
    expect(result.answer).toContain('API key');
  });
});

describe('InvestigationAgent changes (EX9.2)', () => {
  const RESTART: Turn = { text: 'restart it', calls: [{ name: 'service_restart', args: { unit: 'nginx', reason: 'nginx is inactive since 09:12' } }] };

  function changeAgent(turns: Turn[], answerWith: (gate: ApprovalGate, approvalId: string, agent: InvestigationAgent) => void) {
    const ssh = policedSsh('ok');
    const gate = new ApprovalGate();
    const llm = scripted(turns);
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

  it('offers change tools only when readOnly is false', async () => {
    const readOnly = scripted([{ text: 'ok' }]);
    await new InvestigationAgent(policedSsh() as never, readOnly as never).investigate('srv', 'nginx is down');
    expect((readOnly.chatWithTools.mock.calls[0]![0].tools ?? []).map((t) => t.function.name)).not.toContain('service_restart');

    const changes = scripted([{ text: 'ok' }]);
    await new InvestigationAgent(policedSsh() as never, changes as never).investigate('srv', 'nginx is down', { readOnly: false });
    const input = changes.chatWithTools.mock.calls[0]![0];
    const restart = (input.tools ?? []).find((t) => t.function.name === 'service_restart')!;
    expect(restart.function.description).toContain('Changes the server: pauses until the owner allows it.');
    expect(restart.function.parameters).toMatchObject({ required: ['unit', 'reason'] });
    expect(input.messages[0]!.content).toContain('If the owner declines, that is final for this run');
  });

  it('runs a change only after the owner allows it, and streams the card with the step', async () => {
    const t = changeAgent([RESTART, { text: 'restarted' }], (gate, id) => gate.resolve(id, 'allow'));
    const result = await t.agent.investigate('srv', 'nginx is down', { readOnly: false, sessionId: 'sess-change-1' });

    expect(t.ssh.seen).toEqual(['sudo -n systemctl restart -- nginx']);
    expect(t.events.find((e) => e.kind === 'approval')).toMatchObject({
      step: 1,
      request: { command: 'sudo -n systemctl restart -- nginx', serverName: 'web-1', loginUser: 'deploy', reason: 'nginx is inactive since 09:12' },
    });
    expect(t.events.find((e) => e.kind === 'approval_resolved')).toMatchObject({ step: 1, decision: 'allow', by: 'owner' });
    expect(result.steps[0]).toMatchObject({ action: 'service_restart', approval: { decision: 'allow', by: 'owner' } });
  });

  it('does not run a denied change and tells the model not to retry', async () => {
    const t = changeAgent([RESTART, { text: 'owner declined' }], (gate, id) => gate.resolve(id, 'deny'));
    const result = await t.agent.investigate('srv', 'nginx is down', { readOnly: false, sessionId: 'sess-change-1' });
    expect(t.ssh.exec).not.toHaveBeenCalled();
    expect(result.steps[0]!.approval).toMatchObject({ decision: 'deny', by: 'owner' });
    expect(result.steps[0]!.output).toMatch(/declined this change.*do not retry/i);
  });

  it('Stop while a card is waiting denies it and ends the run', async () => {
    const t = changeAgent([RESTART, { text: 'never reached' }], (_gate, _id, agent) => agent.abort('sess-change-1'));
    const result = await t.agent.investigate('srv', 'nginx is down', { readOnly: false, sessionId: 'sess-change-1' });
    expect(t.ssh.exec).not.toHaveBeenCalled();
    expect(result.steps[0]!.approval).toMatchObject({ decision: 'deny', by: 'stop' });
    expect(result.status).toBe('aborted');
    expect(t.gate.pending()).toEqual([]);
  });

  it('refuses a change action in a read-only run even if the model names it', async () => {
    const t = changeAgent([RESTART, { text: 'ok' }], (gate, id) => gate.resolve(id, 'allow'));
    const result = await t.agent.investigate('srv', 'nginx is down', { sessionId: 'sess-change-1' });
    expect(t.ssh.exec).not.toHaveBeenCalled();
    expect(t.events.some((e) => e.kind === 'approval')).toBe(false);
    expect(result.steps[0]!.output).toMatch(/^No such tool: service_restart/);
  });
});
