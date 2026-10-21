// EX9.2: ApprovalGate and the append-only audit log
// @see docs/phases/phase-ex9.md §7

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalGate, type ApprovalInput } from '../../../src/agent/actions/approvals.js';
import { ActionAudit, type AuditEntry } from '../../../src/agent/actions/audit.js';

const INPUT: ApprovalInput = {
  runId: 'run-1', serverId: 'srv', serverName: 'web-1', host: '10.0.0.5', loginUser: 'deploy',
  actionId: 'service_restart', title: 'Restart service', command: 'sudo -n systemctl restart -- nginx',
  reason: 'nginx has been inactive since 09:12',
};

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hos-audit-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('ApprovalGate — parked agent approvals', () => {
  it('stores the resolver before notifying, so an instant answer is never lost', async () => {
    const gate = new ApprovalGate();
    const outcome = await gate.request(INPUT, (req) => {
      expect(gate.pending('run-1').map((r) => r.approvalId)).toEqual([req.approvalId]);
      gate.resolve(req.approvalId, 'allow'); // answered synchronously, inside notify
    });
    expect(outcome).toMatchObject({ decision: 'allow', by: 'owner' });
    expect(gate.pending()).toEqual([]);
  });

  it('sends the card with everything the owner needs', async () => {
    const gate = new ApprovalGate({ newId: () => 'appr-1' });
    const notify = vi.fn();
    const pending = gate.request(INPUT, notify);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      approvalId: 'appr-1', source: 'agent', command: INPUT.command, serverName: 'web-1', host: '10.0.0.5',
      loginUser: 'deploy', reason: INPUT.reason, title: 'Restart service',
    }));
    gate.resolve('appr-1', 'deny');
    await expect(pending).resolves.toEqual({ approvalId: 'appr-1', decision: 'deny', by: 'owner' });
  });

  it('settles each approval once', async () => {
    const gate = new ApprovalGate({ newId: () => 'a' });
    const pending = gate.request(INPUT, () => {});
    expect(gate.resolve('a', 'deny')).not.toBeNull();
    expect(gate.resolve('a', 'allow')).toBeNull();
    await expect(pending).resolves.toMatchObject({ decision: 'deny' });
  });

  it('ignores an answer for another server', () => {
    const gate = new ApprovalGate({ newId: () => 'a' });
    void gate.request(INPUT, () => {});
    expect(gate.resolve('a', 'allow', 'other-server')).toBeNull();
    expect(gate.pending()).toHaveLength(1);
    gate.dispose();
  });

  it('Stop denies every approval of that run and no other', async () => {
    let n = 0;
    const gate = new ApprovalGate({ newId: () => `a${++n}` });
    const one = gate.request(INPUT, () => {});
    const two = gate.request({ ...INPUT, actionId: 'container_stop' }, () => {});
    const other = gate.request({ ...INPUT, runId: 'run-2' }, () => {});
    expect(gate.cancelRun('run-1')).toBe(2);
    await expect(one).resolves.toMatchObject({ decision: 'deny', by: 'stop' });
    await expect(two).resolves.toMatchObject({ decision: 'deny', by: 'stop' });
    expect(gate.pending().map((r) => r.runId)).toEqual(['run-2']);
    gate.resolve('a3', 'deny');
    await other;
  });

  it('expires unanswered approvals as deny', async () => {
    vi.useFakeTimers();
    const gate = new ApprovalGate({ timeoutMs: 1000 });
    const pending = gate.request(INPUT, () => {});
    vi.advanceTimersByTime(1001);
    await expect(pending).resolves.toMatchObject({ decision: 'deny', by: 'timeout' });
  });

  it('a throwing listener does not hang the run', async () => {
    vi.useFakeTimers();
    const gate = new ApprovalGate({ timeoutMs: 50 });
    const pending = gate.request(INPUT, () => { throw new Error('socket gone'); });
    vi.advanceTimersByTime(60);
    await expect(pending).resolves.toMatchObject({ by: 'timeout' });
  });
});

