// EX8.6: exec() caps concurrent command channels per connection and retries a
// refused channel once — parallel plans used to exhaust sshd's MaxSessions.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { ConnectionManager } from '../../src/ssh/connection-manager.js';

type ExecCb = (err: Error | undefined, stream?: EventEmitter & { stderr: EventEmitter }) => void;

function fakeClient() {
  let active = 0;
  let peak = 0;
  const pending: Array<() => void> = [];
  const client = {
    refuseNext: 0,
    exec: vi.fn((_cmd: string, cb: ExecCb) => {
      if (client.refuseNext > 0) {
        client.refuseNext--;
        cb(new Error('(SSH) Channel open failure: open failed'));
        return;
      }
      active++;
      peak = Math.max(peak, active);
      const stream = Object.assign(new EventEmitter(), { stderr: new EventEmitter() });
      cb(undefined, stream);
      pending.push(() => {
        active--;
        stream.emit('data', Buffer.from('ok'));
        stream.emit('close', 0);
      });
    }),
  };
  return { client, peak: () => peak, finishAll: () => { while (pending.length) pending.shift()!(); }, pendingCount: () => pending.length };
}

function managerWith(client: unknown) {
  const cm = new ConnectionManager('ssh');
  (cm as unknown as { connections: Map<string, unknown> }).connections.set('s1', {
    client,
    state: { serverId: 's1', status: 'connected' },
  });
  return cm;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('ConnectionManager exec slots', () => {
  it('runs at most 4 commands at once and queues the rest', async () => {
    const f = fakeClient();
    const cm = managerWith(f.client);
    const runs = Array.from({ length: 9 }, (_, i) => cm.exec('s1', `cmd${i}`, 5_000));
    await tick();
    expect(f.pendingCount()).toBe(4);
    for (let i = 0; i < 4; i++) { f.finishAll(); await tick(); await tick(); }
    const results = await Promise.all(runs);
    expect(results.every((r) => r.stdout === 'ok')).toBe(true);
    expect(f.peak()).toBeLessThanOrEqual(4);
    expect(f.client.exec).toHaveBeenCalledTimes(9);
  });

  it('retries once on "Channel open failure"', async () => {
    const f = fakeClient();
    f.client.refuseNext = 1;
    const cm = managerWith(f.client);
    const run = cm.exec('s1', 'free -m', 5_000);
    await new Promise((r) => setTimeout(r, 300));
    f.finishAll();
    await expect(run).resolves.toMatchObject({ stdout: 'ok', exitCode: 0 });
    expect(f.client.exec).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry and frees the slot', async () => {
    const f = fakeClient();
    f.client.refuseNext = 2;
    const cm = managerWith(f.client);
    await expect(cm.exec('s1', 'free -m', 5_000)).rejects.toThrow(/Channel open failure/);
    const next = cm.exec('s1', 'uptime', 5_000);
    await tick();
    f.finishAll();
    await expect(next).resolves.toMatchObject({ stdout: 'ok' });
  });
});
