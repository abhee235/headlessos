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

  // EX10.1: the owner's context window is kept; anything not offered reads as Auto
  it('keeps the owner’s context window, and drops one that is not offered', () => {
    const f = tempFile();
    saveLLMSettings({ provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 32768 } }, f);
    expect(loadLLMSettings(f)?.ollama).toEqual({ baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 32768 });
    writeFileSync(f, JSON.stringify({ provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 999 } }));
    expect(loadLLMSettings(f)?.ollama).toEqual({ baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' });
  });

  it('ignores an Ollama choice without a usable URL and model', () => {
    const f = tempFile();
    saveLLMSettings({ model: 'x' }, f);
    writeFileSync(f, JSON.stringify({ provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434' } }));
    expect(loadLLMSettings(f)).toBeNull();
  });
});

// EX11.2: Claude as a third provider
describe('LLM settings store — Claude', () => {
  it('saves the Claude key encrypted, and every switch keeps the other providers', () => {
    const f = tempFile();
    saveLLMSettings({ model: 'gpt-6-luna', apiKey: 'sk-openai' }, f);
    saveLLMSettings({ provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' } }, f);
    saveLLMSettings({ provider: 'anthropic', anthropic: { model: 'claude-haiku-5-5', apiKey: 'sk-ant-secret' } }, f);
    const raw = readFileSync(f, 'utf8');
    expect(raw).not.toContain('sk-ant-secret');
    expect(JSON.parse(raw).anthropic).toEqual({ model: 'claude-haiku-5-5', apiKey: expect.stringMatching(/^enc:/) });
    const all = {
      model: 'gpt-6-luna',
      apiKey: 'sk-openai',
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' },
      anthropic: { model: 'claude-haiku-5-5', apiKey: 'sk-ant-secret' },
    };
    expect(loadLLMSettings(f)).toEqual({ provider: 'anthropic', ...all });
    saveLLMSettings({ model: 'gpt-6-luna' }, f);
    expect(loadLLMSettings(f)).toEqual({ provider: 'openai', ...all });
    saveLLMSettings({ provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' } }, f);
    expect(loadLLMSettings(f)).toEqual({ provider: 'ollama', ...all });
  });

  it('keeps the Claude key when only the model changes', () => {
    const f = tempFile();
    saveLLMSettings({ provider: 'anthropic', anthropic: { model: 'claude-haiku-5-5', apiKey: 'sk-ant-keep' } }, f);
    saveLLMSettings({ provider: 'anthropic', anthropic: { model: 'claude-sonnet-5-5' } }, f);
    expect(loadLLMSettings(f)?.anthropic).toEqual({ model: 'claude-sonnet-5-5', apiKey: 'sk-ant-keep' });
  });

  it('ignores a Claude choice with no usable key, and a hand-written plaintext key', () => {
    const f = tempFile();
    saveLLMSettings({ model: 'x' }, f);
    writeFileSync(f, JSON.stringify({ provider: 'anthropic', anthropic: { model: 'claude-haiku-5-5', apiKey: 'sk-ant-plain' } }));
    expect(loadLLMSettings(f)).toBeNull();
    writeFileSync(f, JSON.stringify({ provider: 'openai', model: 'gpt-6-luna', anthropic: { model: 'claude-haiku-5-5', apiKey: 'sk-ant-plain' } }));
    expect(loadLLMSettings(f)).toEqual({ provider: 'openai', model: 'gpt-6-luna', anthropic: { model: 'claude-haiku-5-5' } });
  });
});
