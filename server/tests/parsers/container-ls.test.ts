// Tests for the container `ls -lA` parser (Container Target mode).
// @see docs/phases/phase-ex7.md

import { describe, it, expect } from 'vitest';
import { parseContainerLs } from '../../src/parsers/container-ls.js';
import { shellEscape } from '../../src/security/validators.js';

describe('parseContainerLs', () => {
  it('parses busybox/alpine ls -lA output', () => {
    const raw = [
      'total 8',
      '-rw-r--r--    1 searxng  searxng        247 Sep 20 19:16 settings.yml',
      'drwxr-xr-x    2 root     root          4096 Sep 20 19:16 conf.d',
    ].join('\n');
    const entries = parseContainerLs(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ name: 'settings.yml', type: 'file', size: 247, owner: 'searxng' });
    expect(entries[1]).toMatchObject({ name: 'conf.d', type: 'directory', size: 4096 });
  });

  it('parses GNU coreutils ls -lA output', () => {
    const raw = [
      'total 12',
      '-rw-r--r-- 1 root root 1234 Jan  1 12:00 app.conf',
      'drwxr-xr-x 3 root root 4096 Jan  1 12:00 src',
    ].join('\n');
    const entries = parseContainerLs(raw);
    expect(entries.map(e => e.name)).toEqual(['app.conf', 'src']);
    expect(entries[1]!.type).toBe('directory');
  });

  it('parses a symlink with its target', () => {
    const raw = 'lrwxrwxrwx 1 root root 10 Jan  1 12:00 link -> /etc/target';
    const [entry] = parseContainerLs(raw);
    expect(entry).toMatchObject({ name: 'link', type: 'symlink', symlinkTarget: '/etc/target' });
  });

  it('skips total header, blank lines, and . / ..', () => {
    const raw = [
      'total 0',
      '',
      'drwxr-xr-x 2 root root 4096 Jan 1 12:00 .',
      'drwxr-xr-x 3 root root 4096 Jan 1 12:00 ..',
      '-rw-r--r-- 1 root root 5 Jan 1 12:00 real',
    ].join('\n');
    const entries = parseContainerLs(raw);
    expect(entries.map(e => e.name)).toEqual(['real']);
  });

  it('handles names with spaces', () => {
    const raw = '-rw-r--r-- 1 root root 5 Jan  1 12:00 my file.txt';
    const [entry] = parseContainerLs(raw);
    expect(entry!.name).toBe('my file.txt');
  });

  it('returns empty for empty input', () => {
    expect(parseContainerLs('')).toEqual([]);
    expect(parseContainerLs('total 0')).toEqual([]);
  });
});

// Mirrors the writeViaBase64 command construction in routes/container-files.ts to
// prove a malicious container path cannot break out of the nested `sh -c`.
describe('container write command construction is injection-safe', () => {
  function buildWriteCmd(cid: string, path: string, buf: Buffer): string {
    const b64 = buf.toString('base64');
    const inner = `base64 -d > ${shellEscape(path)}`;
    return `echo ${b64} | docker exec -i ${cid} sh -c ${shellEscape(inner)}`;
  }

  it('keeps a metacharacter-laden path fully quoted', () => {
    const cmd = buildWriteCmd('6a971d39aa7a', "/tmp/x';id;'", Buffer.from('hi'));
    // The path's quotes/semicolons are escaped via '\'' and never sit unquoted.
    expect(cmd).toContain("docker exec -i 6a971d39aa7a sh -c ");
    expect(cmd).not.toMatch(/sh -c [^']*;id;/); // no bare ';id;' after sh -c
  });

  it('base64 payload contains only safe characters', () => {
    const cmd = buildWriteCmd('6a971d39aa7a', '/tmp/a', Buffer.from("rm -rf /; $(reboot)\n`id`"));
    const b64 = cmd.slice('echo '.length, cmd.indexOf(' | docker'));
    expect(b64).toMatch(/^[A-Za-z0-9+/=]+$/); // dangerous content is fully encoded
  });
});
