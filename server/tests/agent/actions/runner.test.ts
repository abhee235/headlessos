// EX9.1: ActionRunner
// @see docs/phases/phase-ex9.md §4

import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { ActionRunner, capText, describeParamError } from '../../../src/agent/actions/runner.js';
import { ActionCatalog, getDefaultCatalog } from '../../../src/agent/actions/catalog/index.js';
import { readAction } from '../../../src/agent/actions/catalog/define.js';
import { currentAgentScope } from '../../../src/services/policy/agent-scope.js';
import type { ActionDef } from '../../../src/agent/actions/types.js';

function sshReturning(result: Partial<{ stdout: string; stderr: string; exitCode: number }>) {
  return {
    exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, durationMs: 3, ...result }),
    getSftp: vi.fn(),
  };
}

/** A fake SFTP session over an in-memory file map; `links` maps a path to its real path. */
function fakeSftp(files: Record<string, string>, links: Record<string, string> = {}, dirs: string[] = []) {
  return {
    realpath: vi.fn((p: string, cb: (e: Error | null, v?: string) => void) => cb(null, links[p] ?? p)),
    stat: vi.fn((p: string, cb: (e: Error | null, v?: unknown) => void) => {
      if (dirs.includes(p)) return cb(null, { size: 4096, isDirectory: () => true });
      if (!(p in files)) return cb(Object.assign(new Error('No such file'), { code: 2 }));
      cb(null, { size: Buffer.byteLength(files[p]!), isDirectory: () => false });
    }),
    createReadStream: vi.fn((p: string, opts: { start: number; end: number }) => {
      const data = Buffer.from(files[p]!).subarray(opts.start, opts.end + 1);
      const stream = Readable.from([data]);
      stream.on('end', () => setImmediate(() => stream.emit('close')));
      return stream;
    }),
  };
}

describe('ActionRunner.validate', () => {
  const runner = new ActionRunner({ ssh: sshReturning({}) as never });

  it('names the closest actions for an unknown id', () => {
    const v = runner.validate('disk_space', {});
    expect(v).toEqual({ ok: false, error: expect.stringMatching(/^No such action: disk_space\. Closest: .*disk_usage/) });
  });

  it('phrases bad params as "expected …, you sent …" with the signature', () => {
    const v = runner.validate('service_status', { unit: '../x; id' });
    expect(v.ok).toBe(false);
    expect((v as { error: string }).error).toBe(
      'service_status: unit: expected a systemd unit name like nginx or nginx.service, you sent "../x; id". '
      + 'Parameters: service_status(unit: systemd unit, e.g. nginx or nginx.service; lines?: number of lines, 1–100 (default 20))',
    );
  });

  it('reports missing, mistyped and unknown params', () => {
    expect((runner.validate('service_status', {}) as { error: string }).error).toContain('unit: required (string)');
    expect((runner.validate('recent_logins', { lines: 'ten' }) as { error: string }).error).toContain('lines: expected number, you sent "ten"');
    expect((runner.validate('uptime', { verbose: true }) as { error: string }).error).toContain('unknown parameter(s) verbose');
  });

  it('applies defaults', () => {
    expect(runner.validate('service_logs', { unit: 'nginx' })).toMatchObject({ ok: true, params: { unit: 'nginx', lines: 100 } });
  });

  it('reads plain numeric and boolean strings as meant (table cells are text)', () => {
    expect(runner.validate('recent_logins', { lines: '10' })).toMatchObject({ ok: true, params: { lines: 10 } });
    expect(runner.validate('process_detail', { pid: ' 1234 ' })).toMatchObject({ ok: true, params: { pid: 1234 } });
    expect(runner.validate('process_detail', { pid: '12a' }).ok).toBe(false);
  });

  it('treats null as "not given" (models send null for optional params)', () => {
    expect(runner.validate('service_logs', { unit: 'nginx', lines: null, since: null })).toMatchObject({ ok: true, params: { unit: 'nginx', lines: 100 } });
    expect(runner.validate('uptime', null)).toMatchObject({ ok: true });
  });
});