describe('ApprovalGate — staged view approvals', () => {
  const run = { serverId: 'srv', actionId: 'service_restart', params: { unit: 'nginx', reason: 'Button' }, command: INPUT.command };

  it('take() returns a one-time ticket for exactly what was previewed', () => {
    const gate = new ApprovalGate();
    const request = gate.stage(INPUT, run);
    expect(request.source).toBe('view');
    const taken = gate.take(request.approvalId, 'srv')!;
    expect(taken.ticket).toMatchObject({ ...run, approvalId: request.approvalId });
    expect(gate.take(request.approvalId, 'srv')).toBeNull();
    expect(gate.redeem(taken.ticket)).toBe(true);
    expect(gate.redeem(taken.ticket)).toBe(false);
    expect(gate.redeem({ ...taken.ticket })).toBe(false); // a copy is not a ticket
  });

  it('refuses take() for another server and after expiry', () => {
    vi.useFakeTimers();
    const gate = new ApprovalGate({ timeoutMs: 1000 });
    const a = gate.stage(INPUT, run);
    expect(gate.take(a.approvalId, 'other')).toBeNull();
    vi.advanceTimersByTime(1001);
    expect(gate.take(a.approvalId, 'srv')).toBeNull();
  });

  it('deny drops a staged approval; allow must go through take()', () => {
    const gate = new ApprovalGate();
    const a = gate.stage(INPUT, run);
    expect(gate.resolve(a.approvalId, 'allow')).toBeNull();
    expect(gate.resolve(a.approvalId, 'deny')).toMatchObject({ decision: 'deny', by: 'owner' });
    expect(gate.take(a.approvalId, 'srv')).toBeNull();
  });
});

describe('ActionAudit', () => {
  it('appends one JSON line per entry, in order, and never rewrites', async () => {
    const audit = new ActionAudit({ dir: tempDir() });
    const gate = new ApprovalGate({ audit, newId: () => 'appr-9' });
    const pending = gate.request(INPUT, () => {});
    const before = readFileSyncSafe(audit.path);
    gate.resolve('appr-9', 'allow');
    await pending;
    await audit.log({ event: 'ran', runId: 'run-1', approvalId: 'appr-9', serverId: 'srv', actionId: 'service_restart', risk: 'change', command: INPUT.command, exitCode: 0, durationMs: 120 });

    const text = readFileSync(audit.path, 'utf8');
    expect(text.startsWith(before)).toBe(true); // earlier lines untouched
    const entries = text.trim().split('\n').map((l) => JSON.parse(l) as AuditEntry);
    expect(entries.map((e) => e.event)).toEqual(['asked', 'answered', 'ran']);
    expect(entries[0]).toMatchObject({ approvalId: 'appr-9', loginUser: 'deploy', reason: INPUT.reason, command: INPUT.command });
    expect(entries[1]).toMatchObject({ decision: 'allow', by: 'owner' });
    expect(entries[2]).toMatchObject({ exitCode: 0 });
    expect(await audit.recent(2)).toEqual(entries.slice(1));
  });

  it.skipIf(process.platform === 'win32')('creates the file 0600 inside a 0700 directory', async () => {
    const dir = join(tempDir(), 'audit');
    const audit = new ActionAudit({ dir });
    await audit.log({ event: 'refused', runId: 'r', serverId: 's', actionId: 'x', risk: 'change', command: 'c' });
    expect(statSync(audit.path).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('starts a new file past the size cap, keeping the old one', async () => {
    const dir = tempDir();
    const audit = new ActionAudit({ dir, maxBytes: 300 });
    for (let i = 0; i < 5; i++) {
      await audit.log({ event: 'asked', runId: `r${i}`, serverId: 's', actionId: 'service_restart', risk: 'change', command: 'sudo -n systemctl restart -- nginx' });
    }
    const files = readdirSync(dir).sort();
    expect(files.filter((f) => /^actions-.*\.jsonl$/.test(f)).length).toBeGreaterThan(0);
    expect(files).toContain('actions.jsonl');
    const total = files.flatMap((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n'));
    expect(total).toHaveLength(5);
  });

  it('never throws when it cannot write', async () => {
    const dir = tempDir();
    const blocker = join(dir, 'not-a-dir');
    writeFileSync(blocker, 'x');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audit = new ActionAudit({ dir: join(blocker, 'audit') });
    await expect(audit.log({ event: 'asked', runId: 'r', serverId: 's', actionId: 'x', risk: 'change', command: 'c' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

function readFileSyncSafe(path: string): string {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

