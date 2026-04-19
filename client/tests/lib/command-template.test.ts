// EX5-A.2: Command Template Utility tests
// @see docs/phases/phase-ex5.md — EX5-A.2

import { describe, it, expect } from 'vitest';
import { composeCommand, shellEscape } from '../../src/lib/command-template';

describe('shellEscape', () => {
  it('returns safe strings as-is', () => {
    expect(shellEscape('/etc/nginx/nginx.conf')).toBe('/etc/nginx/nginx.conf');
    expect(shellEscape('myfile.txt')).toBe('myfile.txt');
    expect(shellEscape('user-name_123')).toBe('user-name_123');
    expect(shellEscape('~/.config')).toBe('~/.config');
  });

  it('wraps strings with spaces in single quotes', () => {
    expect(shellEscape('my file.txt')).toBe("'my file.txt'");
  });

  it('escapes single quotes', () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it('wraps strings with special chars', () => {
    expect(shellEscape('$HOME')).toBe("'$HOME'");
    expect(shellEscape('foo;rm -rf /')).toBe("'foo;rm -rf /'");
    expect(shellEscape('a && b')).toBe("'a && b'");
  });

  it('handles empty strings', () => {
    expect(shellEscape('')).toBe("''");
  });
});

describe('composeCommand', () => {
  it('substitutes simple string values', () => {
    const result = composeCommand('nginx -c {config} -p {prefix}', {
      config: '/etc/nginx.conf',
      prefix: '/usr/share/nginx',
    });
    expect(result).toBe('nginx -c /etc/nginx.conf -p /usr/share/nginx');
  });

  it('substitutes number values', () => {
    const result = composeCommand('sleep {seconds}', { seconds: 30 });
    expect(result).toBe('sleep 30');
  });

  it('includes boolean flags when true', () => {
    const result = composeCommand('restic backup {--verbose} {path}', {
      '--verbose': true,
      path: '/data',
    });
    expect(result).toBe('restic backup --verbose /data');
  });

  it('omits boolean flags when false', () => {
    const result = composeCommand('restic backup {--verbose} {path}', {
      '--verbose': false,
      path: '/data',
    });
    expect(result).toBe('restic backup /data');
  });

  it('omits empty string values', () => {
    const result = composeCommand('nginx -c {config} -p {prefix}', {
      config: '/etc/nginx.conf',
      prefix: '',
    });
    expect(result).toBe('nginx -c /etc/nginx.conf -p');
  });

  it('omits missing keys', () => {
    const result = composeCommand('cmd {a} {b} {c}', { a: 'x' });
    expect(result).toBe('cmd x');
  });

  it('shell-escapes special characters', () => {
    const result = composeCommand('echo {message}', {
      message: "hello world; rm -rf /",
    });
    expect(result).toBe("echo 'hello world; rm -rf /'");
  });

  it('handles complex real-world template', () => {
    const result = composeCommand(
      'docker run {--detach} --name {name} -p {port}:80 {image}',
      {
        '--detach': true,
        name: 'my-app',
        port: 8080,
        image: 'nginx:latest',
      },
    );
    expect(result).toBe('docker run --detach --name my-app -p 8080:80 nginx:latest');
  });

  it('cleans up extra whitespace from omitted placeholders', () => {
    const result = composeCommand('cmd  {a}  {b}  end', { a: '', b: '' });
    expect(result).toBe('cmd end');
  });
});
