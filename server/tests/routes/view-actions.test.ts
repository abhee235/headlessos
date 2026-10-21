// EX9.2: generated view buttons through actions; owner approvals over HTTP
// @see docs/phases/phase-ex9.md §7

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { actionRoutes } from '../../src/routes/actions.js';
import { agentRoutes } from '../../src/routes/agent.js';
import { dynamicUIRoutes } from '../../src/routes/dynamic-ui.js';
import { ActionRunner } from '../../src/agent/actions/runner.js';
import { ApprovalGate } from '../../src/agent/actions/approvals.js';
import { currentAgentScope } from '../../src/services/policy/agent-scope.js';

function sshStub(connected = true) {
  return {
    getState: vi.fn(() => ({ status: connected ? 'connected' : 'disconnected' })),
    exec: vi.fn(async () => ({ stdout: 'done', stderr: '', exitCode: 0, durationMs: 3 })),
    getSftp: vi.fn(),
  };
}

async function actionsApp(connected = true) {
  const ssh = sshStub(connected);
  const approvals = new ApprovalGate();
  const runner = new ActionRunner({
    ssh: ssh as never, approvals,
    describeServer: () => ({ name: 'web-1', host: '10.0.0.5', username: 'deploy' }),
  });
  const app = Fastify();
  await app.register(actionRoutes, { connectionManager: ssh as never, runner, approvals });
  return { app, ssh, approvals };
}

describe('POST /actions/preview', () => {
  it('previews a read action without staging anything', async () => {
    const { app, approvals } = await actionsApp();
    const res = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/preview', payload: { actionId: 'service_status', params: { unit: 'nginx' } } });
    expect(res.json()).toMatchObject({ success: true, risk: 'read', command: 'systemctl status --no-pager --lines=20 -- nginx' });
    expect(approvals.pending()).toEqual([]);
  });

  it('stages a change and returns the card (the button label is the reason)', async () => {
    const { app, approvals } = await actionsApp();
    const res = await app.inject({
      method: 'POST', url: '/api/servers/srv/actions/preview',
      payload: { actionId: 'container_restart', params: { container: 'web-1' }, label: 'Restart' },
    });
    const body = res.json();
    expect(body).toMatchObject({
      success: true, risk: 'change', command: 'docker restart -- web-1',
      approval: { source: 'view', serverName: 'web-1', host: '10.0.0.5', loginUser: 'deploy', reason: 'Button “Restart” in a generated view' },
    });
    expect(approvals.pending()).toHaveLength(1);
  });

  it('rejects bad params with the model-style message', async () => {
    const { app } = await actionsApp();
    const res = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/preview', payload: { actionId: 'container_restart', params: { container: 'web-1; reboot' } } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('container: expected a container name');
  });
});

