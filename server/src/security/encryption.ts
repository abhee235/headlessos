// M5.3: Credential encryption — AES-256-GCM for passwords at rest
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

// M1: a random per-install secret is mixed into the key so the encryption does
// not depend only on guessable machine facts (hostname + uid). Stored 0600.
const KEY_FILE = join(homedir(), '.headlessos', 'enc-key');
let _secretCache: string | null = null;

function getInstallSecret(): string {
  if (_secretCache) return _secretCache;
  try {
    if (existsSync(KEY_FILE)) {
      const s = readFileSync(KEY_FILE, 'utf8').trim();
      if (s.length >= 32) { _secretCache = s; return s; }
    }
  } catch { /* regenerate below */ }
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

/**
 * Current key derivation: random install secret + machine facts + salt.
 */
function deriveKey(): Buffer {
  const material = `${getInstallSecret()}:${hostname()}:${userInfo().uid}:${SALT}`;
  return scryptSync(material, SALT, KEY_LENGTH);
}

/**
 * Legacy key derivation (machine facts only). Used as a decrypt fallback so
 * credentials encrypted before M1 still open; they upgrade on next save.
 */
function deriveLegacyKey(): Buffer {
  const machineId = `${hostname()}:${userInfo().uid}:${SALT}`;
  return scryptSync(machineId, SALT, KEY_LENGTH);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a prefixed string: "enc:<iv>:<authTag>:<ciphertext>" (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';

  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
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

  const payload = encryptedStr.slice(ENCRYPTED_PREFIX.length);
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

  try {
    return tryDecrypt(deriveKey());
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
