// EX8.9: Tests for Users page parsers (accounts, sessions)
// @see docs/phases/phase-ex8.md

import { describe, it, expect } from 'vitest';
import {
  classifyAccount,
  toAccounts,
  parseTtyProcessRows,
  buildSessions,
} from '../../src/parsers/deterministic/user-sessions.js';
import { parseEtcPasswd } from '../../src/parsers/deterministic/etc-passwd.js';
import { parseWho } from '../../src/parsers/deterministic/who.js';
import { TaskManagerUsersSchema } from '../../src/parsers/schemas/taskmanager.js';

const PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
sshd:x:105:65534::/run/sshd:/usr/sbin/nologin
testuser:x:1000:1001::/home/testuser:/bin/bash
deploy:x:1001:1002:Deploy,,,:/home/deploy:/bin/zsh
ci:x:1002:1003::/home/ci:/bin/false
nobody:x:65534:65534:nobody:/nonexistent:/bin/sh
`;

const WHO = `testuser pts/0        2026-10-20 14:02 (192.168.1.5)
deploy   pts/1        2026-10-20 15:30 (10.0.0.7)
root     tty1         2026-10-19 09:00
`;

// `ps -eo user:32=,tty=,etimes=`
const TTY_PS = `root                             ?          49882
testuser                         pts/0       3600
testuser                         pts/0        120
root                             pts/0        100
deploy                           pts/1        900
testuser                         ?           1761
`;

const NOW = Date.parse('2026-10-20T16:00:00.000Z');

describe('classifyAccount', () => {
  it('follows the EX8.9 contract', () => {
    expect(classifyAccount(0, '/bin/bash')).toBe('admin');
    expect(classifyAccount(1000, '/bin/bash')).toBe('standard');
    expect(classifyAccount(1001, '/usr/bin/zsh')).toBe('standard');
    expect(classifyAccount(1002, '/bin/false')).toBe('service');
    expect(classifyAccount(1003, '/usr/sbin/nologin')).toBe('service');
    expect(classifyAccount(1004, '')).toBe('service');
    expect(classifyAccount(65534, '/bin/sh')).toBe('service');
    expect(classifyAccount(33, '/bin/bash')).toBe('service');
  });
});

describe('toAccounts', () => {
  it('maps passwd entries sorted by uid', () => {
    const accounts = toAccounts(parseEtcPasswd(PASSWD));
    expect(accounts).toHaveLength(9);
    expect(accounts[0]).toEqual({ name: 'root', uid: 0, shell: '/bin/bash', kind: 'admin' });
    expect(accounts.filter((a) => a.kind === 'standard').map((a) => a.name)).toEqual(['testuser', 'deploy']);
  });
});

describe('parseTtyProcessRows', () => {
  it('keeps only processes with a terminal', () => {
    const rows = parseTtyProcessRows(TTY_PS);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.tty !== '?')).toBe(true);
  });
});

describe('buildSessions', () => {
  it('uses who, with loginAt from the oldest process on the tty', () => {
    const sessions = buildSessions(parseWho(WHO), parseTtyProcessRows(TTY_PS), NOW);
    TaskManagerUsersSchema.parse({ accounts: [], sessions, currentUser: 'testuser' });
    expect(sessions).toEqual([
      { user: 'testuser', tty: 'pts/0', from: '192.168.1.5', loginAt: '2026-10-20T15:00:00.000Z' },
      { user: 'deploy', tty: 'pts/1', from: '10.0.0.7', loginAt: '2026-10-20T15:45:00.000Z' },
      { user: 'root', tty: 'tty1', from: null, loginAt: null },
    ]);
  });

  it('falls back to one session per terminal when who is empty (containers)', () => {
    const sessions = buildSessions([], parseTtyProcessRows(TTY_PS), NOW);
    expect(sessions).toEqual([
      { user: 'testuser', tty: 'pts/0', from: null, loginAt: '2026-10-20T15:00:00.000Z' },
      { user: 'deploy', tty: 'pts/1', from: null, loginAt: '2026-10-20T15:45:00.000Z' },
    ]);
  });

  it('returns [] with no who and no terminals', () => {
    expect(buildSessions([], [], NOW)).toEqual([]);
  });
});
