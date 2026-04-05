// M5.3: Credential encryption — AES-256-GCM for passwords at rest
// @see docs/SECURITY.md § Credential Storage

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { hostname, userInfo } from 'os';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;    // AES-256
const IV_LENGTH = 16;     // GCM recommended
const AUTH_TAG_LENGTH = 16;
const SALT = 'headlessos-credential-salt-v1';

// Prefix for encrypted values to distinguish from plaintext
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Derive an encryption key from machine-specific data.
 * Uses os.hostname() + os.userInfo().uid + app salt.
 * This ensures credentials are tied to the specific machine and user.
 */
function deriveKey(): Buffer {
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

  const key = deriveKey();
  const iv = Buffer.from(ivHex!, 'hex');
  const authTag = Buffer.from(authTagHex!, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext!, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a string is already encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}
