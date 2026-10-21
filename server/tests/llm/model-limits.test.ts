// EX10.1: Model limits — the window every budget is planned from
// @see docs/phases/phase-ex10.md §1

import { describe, it, expect, vi } from 'vitest';
import {
  CONTEXT_WINDOW_OPTIONS, DEFAULT_LOCAL_WINDOW, HOSTED_PLAN_CAP, LOCAL_AUTO_CAP,
  hostedLimits, kvBytesPerToken, ollamaResidency, parseOllamaShow, probeOllamaLimits,
  recommendedMaxOutput, resolveOllamaLimits, validContextSetting,
} from '../../src/llm/model-limits.js';

/** `ornith:latest` (qwen35 9B) as Ollama reported it on 2026-10-22 */
const QWEN35_SHOW = {
  parameters: 'stop "<|im_end|>"\ntemperature 0.6\ntop_k 20',
  model_info: {
    'general.parameter_count': 8953803264,
    'qwen35.block_count': 32,
    'qwen35.context_length': 262144,
    'qwen35.full_attention_interval': 4,
    'qwen35.attention.head_count': 16,
    'qwen35.attention.head_count_kv': 4,
    'qwen35.attention.key_length': 256,
    'qwen35.attention.value_length': 256,
  },
};

describe('resolveOllamaLimits — the lowest of what we know', () => {
  it('caps a long-context model at 64K on Auto', () => {
    const l = resolveOllamaLimits(parseOllamaShow(QWEN35_SHOW));
    expect(l).toEqual({ contextWindow: LOCAL_AUTO_CAP, source: 'auto-cap', trainedContext: 262144, maxOutputTokens: 8192, kvBytesPerToken: 32768, local: true });
  });

  it('honours a lower Modelfile num_ctx and num_predict', () => {
    const l = resolveOllamaLimits(parseOllamaShow({ ...QWEN35_SHOW, parameters: 'num_ctx 4096\nnum_predict 512' }));
    expect(l).toMatchObject({ contextWindow: 4096, source: 'modelfile', maxOutputTokens: 512 });
  });

  it('takes the owner’s window, but never more than the model was trained for', () => {
    expect(resolveOllamaLimits(parseOllamaShow(QWEN35_SHOW), 16384)).toMatchObject({ contextWindow: 16384, source: 'owner', maxOutputTokens: 2048 });
    expect(resolveOllamaLimits(parseOllamaShow(QWEN35_SHOW), 131072)).toMatchObject({ contextWindow: 131072, source: 'owner' });
    expect(resolveOllamaLimits({ trainedContext: 40960 }, 131072)).toMatchObject({ contextWindow: 40960, source: 'trained' });
  });

  it('falls back to 8K when Ollama cannot be asked, unless the owner chose', () => {
    expect(resolveOllamaLimits(null)).toMatchObject({ contextWindow: DEFAULT_LOCAL_WINDOW, source: 'default', maxOutputTokens: 2048 });
    expect(resolveOllamaLimits(null, 32768)).toMatchObject({ contextWindow: 32768, source: 'owner' });
    expect(resolveOllamaLimits({})).toMatchObject({ contextWindow: DEFAULT_LOCAL_WINDOW, source: 'default' });
  });

  it('never lets a reply take more than half the window', () => {
    expect(resolveOllamaLimits({ numCtx: 2048, numPredict: 4096 }).maxOutputTokens).toBe(1024);
  });
});

describe('parseOllamaShow', () => {
  it('ignores rope original_context_length and non-positive values', () => {
    expect(parseOllamaShow({ parameters: 'num_ctx -1', model_info: { 'llama.rope.scaling.original_context_length': 8192, 'llama.context_length': 131072 } }))
      .toEqual({ trainedContext: 131072 });
    expect(parseOllamaShow(null)).toEqual({});
  });

  it('estimates the KV cache of hybrid and plain attention models', () => {
    // qwen35: 32 blocks / interval 4 = 8 attention layers × 4 heads × 512 × 2 bytes
    expect(kvBytesPerToken(QWEN35_SHOW.model_info)).toBe(32768);
    expect(kvBytesPerToken({ 'llama.block_count': 32, 'llama.attention.head_count_kv': 8, 'llama.attention.key_length': 128, 'llama.attention.value_length': 128 })).toBe(131072);
    expect(kvBytesPerToken({ 'llama.block_count': 32 })).toBeUndefined();
  });
});

describe('hosted models', () => {
  it('plan at most 128K whatever the table says', () => {
    expect(hostedLimits('gpt-4.1')).toEqual({ contextWindow: HOSTED_PLAN_CAP, source: 'table', maxOutputTokens: 16000, local: false });
    expect(hostedLimits('gpt-6-luna').contextWindow).toBe(HOSTED_PLAN_CAP);
    expect(hostedLimits('gpt-4o-mini')).toMatchObject({ contextWindow: 128000, source: 'table' });
    expect(hostedLimits('something-new')).toMatchObject({ contextWindow: HOSTED_PLAN_CAP, source: 'default' });
  });
});

describe('recommendedMaxOutput', () => {
  it('is an eighth of the window, between 2K and 16K', () => {
    expect(recommendedMaxOutput(8192)).toBe(2048);
    expect(recommendedMaxOutput(65536)).toBe(8192);
    expect(recommendedMaxOutput(1_000_000)).toBe(16384);
  });
});

describe('probes', () => {
  const respond = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

  it('probeOllamaLimits posts /api/show for the model', async () => {
    const fetch = respond(QWEN35_SHOW);
    expect(await probeOllamaLimits('http://h', 'ornith:latest', undefined, fetch as never)).toMatchObject({ contextWindow: 65536 });
    expect(fetch.mock.calls[0]![0]).toBe('http://h/api/show');
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ model: 'ornith:latest' });
    expect(await probeOllamaLimits('http://h', 'm', undefined, vi.fn().mockRejectedValue(new Error('down')) as never)).toMatchObject({ source: 'default' });
  });

  it('ollamaResidency tells loaded, on-GPU and spilled models apart', async () => {
    const ps = { models: [{ name: 'a', size: 100, size_vram: 100, context_length: 65536 }, { name: 'b', size: 100, size_vram: 40 }] };
    expect(await ollamaResidency('http://h', 'a', respond(ps) as never)).toEqual({ loaded: true, contextLength: 65536, sizeBytes: 100, vramBytes: 100, onCpu: false });
    expect(await ollamaResidency('http://h', 'b', respond(ps) as never)).toMatchObject({ loaded: true, onCpu: true });
    expect(await ollamaResidency('http://h', 'c', respond(ps) as never)).toEqual({ loaded: false, onCpu: false });
    expect(await ollamaResidency('http://h', 'a', vi.fn().mockRejectedValue(new Error('down')) as never)).toBeNull();
  });
});

describe('validContextSetting', () => {
  it('accepts only the offered windows', () => {
    for (const w of CONTEXT_WINDOW_OPTIONS) expect(validContextSetting(w)).toBe(w);
    expect(validContextSetting(12345)).toBeUndefined();
    expect(validContextSetting('65536')).toBeUndefined();
  });
});
