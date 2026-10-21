// EX9.1: CommandPolicy enforces "agents only run actions" through the agent scope
// @see docs/phases/phase-ex9.md §5, docs/DECISIONS.md (ADR-024)

import { describe, it, expect, vi } from 'vitest';
import { CommandPolicy } from '../../../src/services/policy/command-policy.js';
import {
  currentAgentScope, outsideAgentScope, runAsAgent, runGenAsAgent, withGrant,
} from '../../../src/services/policy/agent-scope.js';
import { ConnectionManager } from '../../../src/ssh/connection-manager.js';
import { ActionRunner } from '../../../src/agent/actions/runner.js';
import { SecurityError } from '../../../src/security/validators.js';

const agent = { runId: 'run-1', agent: 'investigation' as const };

describe('CommandPolicy inside an agent scope', () => {
  it.each(['enforce', 'audit', 'off'] as const)('refuses free-form commands in %s mode', (mode) => {
    const policy = new CommandPolicy('command-policy');
    policy.setMode(mode);
    runAsAgent(agent, () => {
      expect(() => policy.assertAllowed('df -h')).toThrow(SecurityError);
      expect(policy.evaluate('uptime')).toMatchObject({ allowed: false, reason: 'not-an-action' });
    });
  });

  it('lets through exactly the granted command', () => {
    const policy = new CommandPolicy('command-policy');
    policy.setMode('enforce');
    runAsAgent(agent, () => {
      withGrant({ kind: 'exec', actionId: 'disk_usage', command: 'df -hT' }, () => {
        expect(policy.evaluate('df -hT')).toEqual({ allowed: true, matchedRule: 'action:disk_usage' });
        expect(policy.evaluate('df -hT; id').allowed).toBe(false);
        expect(policy.evaluate('df -h').allowed).toBe(false);
      });
    });
  });

  it('still applies the blocklist to a granted command', () => {
    const policy = new CommandPolicy('command-policy');
    runAsAgent(agent, () => {
      withGrant({ kind: 'exec', actionId: 'x', command: 'shutdown -h now' }, () => {
        expect(policy.evaluate('shutdown -h now')).toMatchObject({ allowed: false, reason: 'blocked' });
      });
    });
  });

  it('records refusals in the audit log', () => {
    const policy = new CommandPolicy('command-policy');
    runAsAgent(agent, () => {
      expect(() => policy.assertAllowed('cat /etc/shadow', 'srv')).toThrow();
    });
    expect(policy.getAuditLog().at(-1)).toMatchObject({ command: 'cat /etc/shadow', serverId: 'srv', decision: { reason: 'not-an-action' } });
  });

  it('leaves classic (non-agent) commands to ADR-023 rules', () => {
    const policy = new CommandPolicy('command-policy');
    policy.setMode('enforce');
    expect(policy.evaluate('df -h').allowed).toBe(true);
    expect(policy.evaluate('echo hi').allowed).toBe(false);
    outsideAgentScope(() => expect(policy.evaluate('df -h').allowed).toBe(true));
  });

  it('needs an sftp grant for SFTP inside an agent run', () => {
    const policy = new CommandPolicy('command-policy');
    expect(() => policy.assertSftpAllowed('srv')).not.toThrow(); // classic apps
    runAsAgent(agent, () => {
      expect(() => policy.assertSftpAllowed('srv')).toThrow(SecurityError);
      withGrant({ kind: 'sftp', actionId: 'file_read', path: '/etc/hosts' }, () => {
        expect(() => policy.assertSftpAllowed('srv')).not.toThrow();
      });
      withGrant({ kind: 'exec', actionId: 'uptime', command: 'uptime' }, () => {
        expect(() => policy.assertSftpAllowed('srv')).toThrow(SecurityError);
      });
    });
  });
});

describe('ConnectionManager enforces the policy before touching SSH', () => {
  function manager() {
    const ssh = new ConnectionManager('ssh');
    const policy = new CommandPolicy('command-policy');
    ssh.setCommandPolicy(policy);
    return ssh;
  }

  it('rejects an agent free-form exec with a SecurityError (not "not connected")', async () => {
    const ssh = manager();
    await runAsAgent(agent, async () => {
      await expect(ssh.exec('srv', 'cat /var/log/$(touch /tmp/x)')).rejects.toBeInstanceOf(SecurityError);
      await expect(ssh.getSftp('srv')).rejects.toBeInstanceOf(SecurityError);
    });
  });

  it('lets an action through the policy (then fails only because nothing is connected)', async () => {
    const ssh = manager();
    const runner = new ActionRunner({ ssh });
    const result = await runAsAgent(agent, () => runner.run('srv', 'uptime', {}));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not connected|No connection|not found/i);
    expect(result.error).not.toMatch(/catalog actions/);
  });
});

describe('agent scope plumbing', () => {
  it('is absent outside a run and present inside', async () => {
    expect(currentAgentScope()).toBeUndefined();
    await runAsAgent(agent, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(currentAgentScope()).toEqual(agent);
    });
  });

  it('re-enters the scope on every generator resumption, even when the consumer is outside it', async () => {
    const seen: Array<string | undefined> = [];
    async function* inner() {
      seen.push(currentAgentScope()?.runId);
      yield 1;
      await new Promise((r) => setTimeout(r, 1));
      seen.push(currentAgentScope()?.runId);
      yield 2;
    }
    const values: number[] = [];
    for await (const v of runGenAsAgent(agent, inner)) {
      expect(currentAgentScope()).toBeUndefined(); // the consumer is not the agent
      values.push(v);
    }
    expect(values).toEqual([1, 2]);
    expect(seen).toEqual(['run-1', 'run-1']);
  });

  it('runs the inner generator cleanup when the consumer stops early', async () => {
    const cleanup = vi.fn();
    async function* inner() {
      try { yield 1; yield 2; } finally { cleanup(currentAgentScope()?.runId); }
    }
    for await (const v of runGenAsAgent(agent, inner)) { if (v === 1) break; }
    expect(cleanup).toHaveBeenCalledWith('run-1');
  });

  it('outsideAgentScope hides the scope from plumbing code', () => {
    runAsAgent(agent, () => {
      outsideAgentScope(() => expect(currentAgentScope()).toBeUndefined());
      expect(currentAgentScope()).toEqual(agent);
    });
  });

  it('a grant outside any run still pins the command (view-action runs)', () => {
    withGrant({ kind: 'exec', actionId: 'uptime', command: 'uptime' }, () => {
      expect(currentAgentScope()).toMatchObject({ agent: 'view-action', grant: { command: 'uptime' } });
    });
  });
});
