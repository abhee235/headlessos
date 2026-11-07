// M16.2, M16.3: the install secret moves into the OS keychain, and nothing can be lost on the way
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const {
  keychainNotice, keychainUsable, markKeychainExplained, openInstallSecret, shouldExplainKeychain,
} = require('../../../electron/keychain.js');

const SECRET = 'a'.repeat(64);
let dir: string;

/** Stands in for Electron's safeStorage */
function fakeKeychain(overrides: Record<string, unknown> = {}) {
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (text: string) => Buffer.from(`wrapped:${text}`),
    decryptString: (data: Buffer) => data.toString().replace(/^wrapped:/, ''),
    ...overrides,
  };
}

const plain = () => join(dir, 'enc-key');
const stored = () => join(dir, 'enc-key.keychain');

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hos-keychain-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('opening the install secret', () => {
  it('moves a plain file into the keychain and removes it', () => {
    writeFileSync(plain(), SECRET);
    const opened = openInstallSecret({ dir, safeStorage: fakeKeychain() });
    expect(opened).toEqual({ secret: SECRET, store: 'keychain' });
    expect(existsSync(plain())).toBe(false);
    expect(existsSync(stored())).toBe(true);
  });

  it('opens it again on the next start', () => {
    writeFileSync(plain(), SECRET);
    openInstallSecret({ dir, safeStorage: fakeKeychain() });
    expect(openInstallSecret({ dir, safeStorage: fakeKeychain() })).toEqual({ secret: SECRET, store: 'keychain' });
  });

  it('never writes the secret to the keychain file in plain text', () => {
    const keychain = fakeKeychain({ encryptString: (t: string) => Buffer.from(t.split('').reverse().join('')) });
    writeFileSync(plain(), `${'b'.repeat(32)}${'c'.repeat(32)}`);
    openInstallSecret({ dir, safeStorage: { ...keychain, decryptString: (d: Buffer) => d.toString().split('').reverse().join('') } });
    expect(readFileSync(stored(), 'utf8')).not.toContain(`${'b'.repeat(32)}${'c'.repeat(32)}`);
  });

  it('lets a plain file win over a stored one, so a restored backup works', () => {
    writeFileSync(stored(), 'wrapped:an-older-secret-that-is-not-the-right-one-anymore');
    writeFileSync(plain(), SECRET);
    expect(openInstallSecret({ dir, safeStorage: fakeKeychain() }).secret).toBe(SECRET);
    expect(readFileSync(stored(), 'utf8')).toBe(`wrapped:${SECRET}`);
  });

  it('makes a new secret on a new install and keeps it in the keychain', () => {
    const opened = openInstallSecret({ dir, safeStorage: fakeKeychain() });
    expect(opened.store).toBe('keychain');
    expect(opened.secret).toHaveLength(64);
    expect(existsSync(plain())).toBe(false);
  });

  it('keeps the plain file if the keychain copy does not read back', () => {
    writeFileSync(plain(), SECRET);
    const keychain = fakeKeychain({ decryptString: () => 'something else' });
    expect(openInstallSecret({ dir, safeStorage: keychain })).toEqual({ secret: SECRET, store: 'file' });
    expect(readFileSync(plain(), 'utf8')).toBe(SECRET);
    expect(existsSync(stored())).toBe(false);
  });

  it('keeps the plain file if the keychain refuses, as when someone clicks Deny', () => {
    writeFileSync(plain(), SECRET);
    const keychain = fakeKeychain({ encryptString: () => { throw new Error('denied'); } });
    expect(openInstallSecret({ dir, safeStorage: keychain })).toEqual({ secret: SECRET, store: 'file' });
    expect(existsSync(plain())).toBe(true);
    expect(existsSync(`${stored()}.tmp`)).toBe(false);
  });

  it('is locked, not lost, when the stored secret will not open', () => {
    writeFileSync(plain(), SECRET);
    openInstallSecret({ dir, safeStorage: fakeKeychain() });
    const before = readFileSync(stored());

    const keychain = fakeKeychain({ decryptString: () => { throw new Error('denied'); } });
    expect(openInstallSecret({ dir, safeStorage: keychain })).toEqual({ secret: null, store: 'locked' });

    expect(readFileSync(stored())).toEqual(before);
    expect(existsSync(plain())).toBe(false);
  });

  it('is locked when the keychain has gone away with the secret in it', () => {
    writeFileSync(stored(), `wrapped:${SECRET}`);
    const keychain = fakeKeychain({ isEncryptionAvailable: () => false });
    expect(openInstallSecret({ dir, safeStorage: keychain })).toEqual({ secret: null, store: 'locked' });
  });

  it('leaves the plain file to the backend when there is no keychain', () => {
    const keychain = fakeKeychain({ isEncryptionAvailable: () => false });
    expect(openInstallSecret({ dir, safeStorage: keychain })).toEqual({ secret: null, store: 'file' });
    expect(existsSync(stored())).toBe(false);
  });
});

describe('Linux with no secret store', () => {
  const hardcoded = () => fakeKeychain({ getSelectedStorageBackend: () => 'basic_text' });

  it('does not count a hardcoded password as a keychain', () => {
    expect(keychainUsable(hardcoded(), 'linux')).toBe(false);
    expect(keychainUsable(fakeKeychain(), 'linux')).toBe(true);
  });

  it('stays on the plain file', () => {
    writeFileSync(plain(), SECRET);
    expect(openInstallSecret({ dir, safeStorage: hardcoded(), platform: 'linux' })).toEqual({ secret: SECRET, store: 'file' });
    expect(existsSync(plain())).toBe(true);
  });

  it('does not ask a Mac or Windows build which Linux store it has', () => {
    const keychain = fakeKeychain({ getSelectedStorageBackend: () => { throw new Error('Linux only'); } });
    expect(keychainUsable(keychain, 'darwin')).toBe(true);
    expect(keychainUsable(keychain, 'win32')).toBe(true);
  });
});

describe('explaining the Keychain prompt', () => {
  it('says so once per version, on a Mac', () => {
    expect(shouldExplainKeychain({ dir, platform: 'darwin', version: '0.3.0' })).toBe(true);
    markKeychainExplained({ dir, version: '0.3.0' });
    expect(shouldExplainKeychain({ dir, platform: 'darwin', version: '0.3.0' })).toBe(false);
    expect(shouldExplainKeychain({ dir, platform: 'darwin', version: '0.3.1' })).toBe(true);
  });

  it('never appears on Windows or Linux', () => {
    expect(shouldExplainKeychain({ dir, platform: 'win32', version: '0.3.0' })).toBe(false);
    expect(shouldExplainKeychain({ dir, platform: 'linux', version: '0.3.0' })).toBe(false);
  });

  it('says why, what to click, and when to refuse', () => {
    const { detail } = keychainNotice('HeadlessOS');
    expect(detail).toContain('Always Allow');
    expect(detail).toContain('after each update');
    expect(detail).toContain('"HeadlessOS Safe Storage", click Deny');
  });
});
