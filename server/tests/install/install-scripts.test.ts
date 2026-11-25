// M17.3: one command installs HeadlessOS on macOS and Windows, checked against the release's SHA256SUMS.
// Neither script is ever run on the system it installs on: here they only show their guards.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const sh = readFileSync(join(root, 'install.sh'), 'utf8');
const ps1 = readFileSync(join(root, 'install.ps1'), 'utf8');
const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');

const has = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return !r.error && r.status === 0;
};
const shAvailable = has('sh', ['-c', 'exit 0']);
const powershell = ['pwsh', 'powershell'].find((p) => has(p, ['-NoProfile', '-Command', 'exit 0']));

/** Lines that do something: no comments, no blank lines. */
const code = (text: string, comment: string) =>
  text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith(comment));

describe('install.sh (macOS)', () => {
  it('runs everything from one function called on the last line', () => {
    const lines = code(sh, '#');
    expect(sh.startsWith('#!/bin/sh\n')).toBe(true);
    expect(sh).not.toContain('\r');
    expect(lines).toContain('set -eu');
    expect(lines[lines.length - 1]).toBe('main "$@"');
  });

  it('checks the file against SHA256SUMS before unpacking it', () => {
    const sums = sh.indexOf('"$expected" = "$actual"');
    expect(sums).toBeGreaterThan(sh.indexOf('releases/download/$tag/SHA256SUMS'));
    expect(sums).toBeLessThan(sh.indexOf('ditto -x -k'));
    expect(sh).toContain('shasum -a 256');
    expect(sh).toContain('gh attestation verify');
  });

  it('unpacks with ditto, checks the signature, and never asks for administrator rights', () => {
    expect(sh).toContain('ditto -x -k');
    expect(code(sh, '#').join('\n')).not.toMatch(/\bunzip\b/);
    expect(sh).toContain('codesign --verify --deep --strict');
    expect(code(sh, '#').join('\n')).not.toMatch(/\bsudo\b/);
  });

  it('downloads the file name the release has', () => {
    expect(sh).toContain('asset="HeadlessOS-${tag#v}-universal-mac.zip"');
    expect(workflow).toContain('electron/dist/*.zip');
  });

  it('refuses to replace a running copy', () => {
    const refuse = sh.lastIndexOf('refuse_if_running');
    expect(sh).toContain('pgrep -xq HeadlessOS');
    expect(refuse).toBeLessThan(sh.indexOf('rm -rf "$app"'));
  });

  it.skipIf(!shAvailable || process.platform === 'darwin')('stops on a system that is not macOS', () => {
    const r = spawnSync('sh', [join(root, 'install.sh')], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('HeadlessOS was not installed: this script is for macOS');
  });
});

describe('install.ps1 (Windows)', () => {
  it('runs everything from one function, and reports errors instead of closing the window', () => {
    const lines = code(ps1, '#');
    expect(lines.slice(-2)).toEqual([
      'try { Install-HeadlessOS }',
      'catch { Write-Host "HeadlessOS was not installed: $($_.Exception.Message)" -ForegroundColor Red }',
    ]);
    expect(lines.join('\n')).not.toMatch(/\bexit\b/);
  });

  it('is plain ASCII, so Windows PowerShell reads a saved copy as written', () => {
    expect(/^[\x00-\x7f]*$/.test(ps1)).toBe(true);
  });

  it('checks the installer against SHA256SUMS before running it', () => {
    const sums = ps1.indexOf('$expected -ne $actual');
    expect(sums).toBeGreaterThan(ps1.indexOf('releases/download/$tag/SHA256SUMS'));
    expect(sums).toBeLessThan(ps1.indexOf('Start-Process -FilePath $setup'));
    expect(ps1).toContain('Get-FileHash -Algorithm SHA256');
    expect(ps1).toContain('gh attestation verify');
  });

  it('installs for this account without asking for administrator rights', () => {
    expect(ps1).toContain("-ArgumentList '/S' -Wait -PassThru");
    expect(ps1).not.toMatch(/RunAs/i);
  });

  it('downloads the installer under the name GitHub gives it', () => {
    expect(ps1).toContain('$asset = "HeadlessOS.Setup.$($tag.Substring(1)).exe"');
    expect(workflow).toContain('mv -- "$f" "${f// /.}"');
  });

  it('refuses to replace a running copy', () => {
    expect(ps1.lastIndexOf("Get-Process -Name 'HeadlessOS'")).toBeLessThan(ps1.indexOf('Start-Process -FilePath $setup'));
  });

  it.skipIf(!powershell)('parses without errors', () => {
    const file = join(root, 'install.ps1').replace(/'/g, "''");
    const r = spawnSync(
      powershell!,
      ['-NoProfile', '-Command', `$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${file}', [ref]$null, [ref]$e); $e.Count`],
      { encoding: 'utf8' },
    );
    expect(r.stdout.trim()).toBe('0');
  });

  it.skipIf(!powershell || process.platform === 'win32')('stops on a system that is not Windows', () => {
    const r = spawnSync(powershell!, ['-NoProfile', '-File', join(root, 'install.ps1')], { encoding: 'utf8' });
    expect(r.stdout).toContain('HeadlessOS was not installed: this script is for Windows');
  });
});
