// EX8.22: Settings → AI saved on disk, so the key and model survive restarts.
// The key is AES-256-GCM encrypted with the same per-install secret as SSH
// passwords (security/encryption.ts); the file is 0600 in ~/.headlessos.
// @see docs/phases/phase-ex8.md

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { decrypt, encrypt, isEncrypted } from '../security/encryption.js';

export const LLM_SETTINGS_FILE = join(homedir(), '.headlessos', 'llm.json');

export interface SavedLLMSettings {
  provider: 'openai';
  model?: string;
  /** Decrypted key; absent when only the model was saved (key from .env) */
  apiKey?: string;
}

/** Read and decrypt the saved settings; null when none are saved or they cannot be read */
export function loadLLMSettings(file = LLM_SETTINGS_FILE): SavedLLMSettings | null {
  try {
    if (!existsSync(file)) return null;
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { provider?: string; model?: string; apiKey?: string };
    if (raw.provider !== 'openai') return null;
    // Only an encrypted key is accepted, so a hand-edited plaintext key is never used silently
    const apiKey = raw.apiKey && isEncrypted(raw.apiKey) ? decrypt(raw.apiKey) : undefined;
    return { provider: 'openai', model: raw.model, ...(apiKey ? { apiKey } : {}) };
  } catch {
    return null;
  }
}

/**
 * Save the model, and the key when a new one is given (otherwise the saved key
 * stays). Written to a temp file and renamed, so a crash never leaves half a file.
 */
export function saveLLMSettings(update: { model: string; apiKey?: string }, file = LLM_SETTINGS_FILE): void {
  let encryptedKey: string | undefined;
  if (update.apiKey) {
    encryptedKey = encrypt(update.apiKey);
  } else {
    try {
      const prev = JSON.parse(readFileSync(file, 'utf8')) as { apiKey?: string };
      if (prev.apiKey && isEncrypted(prev.apiKey)) encryptedKey = prev.apiKey;
    } catch { /* nothing saved yet */ }
  }
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const body = JSON.stringify({ provider: 'openai', model: update.model, ...(encryptedKey ? { apiKey: encryptedKey } : {}) }, null, 2);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, body, { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* no POSIX modes on Windows */ }
}

/** Forget the saved key and model (Settings → AI → None) */
export function clearLLMSettings(file = LLM_SETTINGS_FILE): void {
  rmSync(file, { force: true });
}
