// EX2.2: Agent Command Allowlist Tests
// @see docs/phases/phase-ex2.md — EX2.2

import { describe, it, expect } from 'vitest';
import * as allowlist from '../../src/agent/command-allowlist.js';
import {
  isWriteCommandAllowed,
  isWritePathAllowed,
  AGENT_WRITE_ALLOWLIST,
  BLOCKED_PATTERNS,
  WRITE_ALLOWED_PATHS,
} from '../../src/agent/command-allowlist.js';

describe('command-allowlist', () => {
  // ── Exports ─────────────────────────────────────────────
  describe('exports', () => {
    it('exports all expected arrays', () => {
      expect(AGENT_WRITE_ALLOWLIST).toBeInstanceOf(Array);
      expect(AGENT_WRITE_ALLOWLIST.length).toBeGreaterThan(5);
      expect(BLOCKED_PATTERNS).toBeInstanceOf(Array);
      expect(BLOCKED_PATTERNS.length).toBeGreaterThan(10);
      expect(WRITE_ALLOWED_PATHS).toBeInstanceOf(Array);
      expect(WRITE_ALLOWED_PATHS.length).toBeGreaterThan(3);
    });

    // EX9.1 (ADR-024): agents run catalog actions; the free-form read allowlist is gone
    it('no longer exports a read allowlist for model-written commands', () => {
      expect('isReadCommandAllowed' in allowlist).toBe(false);
      expect('AGENT_READ_ONLY_ALLOWLIST' in allowlist).toBe(false);
      expect('PIPE_FILTERS' in allowlist).toBe(false);
    });
  });

  describe('isWriteCommandAllowed', () => {
    it('allows docker write commands', () => {
      expect(isWriteCommandAllowed('docker start mycontainer')).toBe(true);
      expect(isWriteCommandAllowed('docker stop mycontainer')).toBe(true);
      expect(isWriteCommandAllowed('docker restart mycontainer')).toBe(true);
    });

    it('allows systemctl write commands', () => {
      expect(isWriteCommandAllowed('systemctl restart nginx')).toBe(true);
      expect(isWriteCommandAllowed('systemctl stop myservice')).toBe(true);
      expect(isWriteCommandAllowed('systemctl enable myservice')).toBe(true);
    });

    it('allows nginx reload', () => {
      expect(isWriteCommandAllowed('nginx -s reload')).toBe(true);
    });

    it('rejects non-allowlisted write commands', () => {
      expect(isWriteCommandAllowed('rm -rf /tmp')).toBe(false);
      expect(isWriteCommandAllowed('echo hello > /tmp/test')).toBe(false);
      expect(isWriteCommandAllowed('chmod 777 /tmp')).toBe(false);
    });

    it('rejects piped write commands', () => {
      expect(isWriteCommandAllowed('docker stop mycontainer | echo done')).toBe(false);
    });

    it('rejects blocked patterns', () => {
      expect(isWriteCommandAllowed('rm -rf /')).toBe(false);
      expect(isWriteCommandAllowed('shutdown -h now')).toBe(false);
    });

    it('rejects read-only commands', () => {
      expect(isWriteCommandAllowed('docker ps')).toBe(false);
      expect(isWriteCommandAllowed('cat /etc/os-release')).toBe(false);
    });
  });

  // ── isWritePathAllowed ──────────────────────────────────
  describe('isWritePathAllowed', () => {
    it('allows user home directories', () => {
      expect(isWritePathAllowed('/home/testuser/file.txt')).toBe(true);
      expect(isWritePathAllowed('/home/ubuntu/.config/app.conf')).toBe(true);
    });

    it('allows /tmp directory', () => {
      expect(isWritePathAllowed('/tmp/output.log')).toBe(true);
      expect(isWritePathAllowed('/tmp/subdir/file.txt')).toBe(true);
    });

    it('allows /var/www directory', () => {
      expect(isWritePathAllowed('/var/www/html/index.html')).toBe(true);
    });

    it('allows nginx config directories', () => {
      expect(isWritePathAllowed('/etc/nginx/sites-available/mysite')).toBe(true);
      expect(isWritePathAllowed('/etc/nginx/sites-enabled/mysite')).toBe(true);
    });

    it('allows /opt directory', () => {
      expect(isWritePathAllowed('/opt/myapp/config.yml')).toBe(true);
    });

    it('rejects system directories', () => {
      expect(isWritePathAllowed('/etc/passwd')).toBe(false);
      expect(isWritePathAllowed('/etc/shadow')).toBe(false);
      expect(isWritePathAllowed('/usr/bin/something')).toBe(false);
      expect(isWritePathAllowed('/root/.bashrc')).toBe(false);
    });

    it('rejects path traversal', () => {
      expect(isWritePathAllowed('/home/user/../../../etc/passwd')).toBe(false);
      expect(isWritePathAllowed('/tmp/../etc/shadow')).toBe(false);
    });
  });
});
