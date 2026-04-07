// EX1.11: Tests for TerminalBuffer + Pattern Detection
// @see docs/phases/phase-ex1.md

import { describe, it, expect, beforeEach } from 'vitest';
import { TerminalBuffer, detectPattern } from '../../src/terminal/buffer.js';

// ── TerminalBuffer ─────────────────────────────────────────────────

describe('TerminalBuffer', () => {
  let buffer: TerminalBuffer;

  beforeEach(() => {
    buffer = new TerminalBuffer(100);
  });

  describe('append', () => {
    it('stores lines in the buffer', () => {
      buffer.append('line 1\nline 2\nline 3\n');
      const snap = buffer.getSnapshot();
      expect(snap.lineCount).toBeGreaterThanOrEqual(3);
    });

    it('strips ANSI codes from stored lines', () => {
      buffer.append('\x1b[32mgreen text\x1b[0m\n');
      const snap = buffer.getSnapshot();
      expect(snap.text).toContain('green text');
      expect(snap.text).not.toContain('\x1b[32m');
    });

    it('enforces max lines', () => {
      const smallBuffer = new TerminalBuffer(5);
      for (let i = 0; i < 10; i++) {
        smallBuffer.append(`line ${i}\n`);
      }
      expect(smallBuffer.lineCount).toBeLessThanOrEqual(6); // 5 + partial
    });

    it('accepts Buffer input', () => {
      buffer.append(Buffer.from('hello world\n'));
      const snap = buffer.getSnapshot();
      expect(snap.text).toContain('hello world');
    });
  });

  describe('getSnapshot', () => {
    it('returns empty snapshot for fresh buffer', () => {
      const snap = buffer.getSnapshot();
      expect(snap.lineCount).toBe(0);
      expect(snap.text).toBe('');
    });

    it('returns last N lines when specified', () => {
      buffer.append('a\nb\nc\nd\ne\n');
      const snap = buffer.getSnapshot(2);
      expect(snap.lineCount).toBe(2);
    });
  });

  describe('getLastCommandOutput', () => {
    it('returns null for fresh buffer', () => {
      expect(buffer.getLastCommandOutput()).toBeNull();
    });

    it('captures output between prompts', () => {
      buffer.append('user@host:~$ ls -la\n');
      buffer.append('total 4\ndrwxr-xr-x 2 user user 4096 Jan 1 12:00 .\n');
      buffer.append('user@host:~$ ');

      const output = buffer.getLastCommandOutput();
      expect(output).not.toBeNull();
      expect(output!.text).toContain('total 4');
    });
  });

  describe('clear', () => {
    it('empties the buffer', () => {
      buffer.append('some data\n');
      buffer.clear();
      expect(buffer.lineCount).toBe(0);
      expect(buffer.getLastCommandOutput()).toBeNull();
    });
  });

  describe('pattern detection on append', () => {
    it('returns a hint when table-like output is followed by a prompt', () => {
      // Simulate: command → table output → prompt
      buffer.append('user@host:~$ docker ps\n');
      buffer.append('CONTAINER ID   IMAGE          COMMAND   CREATED   STATUS   PORTS   NAMES\n');
      buffer.append('abc123def456   nginx:latest   "nginx"   2h ago    Up 2h    80/tcp  web\n');
      buffer.append('def456abc789   redis:7        "redis"   3h ago    Up 3h    6379    cache\n');
      const hint = buffer.append('user@host:~$ ');

      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('table');
      expect(hint!.confidence).toBeGreaterThan(0);
    });

    it('returns null for very short output', () => {
      buffer.append('user@host:~$ pwd\n');
      buffer.append('/home/user\n');
      const hint = buffer.append('user@host:~$ ');

      // Only 1 line of output — too short to be "interesting"
      expect(hint).toBeNull();
    });
  });
});

// ── detectPattern ──────────────────────────────────────────────────

describe('detectPattern', () => {
  it('returns null for empty input', () => {
    expect(detectPattern([])).toBeNull();
  });

  it('returns null for single line', () => {
    expect(detectPattern(['/home/user'])).toBeNull();
  });

  describe('table detection', () => {
    it('detects tabular output (df -h style)', () => {
      const lines = [
        'Filesystem      Size  Used Avail Use% Mounted on',
        '/dev/sda1        50G   20G   28G  42% /',
        'tmpfs           4.0G     0  4.0G   0% /dev/shm',
        '/dev/sdb1       100G   60G   36G  63% /data',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('table');
      expect(hint!.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('detects docker ps output', () => {
      const lines = [
        'CONTAINER ID   IMAGE          STATUS   PORTS     NAMES',
        'abc123def456   nginx:latest   Up 2h    80/tcp    web',
        'def789abc012   redis:7        Up 3h    6379/tcp  cache',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('table');
    });
  });

  describe('JSON detection', () => {
    it('detects valid JSON object', () => {
      const lines = [
        '{',
        '  "name": "test",',
        '  "version": "1.0.0"',
        '}',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('json');
      expect(hint!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects valid JSON array', () => {
      const lines = [
        '[',
        '  {"id": 1, "name": "item1"},',
        '  {"id": 2, "name": "item2"}',
        ']',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('json');
    });
  });

  describe('log detection', () => {
    it('detects syslog-style log entries', () => {
      const lines = [
        'Jan  5 14:30:01 server sshd[1234]: Accepted publickey for user',
        'Jan  5 14:30:02 server sshd[1234]: pam_unix(sshd:session): session opened',
        'Jan  5 14:30:05 server systemd[1]: Started Session 42 of user.',
        'Jan  5 14:31:00 server cron[5678]: (root) CMD (test -x /usr/sbin/anacron)',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('log');
    });

    it('detects ISO timestamp log entries', () => {
      const lines = [
        '2024-01-05 14:30:01 INFO  Starting application',
        '2024-01-05 14:30:02 WARN  Configuration file not found',
        '2024-01-05 14:30:03 ERROR Failed to connect to database',
        '2024-01-05 14:30:04 INFO  Retrying connection',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('log');
    });
  });

  describe('config detection', () => {
    it('detects key=value config files', () => {
      const lines = [
        'server.port = 8080',
        'server.host = 0.0.0.0',
        'database.url = postgres://localhost:5432/mydb',
        'database.pool = 10',
        'log.level = info',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('config');
    });

    it('detects key: value config files', () => {
      const lines = [
        'listen: 0.0.0.0:8080',
        'workers: 4',
        'timeout: 30',
        'max_connections: 1000',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('config');
    });
  });

  describe('list detection', () => {
    it('detects bulleted lists', () => {
      const lines = [
        '- Item one description here',
        '- Item two description here',
        '- Item three description here',
        '- Item four description here',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('list');
    });

    it('detects numbered lists', () => {
      const lines = [
        '1. First step',
        '2. Second step',
        '3. Third step',
        '4. Fourth step',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('list');
    });
  });

  describe('priority ordering', () => {
    it('prefers JSON over table detection', () => {
      // Valid JSON that also has spacing like a table
      const lines = [
        '{',
        '  "name":     "test",',
        '  "version":  "1.0.0"',
        '}',
      ];
      const hint = detectPattern(lines);
      expect(hint).not.toBeNull();
      expect(hint!.pattern).toBe('json');
    });
  });

  describe('non-parseable output', () => {
    it('returns null for plain text paragraphs', () => {
      const lines = [
        'This is some informational text that',
        'does not follow any structured pattern.',
      ];
      expect(detectPattern(lines)).toBeNull();
    });

    it('returns null for single command output', () => {
      const lines = ['hello world'];
      expect(detectPattern(lines)).toBeNull();
    });
  });
});
