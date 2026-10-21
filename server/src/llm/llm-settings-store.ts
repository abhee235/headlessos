// EX8.22: Settings → AI saved on disk, so the key and model survive restarts.
// The key is AES-256-GCM encrypted with the same per-install secret as SSH
// passwords (security/encryption.ts); the file is 0600 in ~/.headlessos.
// EX9.3: the provider can be Ollama (a local model). The OpenAI key and model stay
// saved while Ollama is chosen, and the Ollama settings stay while OpenAI is, so
// switching back needs no re-entry.
// EX10.1: the Ollama settings carry the owner's context window (absent = Auto)
// @see docs/phases/phase-ex8.md, docs/phases/phase-ex9.md §8, docs/phases/phase-ex10.md §1

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { decrypt, encrypt, isEncrypted } from '../security/encryption.js';
import { validContextSetting } from './model-limits.js';

export const LLM_SETTINGS_FILE = join(homedir(), '.headlessos', 'llm.json');

/** EX9.3: a local Ollama server (no secret) */
export interface OllamaSettings {
  baseUrl: string;
  model: string;
  /** the owner confirmed a non-loopback URL */
  allowRemote?: boolean;
  /** EX10.1: the owner's window; absent = Auto (the lowest of the model's limits and 64K) */
  contextWindow?: number;
}

export interface SavedLLMSettings {
  provider: 'openai' | 'ollama';
  /** OpenAI model */
  model?: string;
  /** Decrypted OpenAI key; absent when only the model was saved (key from .env) */
  apiKey?: string;
  ollama?: OllamaSettings;
}

export type LLMSettingsUpdate =
  | { model: string; apiKey?: string }
  | { provider: 'ollama'; ollama: OllamaSettings };

interface RawSettings {
  provider?: string;
  model?: string;
  apiKey?: string;
  ollama?: unknown;
}

function readRaw(file: string): RawSettings | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as RawSettings;
  } catch {
    return null;
  }
}

function validOllama(value: unknown): OllamaSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.baseUrl !== 'string' || typeof v.model !== 'string' || !v.baseUrl || !v.model) return undefined;
  const contextWindow = validContextSetting(v.contextWindow);
  return {
    baseUrl: v.baseUrl,
    model: v.model,
    ...(v.allowRemote === true ? { allowRemote: true } : {}),
    ...(contextWindow ? { contextWindow } : {}),
  };
}

/** Read and decrypt the saved settings; null when none are saved or they cannot be read */
export function loadLLMSettings(file = LLM_SETTINGS_FILE): SavedLLMSettings | null {
  try {
    const raw = readRaw(file);
    if (!raw || (raw.provider !== 'openai' && raw.provider !== 'ollama')) return null;
    const ollama = validOllama(raw.ollama);
    if (raw.provider === 'ollama' && !ollama) return null;
    // Only an encrypted key is accepted, so a hand-edited plaintext key is never used silently
    const apiKey = raw.apiKey && isEncrypted(raw.apiKey) ? decrypt(raw.apiKey) : undefined;
    return {
      provider: raw.provider,
      ...(raw.model ? { model: raw.model } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(ollama ? { ollama } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Save the choice. OpenAI: the model, and the key when a new one is given
 * (otherwise the saved key stays). Ollama: its URL and model; the OpenAI key and
 * model stay. Written to a temp file and renamed, so a crash never leaves half a file.
 */
export function saveLLMSettings(update: LLMSettingsUpdate, file = LLM_SETTINGS_FILE): void {
  const prev = readRaw(file);
  const prevKey = prev?.apiKey && isEncrypted(prev.apiKey) ? prev.apiKey : undefined;
  const prevOllama = validOllama(prev?.ollama);

  let body: Record<string, unknown>;
  if ('provider' in update && update.provider === 'ollama') {
    body = {
      provider: 'ollama',
      ...(prev?.model ? { model: prev.model } : {}),
      ...(prevKey ? { apiKey: prevKey } : {}),
      ollama: update.ollama,
    };
  } else {
    const openai = update as { model: string; apiKey?: string };
    const encryptedKey = openai.apiKey ? encrypt(openai.apiKey) : prevKey;
    body = {
      provider: 'openai',
      model: openai.model,
      ...(encryptedKey ? { apiKey: encryptedKey } : {}),
      ...(prevOllama ? { ollama: prevOllama } : {}),
    };
  }

  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(body, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* no POSIX modes on Windows */ }
}

/** Forget the saved key, model and Ollama settings (Settings → AI → None) */
export function clearLLMSettings(file = LLM_SETTINGS_FILE): void {
  rmSync(file, { force: true });
}
