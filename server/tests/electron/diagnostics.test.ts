// M15.2, M15.3: what the desktop app does when its backend exits, and its log file
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { redactSecrets } from '../../src/agent/actions/redact.js';

const require = createRequire(import.meta.url);
const { backendExitAction, createLog, describeExit, redactLogLine } = require('../../../electron/diagnostics.js');

describe('backendExitAction', () => {
  it('ignores an exit the app caused', () => {
    expect(backendExitAction({ stopping: true, ready: true })).toBe('ignore');
    expect(backendExitAction({ stopping: true, ready: false })).toBe('ignore');
  });

  it('fails the start when the backend dies before it is ready', () => {
    expect(backendExitAction({ stopping: false, ready: false })).toBe('failed-to-start');
  });

  it('asks the owner when a running backend dies', () => {
    expect(backendExitAction({ stopping: false, ready: true })).toBe('ask');
  });
});

describe('describeExit', () => {
  it('gives a normal exit code', () => {
    expect(describeExit(1)).toBe('exited with code 1');
    expect(describeExit(0)).toBe('exited with code 0');
  });

  it('hides the huge number a killed process reports on Windows', () => {
    expect(describeExit(18446744073709552000)).toBe('was stopped');
  });

  it('handles an exit with no code', () => {
    expect(describeExit(null)).toBe('was stopped');
  });
});

// The log people will paste into GitHub issues
describe('desktop log', () => {
  const dirs: string[] = [];
  const logDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'hos-log-'));
    dirs.push(dir);
    return join(dir, 'logs');
  };
  const at = () => new Date('2026-11-06T10:00:00.000Z');

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('writes one stamped line per entry, in a folder it creates', () => {
    const log = createLog({ dir: logDir(), now: at });
    log.line('main', 'starting the backend');
    expect(readFileSync(log.file, 'utf8')).toBe('2026-11-06T10:00:00.000Z [main] starting the backend\n');
  });

  it('never writes the token line, even split across two chunks', () => {
    const log = createLog({ dir: logDir(), now: at });
    log.write('backend', 'HEADLESSOS_PORT:51378\nHEADLESSOS_TO');
    log.write('backend', 'KEN:0123456789abcdef\nnext\n');
    const text = readFileSync(log.file, 'utf8');
    expect(text).toContain('HEADLESSOS_PORT:51378');
    expect(text).toContain('next');
    expect(text).not.toContain('0123456789abcdef');
    expect(text).not.toContain('KEN:');
  });

  it('holds a partial line until its newline, and flush writes what is left', () => {
    const log = createLog({ dir: logDir(), now: at });
    log.write('backend', 'first half ');
    expect(existsSync(log.file)).toBe(false);
    log.write('backend', 'second half\nthe last words');
    expect(readFileSync(log.file, 'utf8')).not.toContain('the last words');
    log.flush();
    const text = readFileSync(log.file, 'utf8');
    expect(text).toContain('[backend] first half second half\n');
    expect(text).toContain('[backend] the last words\n');
  });

  it('shows the home folder as ~, however it is written', () => {
    const home = 'C:\\Users\\jane';
    const log = createLog({ dir: logDir(), home, now: at });
    log.line('backend', 'plain C:\\Users\\jane\\.headlessos\\sessions');
    log.line('backend', '{"path":"C:\\\\Users\\\\jane\\\\file.txt"}');
    log.line('backend', 'url file:///C:/Users/jane/app/index.html');
    const text = readFileSync(log.file, 'utf8');
    expect(text).not.toContain('jane');
    expect(text).toContain('plain ~');
  });

  it('keeps sources apart', () => {
    const log = createLog({ dir: logDir(), now: at });
    log.write('a', 'one');
    log.write('b', 'two\n');
    expect(readFileSync(log.file, 'utf8')).toBe('2026-11-06T10:00:00.000Z [b] two\n');
  });

  it('moves a full log aside and keeps only one old file', () => {
    const dir = logDir();
    const log = createLog({ dir, maxBytes: 100, now: at });
    for (let i = 0; i < 12; i++) log.line('main', `entry number ${i} with some padding here`);
    expect(readFileSync(log.file, 'utf8')).toContain('entry number 11');
    expect(readdirSync(dir).sort()).toEqual(['format', 'headlessos.1.log', 'headlessos.log']);
    expect(statSync(log.file).size).toBeLessThanOrEqual(100);
  });

  it('picks up the size of a log from an earlier run', () => {
    const dir = logDir();
    createLog({ dir, now: at }).line('main', 'x'.repeat(80));
    const log = createLog({ dir, maxBytes: 100, now: at });
    log.line('main', 'second run');
    expect(existsSync(join(dir, 'headlessos.1.log'))).toBe(true);
  });

  // M16.14
  it('removes logs written under older rules, once', () => {
    const dir = logDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'headlessos.log'), 'GET /api/servers/1/files?path=/home/a/contract.pdf\n');
    writeFileSync(join(dir, 'headlessos.1.log'), 'older still\n');

    const log = createLog({ dir, now: at });
    expect(existsSync(log.file)).toBe(false);
    expect(existsSync(join(dir, 'headlessos.1.log'))).toBe(false);

    log.line('main', 'kept');
    createLog({ dir, now: at }).line('main', 'kept too');
    expect(readFileSync(log.file, 'utf8')).toContain('kept');
    expect(readFileSync(log.file, 'utf8')).toContain('kept too');
  });

  // M16.13
  it('drops a private key printed across lines', () => {
    const dir = logDir();
    const log = createLog({ dir, now: at });
    log.write('backend', 'before\n-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n');
    log.write('backend', 'hunter2bodyline\n-----END OPENSSH PRIVATE KEY-----\nafter\n');
    const text = readFileSync(log.file, 'utf8');
    expect(text).toContain('[private key removed]');
    expect(text).toContain('before');
    expect(text).toContain('after');
    expect(text).not.toContain('b3BlbnNzaC1rZXk');
    expect(text).not.toContain('hunter2bodyline');
    expect(text).not.toContain('END OPENSSH');
  });

  it('keeps logging when a key never ends, and for other sources meanwhile', () => {
    const dir = logDir();
    const log = createLog({ dir, now: at });
    log.line('backend', '-----BEGIN RSA PRIVATE KEY-----');
    log.line('main', 'still here');
    for (let i = 0; i < 200; i++) log.line('backend', `body ${i}`);
    log.line('backend', 'back to normal');
    const text = readFileSync(log.file, 'utf8');
    expect(text).toContain('still here');
    expect(text).toContain('back to normal');
    expect(text).not.toContain('body 0');
  });

  it('survives a log folder it cannot write to', () => {
    const dir = logDir();
    writeFileSync(dir, 'a file where the folder should be');
    const log = createLog({ dir, now: at });
    expect(() => log.line('main', 'still running')).not.toThrow();
  });

  it.skipIf(process.platform === 'win32')('keeps the folder and files private', () => {
    const log = createLog({ dir: logDir(), now: at });
    log.line('main', 'hello');
    expect(statSync(log.file).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(log.file)).mode & 0o777).toBe(0o700);
  });
});

