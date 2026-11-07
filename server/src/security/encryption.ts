// M5.3: Credential encryption — AES-256-GCM for passwords at rest
// M15.18: the key no longer depends on the computer's name (ADR-028)
// M16.1: the desktop app hands the secret over from the OS keychain (ADR-029)
// @see docs/SECURITY.md § Credential Storage

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { hostname, userInfo, homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;    // AES-256
const IV_LENGTH = 16;     // GCM recommended
const AUTH_TAG_LENGTH = 16;
const SALT = 'headlessos-credential-salt-v1';

// Prefix for encrypted values to distinguish from plaintext
const ENCRYPTED_PREFIX = 'enc:';

// M15.18: marks a value made with the current key. Older values carry no version.
const CURRENT_PREFIX = `${ENCRYPTED_PREFIX}v2:`;

// M1: a random per-install secret is mixed into the key so the encryption does
// not depend only on guessable machine facts (hostname + uid). Stored 0600.
const KEY_FILE = join(homedir(), '.headlessos', 'enc-key');
// M16.2: where electron/keychain.js keeps it instead. Only the main process can open this.
const KEYCHAIN_FILE = join(homedir(), '.headlessos', 'enc-key.keychain');
let _secretCache: string | null = null;

/** M16.1: the secret exists, but this process wasn't given it */
export class LoginsLockedError extends Error {
  constructor() {
    super("Your saved logins are locked, so new ones can't be saved yet.");
    this.name = 'LoginsLockedError';
  }
}

function getInstallSecret(): string {
  if (_secretCache) return _secretCache;

  const handed = process.env.HEADLESSOS_INSTALL_SECRET;
  delete process.env.HEADLESSOS_INSTALL_SECRET; // nothing this process starts should inherit it
  if (handed && handed.length >= 32) { _secretCache = handed; return handed; }

  try {
    if (existsSync(KEY_FILE)) {
      const s = readFileSync(KEY_FILE, 'utf8').trim();
      if (s.length >= 32) { _secretCache = s; return s; }
    }
  } catch { /* regenerate below */ }

  // A new secret here would orphan every saved login, and the app would then store it over the
  // real one. Locked can be undone; that couldn't.
  if (existsSync(KEYCHAIN_FILE)) throw new LoginsLockedError();

  const secret = randomBytes(32).toString('hex');
  try {
    const dir = join(homedir(), '.headlessos');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(KEY_FILE, secret, { mode: 0o600 });
    chmodSync(KEY_FILE, 0o600);
  } catch { /* fall back to in-memory secret for this process */ }
  _secretCache = secret;
  return secret;
}

/** M16.1: can saved logins be opened in this process? */
export function loginsLocked(): boolean {
  try {
    getInstallSecret();
    return false;
  } catch (err) {
    if (err instanceof LoginsLockedError) return true;
    throw err;
  }
}

/** M16.4: where the install secret is held */
export function secretStore(): 'keychain' | 'file' | 'locked' {
  if (loginsLocked()) return 'locked';
  return existsSync(KEYCHAIN_FILE) ? 'keychain' : 'file';
}

/**
 * Current key derivation: random install secret + OS user + salt. The hostname stays out:
 * it can change with the network, and that would make every saved secret unreadable.
 */
function deriveKey(): Buffer {
  const material = `${getInstallSecret()}:${userInfo().uid}:${SALT}`;
  return scryptSync(material, SALT, KEY_LENGTH);
}

/**
 * M1 to M15.17: the install secret with the hostname. A decrypt fallback, so values saved
 * then still open while the old name holds; the stores re-encrypt them at startup.
 */
function deriveHostKey(): Buffer {
  const material = `${getInstallSecret()}:${hostname()}:${userInfo().uid}:${SALT}`;
  return scryptSync(material, SALT, KEY_LENGTH);
}

/**
 * Legacy key derivation (machine facts only). Used as a decrypt fallback so
 * credentials encrypted before M1 still open.
 */
function deriveLegacyKey(): Buffer {
  const machineId = `${hostname()}:${userInfo().uid}:${SALT}`;
  return scryptSync(machineId, SALT, KEY_LENGTH);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a prefixed string: "enc:v2:<iv>:<authTag>:<ciphertext>" (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';

  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${CURRENT_PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted string (produced by encrypt()).
 * Returns the original plaintext.
 * Returns the input unchanged if it's not encrypted (no prefix).
 */
export function decrypt(encryptedStr: string): string {
  if (!encryptedStr) return '';

  // If not encrypted, return as-is (backward compatibility for plaintext passwords)
  if (!encryptedStr.startsWith(ENCRYPTED_PREFIX)) {
    return encryptedStr;
  }

  const current = isCurrentEncryption(encryptedStr);
  const payload = encryptedStr.slice((current ? CURRENT_PREFIX : ENCRYPTED_PREFIX).length);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex!, 'hex');
  const authTag = Buffer.from(authTagHex!, 'hex');

  const tryDecrypt = (key: Buffer): string => {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext!, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };

  if (current) return tryDecrypt(deriveKey());

  try {
    return tryDecrypt(deriveHostKey());
  } catch {
    // Legacy fallback: values encrypted before the install-secret was introduced.
    return tryDecrypt(deriveLegacyKey());
  }
}

/**
 * Check if a string is already encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/** M15.18: was this made with the current key? False for plain text and for older values. */
export function isCurrentEncryption(value: string): boolean {
  return value.startsWith(CURRENT_PREFIX);
}
