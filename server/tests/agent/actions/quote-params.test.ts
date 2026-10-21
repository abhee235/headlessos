// EX9.1: argv quoting and parameter validators
// @see docs/phases/phase-ex9.md §2–§3

import { describe, it, expect } from 'vitest';
import { quoteArg, toCommand, ArgvError } from '../../../src/agent/actions/quote.js';
import {
  readPath, unitName, containerRef, programName, hostName, httpUrl, globPattern, searchText,
  isSecretPath, READ_ROOTS,
} from '../../../src/agent/actions/params.js';

describe('quoteArg', () => {
  it('leaves the shlex-safe set alone so commands stay readable', () => {
    for (const arg of ['nginx', 'nginx.service', '--no-pager', '/var/log/syslog', 'a=b', 'user@host', '--sort=-%cpu', 'x,y:z']) {
      expect(quoteArg(arg)).toBe(arg);
    }
  });

  it('single-quotes anything with shell meaning', () => {
    expect(quoteArg('{{json .}}')).toBe("'{{json .}}'");
    expect(quoteArg('*.log')).toBe("'*.log'");
    expect(quoteArg('a b')).toBe("'a b'");
    expect(quoteArg('$(id)')).toBe("'$(id)'");
    expect(quoteArg('`id`')).toBe("'`id`'");
    expect(quoteArg('x;id')).toBe("'x;id'");
    expect(quoteArg('~/x')).toBe("'~/x'");
  });

  it("escapes embedded single quotes as '\\''", () => {
    expect(quoteArg("it's")).toBe("'it'\\''s'");
  });

  it('quotes the empty string', () => {
    expect(quoteArg('')).toBe("''");
  });

  it('refuses NUL, CR and LF', () => {
    expect(() => quoteArg('a\nb')).toThrow(ArgvError);
    expect(() => quoteArg('a\rb')).toThrow(ArgvError);
    expect(() => quoteArg('a\0b')).toThrow(ArgvError);
  });
});

describe('toCommand', () => {
  it('joins quoted argv', () => {
    expect(toCommand(['docker', 'ps', '--format', '{{json .}}'])).toBe("docker ps --format '{{json .}}'");
  });

  it('prefixes sudo -n', () => {
    expect(toCommand(['ufw', 'status'], { sudo: true })).toBe('sudo -n ufw status');
  });

  it('wraps a sandbox target in docker exec', () => {
    expect(toCommand(['restic', '--help'], { sandboxContainer: 'hos-sandbox-1' })).toBe('docker exec hos-sandbox-1 restic --help');
  });

  it('rejects a program name that is not a plain word', () => {
    expect(() => toCommand(['/bin/sh', '-c', 'id'])).toThrow(ArgvError);
    expect(() => toCommand(['-rf'])).toThrow(ArgvError);
    expect(() => toCommand([])).toThrow(ArgvError);
  });

  it('rejects a sandbox name that is not a plain word', () => {
    expect(() => toCommand(['ls'], { sandboxContainer: 'x;id' })).toThrow(ArgvError);
  });
});

describe('readPath', () => {
  const schema = readPath();
  const ok = (p: string) => schema.safeParse(p).success;

  it('accepts normalized absolute paths under a read root', () => {
    expect(ok('/var/log/syslog')).toBe(true);
    expect(ok('/etc/nginx/nginx.conf')).toBe(true);
    expect(ok('/home/alice/app/config.yml')).toBe(true);
    expect(ok('/etc')).toBe(true);
  });

  it('drops a trailing slash', () => {
    expect(schema.parse('/etc/nginx/')).toBe('/etc/nginx');
  });

  it('rejects relative, traversal, unnormalized and control-character paths', () => {
    for (const p of ['var/log', '../etc', '/var/log/../../etc/shadow', '/etc//passwd', '/etc/./hosts', '/tmp/a\nb', '-rf']) {
      expect(ok(p)).toBe(false);
    }
  });

  it('rejects paths outside the read roots', () => {
    for (const p of ['/', '/proc/self/environ', '/dev/sda', '/boot/grub/grub.cfg', '/usr/bin/sudo', '/rootkit']) {
      expect(ok(p)).toBe(false);
    }
  });

  it('rejects files that may hold secrets even under a root', () => {
    for (const p of [
      '/etc/shadow', '/etc/gshadow', '/etc/shadow-', '/etc/sudoers', '/etc/sudoers.d/90-cloud',
      '/etc/ssh/ssh_host_ed25519_key', '/home/alice/.ssh/id_rsa', '/root/.ssh/authorized_keys',
      '/etc/ssl/private/site.key', '/opt/app/cert.pem', '/srv/app/.env', '/srv/app/.env.production',
      '/home/alice/.git-credentials', '/home/alice/.aws/credentials', '/root/.docker/config.json',
    ]) {
      expect(ok(p), p).toBe(false);
    }
  });

  it('allows public config files', () => {
    expect(ok('/etc/passwd')).toBe(true);
    expect(ok('/etc/ssh/sshd_config')).toBe(true);
    expect(ok('/etc/ssh/ssh_host_ed25519_key.pub')).toBe(true);
  });

  it('says what it expected', () => {
    const r = schema.safeParse('relative/x');
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toMatch(/^expected an absolute path/);
  });

  it('exposes the roots and the secret check', () => {
    expect(READ_ROOTS).toContain('/var/log');
    expect(isSecretPath('/etc/shadow')).toBe(true);
  });
});

describe('name validators', () => {
  it('unitName', () => {
    expect(unitName().safeParse('nginx.service').success).toBe(true);
    expect(unitName().safeParse('getty@tty1.service').success).toBe(true);
    for (const bad of ['-H', 'a b', 'x;id', '../x', '', 'a\\x2d']) expect(unitName().safeParse(bad).success).toBe(false);
  });

  it('containerRef', () => {
    expect(containerRef().safeParse('web-1').success).toBe(true);
    expect(containerRef().safeParse('3f2a9c1b7d4e').success).toBe(true);
    for (const bad of ['--privileged', 'a/b', 'x y']) expect(containerRef().safeParse(bad).success).toBe(false);
  });

  it('programName refuses destructive programs and paths', () => {
    expect(programName().safeParse('restic').success).toBe(true);
    for (const bad of ['reboot', 'rm', 'mkfs.ext4', 'sudo', '/bin/sh', 'a b', '-x']) {
      expect(programName().safeParse(bad).success, bad).toBe(false);
    }
  });

  it('hostName', () => {
    for (const good of ['example.com', 'db-1.internal', '10.0.0.1', '::1', 'fe80::1']) expect(hostName().safeParse(good).success, good).toBe(true);
    for (const bad of ['-c1', 'a b', 'x;id', 'exa_mple.com']) expect(hostName().safeParse(bad).success, bad).toBe(false);
  });

  it('httpUrl', () => {
    expect(httpUrl().safeParse('https://example.com/health').success).toBe(true);
    expect(httpUrl().safeParse('http://10.0.0.1:8080/').success).toBe(true);
    for (const bad of ['file:///etc/passwd', 'https://user:pw@example.com', 'ftp://x', 'https://ex ample.com', '-K /etc/x']) {
      expect(httpUrl().safeParse(bad).success, bad).toBe(false);
    }
  });

  it('globPattern and searchText', () => {
    expect(globPattern().safeParse('*.log').success).toBe(true);
    expect(globPattern().safeParse('x -exec id').success).toBe(false);
    expect(searchText().safeParse('server_name example.com;').success).toBe(true);
    expect(searchText().safeParse('a\nb').success).toBe(false);
  });
});
