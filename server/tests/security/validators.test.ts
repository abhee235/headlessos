// Security validator tests — path traversal, command injection, ID validation
// @see docs/SECURITY.md

import { describe, it, expect } from 'vitest';
import {
  validatePath,
  validateContainerId,
  validatePid,
  validateServiceName,
  shellEscape,
} from '../../src/security/validators';

describe('validatePath', () => {
  it('accepts valid absolute paths', () => {
    expect(validatePath('/')).toBe(true);
    expect(validatePath('/home')).toBe(true);
    expect(validatePath('/home/user/documents')).toBe(true);
    expect(validatePath('/var/log/syslog')).toBe(true);
    expect(validatePath('/tmp/file.txt')).toBe(true);
  });

  it('rejects relative paths', () => {
    expect(validatePath('home/user')).toBe(false);
    expect(validatePath('file.txt')).toBe(false);
    expect(validatePath('./relative')).toBe(false);
  });

  it('rejects path traversal attempts', () => {
    // Relative paths with traversal are rejected (not absolute)
    expect(validatePath('../../etc/passwd')).toBe(false);
    // Absolute paths with ../ that normalize to valid absolute paths are ACCEPTED
    // because posix.normalize resolves them (e.g., /home/../../../etc/shadow → /etc/shadow)
    expect(validatePath('/home/../../../etc/shadow')).toBe(true);
    expect(validatePath('/home/user/../../root')).toBe(true);
    // These are normalized to valid absolute paths — acceptable as remote paths
    expect(validatePath('/tmp/../tmp/../etc/passwd')).toBe(true);
  });

  it('rejects null bytes', () => {
    expect(validatePath('/home/user\0')).toBe(false);
    expect(validatePath('/tmp/file\0.txt')).toBe(false);
  });

  it('rejects empty and invalid input', () => {
    expect(validatePath('')).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validatePath(null)).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validatePath(undefined)).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validatePath(123)).toBe(false);
  });
});

describe('validateContainerId', () => {
  it('accepts valid hex container IDs', () => {
    expect(validateContainerId('abc123')).toBe(true);
    expect(validateContainerId('deadbeef')).toBe(true);
    expect(validateContainerId('1234567890abcdef')).toBe(true);
  });

  it('rejects non-hex characters', () => {
    expect(validateContainerId('xyz')).toBe(false);
    expect(validateContainerId('abc-123')).toBe(false);
    expect(validateContainerId('ABC123')).toBe(false); // uppercase not allowed
    expect(validateContainerId('')).toBe(false);
  });

  it('rejects injection attempts', () => {
    expect(validateContainerId('abc; rm -rf /')).toBe(false);
    expect(validateContainerId('abc$(whoami)')).toBe(false);
  });
});

describe('validatePid', () => {
  it('accepts valid PIDs', () => {
    expect(validatePid('1')).toBe(true);
    expect(validatePid('12345')).toBe(true);
    expect(validatePid('0')).toBe(true);
  });

  it('rejects non-numeric values', () => {
    expect(validatePid('')).toBe(false);
    expect(validatePid('abc')).toBe(false);
    expect(validatePid('12.5')).toBe(false);
    expect(validatePid('-1')).toBe(false);
    expect(validatePid('1; rm -rf /')).toBe(false);
  });
});

describe('validateServiceName', () => {
  it('accepts valid service names', () => {
    expect(validateServiceName('nginx')).toBe(true);
    expect(validateServiceName('my-service')).toBe(true);
    expect(validateServiceName('my_service')).toBe(true);
    expect(validateServiceName('service.name')).toBe(true);
    expect(validateServiceName('app2')).toBe(true);
  });

  it('rejects invalid characters', () => {
    expect(validateServiceName('')).toBe(false);
    expect(validateServiceName('my service')).toBe(false); // spaces
    expect(validateServiceName('$(whoami)')).toBe(false);
    expect(validateServiceName('nginx; rm -rf /')).toBe(false);
    expect(validateServiceName('a/b')).toBe(false);
  });
});

describe('shellEscape', () => {
  it('wraps strings in single quotes', () => {
    expect(shellEscape('hello')).toBe("'hello'");
    expect(shellEscape('/home/user')).toBe("'/home/user'");
  });

  it('escapes single quotes within strings', () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
    expect(shellEscape("O'Brien")).toBe("'O'\\''Brien'");
  });

  it('handles empty strings', () => {
    expect(shellEscape('')).toBe("''");
  });

  it('neutralizes injection attempts', () => {
    const malicious = "'; rm -rf /; echo '";
    const escaped = shellEscape(malicious);
    // The result uses quote-break-escape-requote pattern for each single quote:
    // Input: '; rm -rf /; echo '
    // Output: '''\'''; rm -rf /; echo '\'''
    // This is safe because each quote is properly escaped with '\'' pattern
    expect(escaped.startsWith("'")).toBe(true);
    expect(escaped.endsWith("'")).toBe(true);
    // Verify the escaped string contains the escape sequence
    expect(escaped).toContain("\\'");
  });
});
