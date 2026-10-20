// EX8.9: Task Manager — App history / Startup / Users / Services helpers
import { describe, it, expect } from 'vitest';
import { summarizeUsers } from '../../src/components/TaskManager/UsersTab';
import { serviceStatus } from '../../src/components/TaskManager/ServicesTab';
import { formatCpuTime, formatMs, glyphFor } from '../../src/components/TaskManager/kit';
import type { ProcessData, ServiceData, TaskManagerAccount } from '../../src/lib/api';

const proc = (user: string, command: string, cpu: number, rss: number): ProcessData => ({
  pid: Math.floor(Math.random() * 1e6), user, cpu, memory: 0, vsz: 0, rss, stat: 'S', started: '', time: '', command,
});

const accounts: TaskManagerAccount[] = [
  { name: 'root', uid: 0, shell: '/bin/bash', kind: 'admin' },
  { name: 'www-data', uid: 33, shell: '/usr/sbin/nologin', kind: 'service' },
  { name: 'testuser', uid: 1000, shell: '/bin/bash', kind: 'standard' },
  { name: 'alice', uid: 1001, shell: '/bin/bash', kind: 'standard' },
];

describe('summarizeUsers', () => {
  it('sums CPU, memory and processes per user; you first, then by CPU', () => {
    const users = summarizeUsers(
      [
        proc('root', '/usr/sbin/sshd -D', 3, 4000),
        proc('www-data', 'nginx: worker', 8, 10_000),
        proc('www-data', 'nginx: worker', 2, 10_000),
        proc('testuser', '-bash', 1, 5000),
      ],
      accounts,
      [{ user: 'testuser', tty: 'pts/0', from: '10.0.0.2', loginAt: null }],
      'testuser',
    );
    expect(users.map((u) => u.name)).toEqual(['testuser', 'www-data', 'root']);
    const www = users[1];
    expect(www).toMatchObject({ cpu: 10, rssKb: 20_000, processes: 2, isYou: false });
    expect(www.account?.kind).toBe('service');
    expect(users[0].sessions).toHaveLength(1);
  });

  it("leaves out HeadlessOS's own probes and lists users with only a session", () => {
    const users = summarizeUsers(
      [proc('testuser', 'ps aux', 50, 3000), proc('testuser', 'cat /proc/stat', 10, 1000)],
      accounts,
      [{ user: 'alice', tty: 'pts/3', from: null, loginAt: null }],
      'testuser',
    );
    expect(users.find((u) => u.name === 'testuser')).toBeUndefined();
    expect(users.find((u) => u.name === 'alice')).toMatchObject({ processes: 0, sessions: [{ tty: 'pts/3' }] });
  });
});

describe('serviceStatus', () => {
  const svc = (p: Partial<ServiceData>): ServiceData => ({
    name: 'x', loadState: 'loaded', activeState: 'inactive', subState: 'dead', description: '', ...p,
  });
  it.each([
    [svc({ activeState: 'active', subState: 'running' }), 'Running'],
    [svc({ activeState: 'active', subState: 'exited' }), 'Active'],
    [svc({ activeState: 'failed', subState: 'failed' }), 'Failed'],
    [svc({}), 'Stopped'],
    [svc({ startup: 'disabled' }), 'Disabled'],
    [svc({ loadState: 'masked' }), 'Disabled'],
  ])('%#: → %s', (s, label) => {
    expect(serviceStatus(s).label).toBe(label);
  });
});

describe('formatters', () => {
  it('formats CPU time as h:mm:ss', () => {
    expect(formatCpuTime(16384)).toBe('4:33:04');
    expect(formatCpuTime(65)).toBe('1:05');
    expect(formatCpuTime(0)).toBe('0:00');
  });
  it('formats boot delays', () => {
    expect(formatMs(1200)).toBe('1.2 s');
    expect(formatMs(340)).toBe('340 ms');
  });
  it('picks a glyph from the program name', () => {
    expect(glyphFor('nginx').displayName).toMatch(/Globe/);
    expect(glyphFor('postgres').displayName).toMatch(/Database/);
    expect(glyphFor('unknownd').displayName).toMatch(/Cog/);
  });
});
