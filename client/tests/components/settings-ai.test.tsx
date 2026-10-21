// EX9.3: Settings → AI — Ollama as a provider
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const api = vi.hoisted(() => ({
  fetchLLMConfig: vi.fn(),
  fetchLLMModels: vi.fn(async () => ({ success: true, data: { openai: [{ id: 'gpt-6-luna', name: 'GPT-6 Luna', description: 'Default', recommended: true }] } })),
  fetchOllamaModels: vi.fn(),
  updateLLMConfig: vi.fn(),
}));
vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, ...api };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

import { SettingsView } from '../../src/components/Desktop/SettingsView';
import { TooltipProvider } from '../../src/components/ui/tooltip';

const renderAI = () => render(<TooltipProvider><SettingsView initialPage="ai" /></TooltipProvider>);

describe('Settings → AI with Ollama', () => {
  beforeEach(() => {
    api.fetchLLMConfig.mockResolvedValue({ success: true, data: { provider: 'openai', model: 'gpt-6-luna', hasApiKey: true, keySource: 'settings' } });
    api.fetchOllamaModels.mockResolvedValue({ success: true, data: [
      { name: 'qwen3:8b', parameterSize: '8.2B', family: 'qwen3', sizeBytes: 5_200_000_000 },
      { name: 'llama3.2:latest', parameterSize: '3.2B', family: 'llama' },
    ] });
    api.updateLLMConfig.mockResolvedValue({ success: true, data: { provider: 'ollama', model: 'qwen3:8b', hasApiKey: true, keySource: null, ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 16384 } } });
    api.fetchOllamaModels.mockClear();
    api.updateLLMConfig.mockClear();
  });

  it('lists installed models once Ollama is picked, and saves the choice', async () => {
    renderAI();
    fireEvent.click(await screen.findByText('Ollama'));
    expect(await screen.findByText('qwen3:8b')).toBeInTheDocument();
    expect(screen.getByText('8.2B · qwen3 · 5.2 GB')).toBeInTheDocument();
    expect(api.fetchOllamaModels).toHaveBeenCalledWith('http://127.0.0.1:11434', false);
    // the OpenAI model list and key field are not shown for Ollama
    expect(screen.queryByText('GPT-6 Luna ★')).toBeNull();
    expect(screen.queryByPlaceholderText(/key set/)).toBeNull();

    const save = screen.getByRole('button', { name: 'Save Configuration' });
    expect(save).toBeDisabled(); // no model picked yet
    fireEvent.click(screen.getByText('qwen3:8b'));
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() => expect(api.updateLLMConfig).toHaveBeenCalledWith({
      provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' },
    }));
    expect(await screen.findByText('http://127.0.0.1:11434 · 16,384 tokens')).toBeInTheDocument();
  });

  it('asks before sending prompts to another machine', async () => {
    renderAI();
    fireEvent.click(await screen.findByText('Ollama'));
    await screen.findByText('qwen3:8b');
    api.fetchOllamaModels.mockClear();
    fireEvent.change(screen.getByLabelText('Ollama URL'), { target: { value: 'http://10.0.0.7:11434' } });
    const consent = await screen.findByRole('switch', { name: 'Send prompts to this machine' });
    expect(screen.getByText(/This Ollama is on another machine/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(api.fetchOllamaModels).not.toHaveBeenCalled();
    fireEvent.click(consent);
    await waitFor(() => expect(api.fetchOllamaModels).toHaveBeenCalledWith('http://10.0.0.7:11434', true));
  });

  it('shows why when Ollama cannot be reached', async () => {
    api.fetchOllamaModels.mockResolvedValue({ success: false, error: 'Ollama is not reachable at http://127.0.0.1:11434: fetch failed' });
    renderAI();
    fireEvent.click(await screen.findByText('Ollama'));
    expect(await screen.findByText('Ollama is not reachable at http://127.0.0.1:11434: fetch failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Configuration' })).toBeDisabled();
  });

  it('shows the active Ollama model in the status', async () => {
    api.fetchLLMConfig.mockResolvedValue({ success: true, data: {
      provider: 'ollama', model: 'qwen3:8b', hasApiKey: true, keySource: null,
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', contextWindow: 8192 },
    } });
    renderAI();
    expect(await screen.findByText('http://127.0.0.1:11434 · 8,192 tokens')).toBeInTheDocument();
    expect(screen.queryByText('API Key')).toBeNull();
  });
});