describe('ActionRunner.run — exec actions', () => {
  it('runs exactly the built command with the action timeout', async () => {
    const ssh = sshReturning({ stdout: 'up 3 days' });
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'uptime', {});
    expect(ssh.exec).toHaveBeenCalledWith('srv', 'uptime', 15_000);
    expect(result).toMatchObject({ ok: true, actionId: 'uptime', command: 'uptime', exitCode: 0, stdout: 'up 3 days', truncated: false });
  });

  it('runs inside an exec grant naming that command', async () => {
    let seen: unknown;
    const ssh = { exec: vi.fn(async () => { seen = currentAgentScope()?.grant; return { stdout: '', stderr: '', exitCode: 0, durationMs: 1 }; }), getSftp: vi.fn() };
    await new ActionRunner({ ssh: ssh as never }).run('srv', 'disk_usage', {});
    expect(seen).toEqual({ kind: 'exec', actionId: 'disk_usage', command: 'df -hT' });
  });

  it('never calls SSH for invalid params or unknown actions', async () => {
    const ssh = sshReturning({});
    const runner = new ActionRunner({ ssh: ssh as never });
    expect((await runner.run('srv', 'service_status', { unit: '$(id)' })).ok).toBe(false);
    expect((await runner.run('srv', 'rm_everything', {})).ok).toBe(false);
    expect(ssh.exec).not.toHaveBeenCalled();
  });

  it('treats listed exit codes as success (systemctl status of an inactive unit exits 3)', async () => {
    const ssh = sshReturning({ stdout: 'inactive (dead)', exitCode: 3 });
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'service_status', { unit: 'nginx' });
    expect(result).toMatchObject({ ok: true, exitCode: 3 });
  });

  it('reports other exit codes as failure with stderr', async () => {
    const ssh = sshReturning({ stderr: 'lscpu: not found', exitCode: 127 });
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'cpu_info', {});
    expect(result).toMatchObject({ ok: false, exitCode: 127, stderr: 'lscpu: not found', error: 'exit code 127' });
  });

  it('caps stdout, keeping the tail for logs', async () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
    const catalog = new ActionCatalog([
      readAction({ id: 'big_head', title: 'h', description: 'd', category: 'logs', maxOutputBytes: 100, run: { kind: 'exec', build: () => ['cat', '/x'] } }),
      readAction({ id: 'big_tail', title: 't', description: 'd', category: 'logs', maxOutputBytes: 100, keep: 'tail', run: { kind: 'exec', build: () => ['cat', '/x'] } }),
    ]);
    const runner = new ActionRunner({ ssh: sshReturning({ stdout: lines }) as never, catalog });
    const head = await runner.run('srv', 'big_head', {});
    const tail = await runner.run('srv', 'big_tail', {});
    expect(head.truncated).toBe(true);
    expect(head.stdout.startsWith('line 0')).toBe(true);
    expect(Buffer.byteLength(head.stdout)).toBeLessThanOrEqual(100);
    expect(tail.stdout.endsWith('line 4999')).toBe(true);
  });

  it('parses output when the action has a parser, and falls back to text when parsing fails', async () => {
    const good = await new ActionRunner({ ssh: sshReturning({ stdout: '{"Names":"web","State":"running","Labels":"x"}\n' }) as never })
      .run('srv', 'docker_containers', {});
    expect(good.data).toEqual([{ Names: 'web', State: 'running' }]);
    const bad = await new ActionRunner({ ssh: sshReturning({ stdout: 'Cannot connect to the Docker daemon' }) as never })
      .run('srv', 'docker_containers', {});
    expect(bad.data).toBeUndefined();
    expect(bad.stdout).toContain('Cannot connect');
  });

  it('turns SSH errors into a short failure', async () => {
    const ssh = { exec: vi.fn().mockRejectedValue(new Error('Command timed out after 15000ms: uptime')), getSftp: vi.fn() };
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'uptime', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('timed out');
    expect(result.command).toBe('uptime');
  });

  it('refuses change actions when the runner has no approval gate', async () => {
    const change: ActionDef = {
      ...readAction({ id: 'restart_it', title: 'r', description: 'd', category: 'service', run: { kind: 'exec', build: () => ['systemctl', 'restart', 'nginx'] } }),
      risk: 'change',
    };
    const ssh = sshReturning({});
    const result = await new ActionRunner({ ssh: ssh as never, catalog: new ActionCatalog([change]) })
      .run('srv', 'restart_it', { reason: 'testing the gate' }, { allowChange: true });
    expect(result).toMatchObject({ ok: false, command: 'systemctl restart nginx' });
    expect(result.error).toContain("needs the owner's approval, which this agent cannot ask for");
    expect(ssh.exec).not.toHaveBeenCalled();
  });

  it('does not run once the signal is aborted', async () => {
    const ssh = sshReturning({});
    const controller = new AbortController();
    controller.abort();
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'uptime', {}, { signal: controller.signal });
    expect(result.ok).toBe(false);
    expect(ssh.exec).not.toHaveBeenCalled();
  });

  it('routes only cli actions into a sandbox', async () => {
    const ssh = sshReturning({ stdout: 'usage' });
    const runner = new ActionRunner({ ssh: ssh as never });
    await runner.run('srv', 'cli_help', { program: 'restic' }, { sandboxContainer: 'hos-sandbox-1' });
    expect(ssh.exec).toHaveBeenLastCalledWith('srv', 'docker exec hos-sandbox-1 restic --help', expect.any(Number));
    await runner.run('srv', 'firewall_status', {}, { sandboxContainer: 'hos-sandbox-1' });
    expect(ssh.exec).toHaveBeenLastCalledWith('srv', 'sudo -n ufw status verbose', expect.any(Number));
  });
});

