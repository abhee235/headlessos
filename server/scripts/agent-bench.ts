// EX9.4: Agent benchmark CLI — how well a model drives the action catalog
// @see docs/phases/phase-ex9.md §9, server/src/agent/bench/bench.ts
//
//   npm run bench:agents -- --provider ollama --model qwen3:8b [--url http://127.0.0.1:11434]
//   npm run bench:agents -- --provider openai --model gpt-6-luna
//   npm run bench:agents -- --provider anthropic --model claude-haiku-5-5   (EX11.2)
//   options: --steps 6  --only disk,ports  --json results.json
//
// Every question runs read-only against `fake-server` (canned output); no real
// server is touched. It does call the model, so it costs tokens with OpenAI and Anthropic.

import { writeFileSync } from 'node:fs';
import { BENCH_QUESTIONS, formatBench, runBench } from '../src/agent/bench/bench.js';
import type { LLMProvider } from '../src/llm/provider.js';
import { OpenAIProvider } from '../src/llm/providers/openai.js';
import { DEFAULT_OLLAMA_URL, OllamaProvider, checkOllamaUrl } from '../src/llm/providers/ollama.js';
import { AnthropicProvider } from '../src/llm/providers/anthropic.js';
import { probeOllamaLimits } from '../src/llm/model-limits.js';
import { loadLLMSettings } from '../src/llm/llm-settings-store.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function provider(): Promise<LLMProvider> {
  const kind = arg('provider') ?? 'ollama';
  const model = arg('model');
  if (kind === 'ollama') {
    if (!model) throw new Error('--model is required for Ollama, e.g. --model qwen3:8b');
    const checked = checkOllamaUrl(arg('url') ?? DEFAULT_OLLAMA_URL, process.argv.includes('--allow-remote'));
    if (!checked.ok) throw new Error(checked.error);
    // EX10.1: the model's real window (lowest of the Modelfile, trained length, 64K auto cap)
    const limits = await probeOllamaLimits(checked.url, model);
    return new OllamaProvider({ baseUrl: checked.url, model, limits });
  }
  if (kind === 'openai') {
    const key = loadLLMSettings()?.apiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('No OpenAI key: save one in Settings → AI or set OPENAI_API_KEY');
    return new OpenAIProvider(key, model);
  }
  if (kind === 'anthropic') {
    // EX11.2: the key saved in Settings → AI, or ANTHROPIC_API_KEY
    const saved = loadLLMSettings()?.anthropic;
    const key = saved?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('No Anthropic key: save one in Settings → AI or set ANTHROPIC_API_KEY');
    return new AnthropicProvider(key, model ?? saved?.model);
  }
  throw new Error(`Unknown provider: ${kind} (use ollama, openai or anthropic)`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log('npm run bench:agents -- --provider ollama|openai|anthropic --model <name> [--url <ollama url>] [--steps 6] [--only id,id] [--json file]');
    console.log(`questions: ${BENCH_QUESTIONS.map((q) => q.id).join(', ')}`);
    return;
  }
  const only = arg('only')?.split(',');
  const questions = only ? BENCH_QUESTIONS.filter((q) => only.includes(q.id)) : BENCH_QUESTIONS;
  const p = await provider();
  console.log(`Running ${questions.length} questions with ${p.name} ${p.model}…`);
  const summary = await runBench(p, {
    questions,
    maxSteps: Number(arg('steps') ?? 6),
    onRow: (r) => console.log(`  ${r.id}: ${r.picked ? 'picked' : 'missed'} (${r.actions.join(', ') || 'no actions'})`),
  });
  console.log(`\n${formatBench(summary)}`);
  const out = arg('json');
  if (out) {
    writeFileSync(out, JSON.stringify(summary, null, 2));
    console.log(`\nSaved ${out}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
