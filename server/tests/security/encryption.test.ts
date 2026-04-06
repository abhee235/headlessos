// M5.3: Encryption module tests
// @see docs/SECURITY.md § Credential Storage

import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted } from '../../src/security/encryption';

describe('encrypt', () => {
  it('encrypts a string and returns enc:-prefixed result', () => {
    const result = encrypt('mypassword');
    expect(result).toMatch(/^enc:[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
  });

  it('returns different ciphertext for same plaintext (random IV)', () => {
    const result1 = encrypt('same-password');
    const result2 = encrypt('same-password');
    expect(result1).not.toBe(result2);
  });

  it('returns empty string for empty input', () => {
    expect(encrypt('')).toBe('');
  });

  it('handles special characters', () => {
    const special = "p@s$w0rd!#%^&*()_+-=[]{}|;':\",./<>?`~";
    const encrypted = encrypt(special);
    expect(encrypted.startsWith('enc:')).toBe(true);
    expect(decrypt(encrypted)).toBe(special);
  });

  it('handles unicode characters', () => {
    const unicode = '密码🔑パスワード';
    const encrypted = encrypt(unicode);
    expect(decrypt(encrypted)).toBe(unicode);
  });

  it('handles very long passwords', () => {
    const long = 'a'.repeat(10000);
    const encrypted = encrypt(long);
    expect(decrypt(encrypted)).toBe(long);
  });
});

describe('decrypt', () => {
  it('decrypts back to original plaintext', () => {
    const original = 'my-secret-password-123';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('returns empty string for empty input', () => {
    expect(decrypt('')).toBe('');
  });

  it('returns plaintext unchanged if not encrypted (backward compat)', () => {
    expect(decrypt('plaintext-password')).toBe('plaintext-password');
    expect(decrypt('***')).toBe('***');
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('test');
    // Tamper with the ciphertext portion
    const parts = encrypted.split(':');
    parts[3] = 'ff'.repeat(parts[3]!.length / 2);
    const tampered = parts.join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on invalid format', () => {
    expect(() => decrypt('enc:invalid')).toThrow('Invalid encrypted format');
    expect(() => decrypt('enc:a:b')).toThrow('Invalid encrypted format');
  });
});

describe('isEncrypted', () => {
  it('returns true for encrypted strings', () => {
    const encrypted = encrypt('test');
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it('returns false for plaintext strings', () => {
    expect(isEncrypted('plaintext')).toBe(false);
    expect(isEncrypted('***')).toBe(false);
    expect(isEncrypted('')).toBe(false);
  });
});

describe('roundtrip', () => {
  const testCases = [
    'simple',
    'with spaces and tabs\t',
    "single'quotes",
    'double"quotes',
    'newlines\nand\nmore',
    '!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`',
    'a',                        // single char
    '\n',                       // just whitespace
    'emoji: 🔐🔑🛡️',
  ];

  for (const testCase of testCases) {
    it(`roundtrips: ${testCase.substring(0, 30)}${testCase.length > 30 ? '...' : ''}`, () => {
      const encrypted = encrypt(testCase);
      expect(decrypt(encrypted)).toBe(testCase);
    });
  }
});
