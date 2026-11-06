// M15.2, M15.3: what the desktop app does when its backend exits, and its log file
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    expect(readdirSync(dir).sort()).toEqual(['headlessos.1.log', 'headlessos.log']);
    expect(statSync(log.file).size).toBeLessThanOrEqual(100);
  });

  it('picks up the size of a log from an earlier run', () => {
    const dir = logDir();
    createLog({ dir, now: at }).line('main', 'x'.repeat(80));
    const log = createLog({ dir, maxBytes: 100, now: at });
    log.line('main', 'second run');
    expect(existsSync(join(dir, 'headlessos.1.log'))).toBe(true);
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

  it('masks the API token in a request URL and keeps the rest of it', () => {
    const line = '{"req":{"method":"GET","url":"/api/wallpapers/a.jpg?size=2&token=abc123def&x=1"}}';
    const out = redactLogLine(line);
    expect(out).not.toContain('abc123def');
    expect(out).toContain('/api/wallpapers/a.jpg?size=2');
    expect(out).toContain('x=1');
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