describe('ActionRunner.run — SFTP reads', () => {
  it('reads a file inside an sftp grant', async () => {
    let grant: unknown;
    const sftp = fakeSftp({ '/etc/hosts': '127.0.0.1 localhost\n' });
    const ssh = { exec: vi.fn(), getSftp: vi.fn(async () => { grant = currentAgentScope()?.grant; return sftp; }) };
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'file_read', { path: '/etc/hosts' });
    expect(result).toMatchObject({ ok: true, stdout: '127.0.0.1 localhost\n', command: 'sftp: read /etc/hosts', truncated: false });
    expect(grant).toEqual({ kind: 'sftp', actionId: 'file_read', path: '/etc/hosts' });
    expect(ssh.exec).not.toHaveBeenCalled();
  });

  it('refuses a symlink that resolves to a secret file', async () => {
    const sftp = fakeSftp({ '/etc/shadow': 'root:$6$hash' }, { '/tmp/innocent': '/etc/shadow' });
    const ssh = { exec: vi.fn(), getSftp: vi.fn().mockResolvedValue(sftp) };
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'file_read', { path: '/tmp/innocent' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('resolves to /etc/shadow');
    expect(sftp.createReadStream).not.toHaveBeenCalled();
  });

  it('refuses a symlink that leaves the read roots', async () => {
    const sftp = fakeSftp({ '/proc/1/environ': 'SECRET=1' }, { '/var/log/env': '/proc/1/environ' });
    const ssh = { exec: vi.fn(), getSftp: vi.fn().mockResolvedValue(sftp) };
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'file_read', { path: '/var/log/env' });
    expect(result.ok).toBe(false);
  });

  it('caps a large file and says so', async () => {
    const sftp = fakeSftp({ '/var/log/big': 'x'.repeat(5000) });
    const ssh = { exec: vi.fn(), getSftp: vi.fn().mockResolvedValue(sftp) };
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'file_read', { path: '/var/log/big', maxBytes: 100 });
    expect(result).toMatchObject({ ok: true, truncated: true });
    expect(result.stdout).toHaveLength(100);
  });

  it('tails the last lines of a log', async () => {
    const log = Array.from({ length: 300 }, (_, i) => `entry ${i}`).join('\n') + '\n';
    const sftp = fakeSftp({ '/var/log/syslog': log });
    const ssh = { exec: vi.fn(), getSftp: vi.fn().mockResolvedValue(sftp) };
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'file_tail', { path: '/var/log/syslog', lines: 3 });
    expect(result.stdout).toBe('entry 297\nentry 298\nentry 299\n');
    expect(result.truncated).toBe(true);
  });

  it('tells the model to use dir_list for a directory', async () => {
    const sftp = fakeSftp({}, {}, ['/etc/nginx']);
    const ssh = { exec: vi.fn(), getSftp: vi.fn().mockResolvedValue(sftp) };
    const result = await new ActionRunner({ ssh: ssh as never }).run('srv', 'file_read', { path: '/etc/nginx' });
    expect(result).toMatchObject({ ok: false, error: '/etc/nginx is a directory; use dir_list' });
  });
});

describe('helpers', () => {
  it('capText keeps whole text under the cap', () => {
    expect(capText('abc', 10, 'head')).toEqual({ text: 'abc', truncated: false });
    expect(capText('abcdef', 3, 'tail')).toEqual({ text: 'def', truncated: true });
  });

  it('describeParamError caps the problem list at three', () => {
    const def = getDefaultCatalog().get('file_find')!;
    const parsed = def.params.safeParse({ path: 'x', name: 'a b', type: 'socket', depth: 9 });
    expect(parsed.success).toBe(false);
    const message = describeParamError(def, (parsed as { error: z.ZodError }).error, { path: 'x', name: 'a b', type: 'socket', depth: 9 });
    const problems = message.split('. Parameters:')[0]!.replace(/^file_find: /, '').split('; ');
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/^path: expected an absolute path/);
  });
});