describe('POST /actions/run', () => {
  it('runs a read action inside a view-action scope', async () => {
    const { app, ssh } = await actionsApp();
    let scope: unknown;
    ssh.exec.mockImplementation(async () => { scope = currentAgentScope(); return { stdout: 'active', stderr: '', exitCode: 0, durationMs: 1 }; });
    const res = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/run', payload: { actionId: 'service_status', params: { unit: 'nginx' } } });
    expect(res.json()).toMatchObject({ success: true, output: 'active', command: 'systemctl status --no-pager --lines=20 -- nginx' });
    expect(scope).toMatchObject({ agent: 'view-action' });
  });

  it('refuses a change action without an approval', async () => {
    const { app, ssh } = await actionsApp();
    const res = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/run', payload: { actionId: 'container_restart', params: { container: 'web-1', reason: 'xyz' } } });
    expect(res.statusCode).toBe(409);
    expect(ssh.exec).not.toHaveBeenCalled();
  });

  it('runs an approved change once, using the recorded command, not new params', async () => {
    const { app, ssh } = await actionsApp();
    const preview = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/preview', payload: { actionId: 'container_restart', params: { container: 'web-1' }, label: 'Restart' } });
    const approvalId = preview.json().approval.approvalId as string;

    const run = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/run', payload: { approvalId } });
    expect(run.json()).toMatchObject({ success: true, command: 'docker restart -- web-1' });
    expect(ssh.exec).toHaveBeenCalledWith('srv', 'docker restart -- web-1', 60_000);

    const again = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/run', payload: { approvalId } });
    expect(again.statusCode).toBe(404);
    expect(ssh.exec).toHaveBeenCalledTimes(1);

    // the strict body schema keeps params out of an approval run
    const smuggle = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/run', payload: { approvalId, params: { container: 'db' } } });
    expect(smuggle.statusCode).toBe(400);
  });

  it('will not run an approval staged for another server', async () => {
    const { app, ssh } = await actionsApp();
    const preview = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/preview', payload: { actionId: 'service_restart', params: { unit: 'nginx' } } });
    const run = await app.inject({ method: 'POST', url: '/api/servers/other/actions/run', payload: { approvalId: preview.json().approval.approvalId } });
    expect(run.statusCode).toBe(404);
    expect(ssh.exec).not.toHaveBeenCalled();
  });

  it('needs a connected server', async () => {
    const { app } = await actionsApp(false);
    const res = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/run', payload: { actionId: 'uptime', params: {} } });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /actions/approvals/:id/deny', () => {
  it('drops the staged approval so it can no longer run', async () => {
    const { app, approvals } = await actionsApp();
    const preview = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/preview', payload: { actionId: 'nginx_reload', params: {} } });
    const id = preview.json().approval.approvalId as string;
    const deny = await app.inject({ method: 'POST', url: `/api/servers/srv/actions/approvals/${id}/deny` });
    expect(deny.json()).toMatchObject({ success: true, decision: 'deny', by: 'owner' });
    expect(approvals.pending()).toEqual([]);
    const run = await app.inject({ method: 'POST', url: '/api/servers/srv/actions/run', payload: { approvalId: id } });
    expect(run.statusCode).toBe(404);
  });
});

describe('POST /api/servers/:id/agent/approvals/:approvalId', () => {
  async function agentApp() {
    const approvals = new ApprovalGate({ newId: () => 'appr-1' });
    const app = Fastify();
    await app.register(agentRoutes, { connectionManager: sshStub() as never, agent: { investigate: vi.fn(), abort: vi.fn(), events: { on: vi.fn(), off: vi.fn() } } as never, approvals });
    return { app, approvals };
  }
  const input = { runId: 'run-1', serverId: 'srv', serverName: 'n', host: 'h', loginUser: 'u', actionId: 'service_restart', title: 't', command: 'c', reason: 'r' };

  it('answers a parked approval', async () => {
    const { app, approvals } = await agentApp();
    const pending = approvals.request(input, () => {});
    const res = await app.inject({ method: 'POST', url: '/api/servers/srv/agent/approvals/appr-1', payload: { decision: 'allow' } });
    expect(res.json()).toMatchObject({ success: true, decision: 'allow', by: 'owner' });
    await expect(pending).resolves.toMatchObject({ decision: 'allow' });
  });

  it('rejects anything but allow/deny, and unknown or other-server approvals', async () => {
    const { app, approvals } = await agentApp();
    void approvals.request(input, () => {});
    expect((await app.inject({ method: 'POST', url: '/api/servers/srv/agent/approvals/appr-1', payload: { decision: 'always' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/servers/other/agent/approvals/appr-1', payload: { decision: 'allow' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/servers/srv/agent/approvals/nope', payload: { decision: 'deny' } })).statusCode).toBe(404);
    approvals.dispose();
  });

  it('passes readOnly through: only an explicit false offers changes', async () => {
    const investigate = vi.fn().mockResolvedValue({ steps: [] });
    const app = Fastify();
    await app.register(agentRoutes, { connectionManager: sshStub() as never, agent: { investigate, abort: vi.fn(), events: { on: vi.fn(), off: vi.fn() } } as never });
    await app.inject({ method: 'POST', url: '/api/servers/srv/agent/investigate', payload: { question: 'q' } });
    await app.inject({ method: 'POST', url: '/api/servers/srv/agent/investigate', payload: { question: 'q', readOnly: 'false' } });
    await app.inject({ method: 'POST', url: '/api/servers/srv/agent/investigate', payload: { question: 'q', readOnly: false } });
    expect(investigate.mock.calls.map((c) => c[2].readOnly)).toEqual([true, true, false]);
  });
});

describe('legacy free-form buttons (execute-action)', () => {
  async function dynamicApp() {
    const ssh = sshStub();
    const app = Fastify();
    await app.register(dynamicUIRoutes, {
      connectionManager: ssh as never,
      generator: { getRegistry: () => ({}) } as never,
    });
    return { app, ssh };
  }

  it('still runs a read-only command', async () => {
    const { app, ssh } = await dynamicApp();
    const res = await app.inject({ method: 'POST', url: '/api/servers/srv/dynamic-ui/execute-action', payload: { command: 'docker ps' } });
    expect(res.json()).toMatchObject({ success: true });
    expect(ssh.exec).toHaveBeenCalled();
  });

  it('refuses a command that would change the server', async () => {
    const { app, ssh } = await dynamicApp();
    // commands that match medium/high classic rules (they used to run on one click)
    for (const command of ['docker restart abcdef123456', 'sudo systemctl restart nginx', 'apt update']) {
      const res = await app.inject({
        method: 'POST', url: '/api/servers/srv/dynamic-ui/execute-action',
        payload: { command },
      });
      expect(res.statusCode, command).toBe(403);
      expect(res.json().error).toContain('Regenerate the view');
    }
    expect(ssh.exec).not.toHaveBeenCalled();
  });
});