describe('redactLogLine', () => {
  const SECRETS: [string, string][] = [
    ['password in JSON', '{"password":"hunter2-secret"}'],
    ['password in a config line', 'password = hunter2-secret'],
    ['passphrase', 'passphrase: hunter2-secret'],
    ['Claude key', 'calling with sk-ant-api03-hunter2secret000000000000'],
    ['OpenAI key', 'key sk-proj-hunter2secret00000000000000'],
    ['bearer token', 'Authorization: Bearer hunter2secret0000000000'],
    ['connection string', 'postgres://shop:hunter2-secret@db:5432/shop'],
    ['GitHub token', 'ghp_hunter2secret00000000000000000000000000'],
    ['JSON web token', 'eyJhbGciOiJI.eyJzdWIiOiIx.hunter2secret00'],
  ];

  it.each(SECRETS)('masks a %s, as the server filter does', (_name, line) => {
    const secret = /hunter2[-a-z0-9]*|sk-[-a-z0-9]+/i;
    expect(redactLogLine(line)).not.toMatch(secret);
    expect(redactSecrets(line).text).not.toMatch(secret);
  });

  it('masks every query value, because they name files, and keeps the rest of a URL', () => {
    const line = '{"url":"/api/servers/1/files?path=/home/a/contract.pdf&token=abc123def&tail=10"}';
    const out = redactLogLine(line);
    expect(out).not.toContain('abc123def');
    expect(out).not.toContain('contract.pdf');
    expect(out).toContain('/api/servers/1/files?path=[redacted]');
    expect(out).toContain('tail=[redacted]');
  });

  // M16.13: these aren't in redact.ts, because agent output needs them
  it.each([
    ['an address', 'connect ECONNREFUSED 192.168.1.20:22', '192.168.1.20'],
    ['an IPv6 address', 'connect ECONNREFUSED 2001:db8::8a2e:370:7334', '2001:db8'],
    ['a full IPv6 address', 'from 2001:0db8:85a3:0000:0000:8a2e:0370:7334', '85a3'],
    ['a login', 'ssh deploy@build.example.com failed', 'deploy@build.example.com'],
    ['a password flag', 'mysql --password hunter2 -h db', 'hunter2'],
    ['a long hex value', `secret-ish ${'a1b2c3d4'.repeat(8)}`, 'a1b2c3d4'],
    ['a line of a key', 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMw', 'b3BlbnNzaC1rZXk'],
  ])('masks %s', (_name, line, value) => {
    expect(redactLogLine(line)).not.toContain(value);
  });

  it('keeps what a log needs to be useful', () => {
    for (const line of [
      'Server listening at http://127.0.0.1:51378',
      'listening on 0.0.0.0',
      'HeadlessOS 0.3.1 on win32 x64, Electron 33.4.11',
      '2026-11-06T17:47:41.499Z [main] saved logins: keychain',
      '    at Object.connect (file:///C:/app/resources/server.mjs:12:5)',
      'at node:internal/process/task_queues:95:5',
      'request id 3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      '/usr/local/lib/some/very/long/path/that/has/no/digits/or/capitals/in/it/at/all',
    ]) {
      expect(redactLogLine(line)).toBe(line);
    }
  });

  it('removes the computer name from Fastify lines', () => {
    const line = '{"level":30,"pid":34852,"hostname":"janes-laptop","reqId":"req-2"}';
    const out = redactLogLine(line);
    expect(out).not.toContain('janes-laptop');
    expect(out).toContain('"reqId":"req-2"');
  });

  it('leaves ordinary lines alone', () => {
    const line = '{"level":30,"msg":"Server listening at http://127.0.0.1:51378"}';
    expect(redactLogLine(line)).toBe(line);
    expect(redactLogLine('PasswordAuthentication no')).toBe('PasswordAuthentication no');
    expect(redactLogLine('PWD=/home/pi')).toBe('PWD=/home/pi');
  });
});
