// EX8.22: Settings → AI saved encrypted on disk
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { clearLLMSettings, loadLLMSettings, saveLLMSettings } from '../../src/llm/llm-settings-store.js';

const dirs: string[] = [];
function tempFile() {
  const d = mkdtempSync(join(tmpdir(), 'hos-llm-'));
  dirs.push(d);
  return join(d, 'nested', 'llm.json');
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('LLM settings store', () => {
  it('round-trips the key, and never writes it in plaintext', () => {
    const f = tempFile();
    saveLLMSettings({ model: 'gpt-6-luna', apiKey: 'sk-secret-123' }, f);
    const raw = readFileSync(f, 'utf8');
    expect(raw).not.toContain('sk-secret-123');
    expect(JSON.parse(raw)).toMatchObject({ provider: 'openai', model: 'gpt-6-luna', apiKey: expect.stringMatching(/^enc:/) });
    expect(loadLLMSettings(f)).toEqual({ provider: 'openai', model: 'gpt-6-luna', apiKey: 'sk-secret-123' });
  });

  it('keeps the saved key when only the model changes', () => {
    const f = tempFile();
    saveLLMSettings({ model: 'gpt-4.1', apiKey: 'sk-keep' }, f);
    saveLLMSettings({ model: 'gpt-6-luna' }, f);
    expect(loadLLMSettings(f)).toEqual({ provider: 'openai', model: 'gpt-6-luna', apiKey: 'sk-keep' });
  });

  it('saves a model alone (key from .env), clears, and ignores missing, broken or plaintext files', () => {
    const f = tempFile();
    saveLLMSettings({ model: 'gpt-4.1' }, f);
    expect(loadLLMSettings(f)).toEqual({ provider: 'openai', model: 'gpt-4.1' });
    clearLLMSettings(f);
    expect(loadLLMSettings(f)).toBeNull();
    clearLLMSettings(f); // no file: no throw
    saveLLMSettings({ model: 'x' }, f);
    writeFileSync(f, '{ not json');
    expect(loadLLMSettings(f)).toBeNull();
    writeFileSync(f, JSON.stringify({ provider: 'openai', model: 'm', apiKey: 'sk-plain' }));
    expect(loadLLMSettings(f)).toEqual({ provider: 'openai', model: 'm' });
  });

  // EX9.3: Ollama as the provider; switching keeps the other side's settings
  it('saves Ollama without losing the OpenAI key or model, and back again', () => {
    const f = tempFile();
    saveLLMSettings({ model: 'gpt-6-luna', apiKey: 'sk-keep' }, f);
    saveLLMSettings({ provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' } }, f);
    expect(loadLLMSettings(f)).toEqual({
      provider: 'ollama', model: 'gpt-6-luna', apiKey: 'sk-keep',
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' },
    });
    expect(readFileSync(f, 'utf8')).not.toContain('sk-keep');
    saveLLMSettings({ model: 'gpt-4.1' }, f);
    expect(loadLLMSettings(f)).toEqual({
      provider: 'openai', model: 'gpt-4.1', apiKey: 'sk-keep',
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' },
    });
  });

  it('ignores an Ollama choice without a usable URL and model', () => {
    const f = tempFile();
    saveLLMSettings({ model: 'x' }, f);
    writeFileSync(f, JSON.stringify({ provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434' } }));
    expect(loadLLMSettings(f)).toBeNull();
  });
});
