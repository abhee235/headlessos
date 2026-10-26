// EX10.1: Model limits — how big a model's window really is, and why
// @see docs/phases/phase-ex10.md §1, docs/DECISIONS.md (ADR-025)
//
// Ollama: the lowest of every limit we know (owner setting or the 64K auto cap,
// the Modelfile's num_ctx, the trained context length). Hosted: a model-name
// table, capped at 128K because every agent call resends the history.

type Fetch = typeof fetch;

/** What everything else is planned against */
export interface ModelLimits {
  contextWindow: number;
  /** which input won */
  source: 'owner' | 'modelfile' | 'trained' | 'auto-cap' | 'table' | 'default';
  /** what the model was trained for (Ollama model_info) */
  trainedContext?: number;
  /** num_predict / max_tokens for one reply */
  maxOutputTokens: number;
  /** estimated KV cache per token, bytes (Ollama, when the metadata allows) */
  kvBytesPerToken?: number;
  /** true for a model on this machine (Ollama): compact rarely, deeply */
  local: boolean;
}

/** Settings → AI → Ollama → Context window "Auto" */
export const LOCAL_AUTO_CAP = 65_536;
/** when Ollama cannot be asked and the owner set nothing */
export const DEFAULT_LOCAL_WINDOW = 8_192;
/** hosted plans never exceed this: runs are short and each call resends the history */
export const HOSTED_PLAN_CAP = 128_000;
/** the windows the owner can choose (Auto = no entry) */
export const CONTEXT_WINDOW_OPTIONS = [8_192, 16_384, 32_768, 65_536, 131_072] as const;

const OUTPUT_MIN = 2_048;
const OUTPUT_MAX = 16_384;

/** A reply may use an eighth of the window, at least 2K and at most 16K tokens. */
export function recommendedMaxOutput(window: number): number {
  return Math.min(Math.max(Math.floor(window / 8), OUTPUT_MIN), OUTPUT_MAX);
}

// ── Hosted ──────────────────────────────────────────────

/** First match wins: specific names before families */
const HOSTED_WINDOWS: Array<[RegExp, number]> = [
  // EX11.1: Haiku 5.5, Sonnet 5.5, Opus 5.5
  [/^claude-/i, 1_000_000],
  [/^gpt-6/i, 1_050_000],
  [/^gpt-5/i, 400_000],
  [/^gpt-4\.1/i, 1_047_576],
  [/^gpt-4o/i, 128_000],
  [/^o[34]/i, 200_000],
];

export function hostedContextWindow(model: string): number | undefined {
  return HOSTED_WINDOWS.find(([re]) => re.test(model))?.[1];
}

export function hostedLimits(model: string): ModelLimits {
  const known = hostedContextWindow(model);
  const contextWindow = Math.min(known ?? HOSTED_PLAN_CAP, HOSTED_PLAN_CAP);
  return { contextWindow, source: known ? 'table' : 'default', maxOutputTokens: recommendedMaxOutput(contextWindow), local: false };
}

// ── Ollama ──────────────────────────────────────────────

/** The parts of POST /api/show we use */
export interface OllamaShowFacts {
  /** Modelfile PARAMETER num_ctx */
  numCtx?: number;
  /** Modelfile PARAMETER num_predict */
  numPredict?: number;
  /** model_info *.context_length */
  trainedContext?: number;
  kvBytesPerToken?: number;
}

const positive = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined);

export function parseOllamaShow(body: unknown): OllamaShowFacts {
  if (typeof body !== 'object' || body === null) return {};
  const b = body as { parameters?: unknown; model_info?: Record<string, unknown> };
  const params = typeof b.parameters === 'string' ? b.parameters : '';
  const param = (name: string) => positive(Number(new RegExp(`^\\s*${name}\\s+(-?\\d+)`, 'm').exec(params)?.[1]));
  const info = b.model_info ?? {};
  // *.context_length, never rope.scaling.original_context_length
  const trainedKey = Object.keys(info).find((k) => /(^|\.)context_length$/i.test(k) && !/original_context_length$/i.test(k));
  const facts: OllamaShowFacts = {};
  const numCtx = param('num_ctx');
  const numPredict = param('num_predict');
  const trainedContext = trainedKey ? positive(info[trainedKey]) : undefined;
  const kv = kvBytesPerToken(info);
  if (numCtx) facts.numCtx = numCtx;
  if (numPredict) facts.numPredict = numPredict;
  if (trainedContext) facts.trainedContext = trainedContext;
  if (kv) facts.kvBytesPerToken = kv;
  return facts;
}

/**
 * KV cache per token at 16-bit: attention layers × KV heads × (key + value width) × 2 bytes.
 * Hybrid models (qwen35) only attend every `full_attention_interval` layers.
 */
export function kvBytesPerToken(info: Record<string, unknown>): number | undefined {
  const get = (suffix: string) => {
    const key = Object.keys(info).find((k) => k.endsWith(`.${suffix}`));
    return key ? positive(info[key]) : undefined;
  };
  const blocks = get('block_count');
  const kvHeads = get('attention.head_count_kv');
  const keyLen = get('attention.key_length');
  const valueLen = get('attention.value_length');
  if (!blocks || !kvHeads || !keyLen || !valueLen) return undefined;
  const interval = get('full_attention_interval') ?? 1;
  const layers = Math.max(1, Math.floor(blocks / interval));
  return layers * kvHeads * (keyLen + valueLen) * 2;
}

/**
 * The lowest of the limits we know. `ownerSetting` absent = Auto (64K cap).
 * `facts` null = Ollama could not be asked.
 */
export function resolveOllamaLimits(facts: OllamaShowFacts | null, ownerSetting?: number): ModelLimits {
  const candidates: Array<[ModelLimits['source'], number]> = [];
  if (ownerSetting) candidates.push(['owner', ownerSetting]);
  if (facts?.numCtx) candidates.push(['modelfile', facts.numCtx]);
  if (facts?.trainedContext) candidates.push(['trained', facts.trainedContext]);
  if (!ownerSetting && (facts?.numCtx || facts?.trainedContext)) candidates.push(['auto-cap', LOCAL_AUTO_CAP]);
  if (candidates.length === 0) candidates.push(['default', DEFAULT_LOCAL_WINDOW]);
  // the smallest wins; on a tie the earlier (more deliberate) input names the source
  const [source, contextWindow] = candidates.reduce((best, c) => (c[1] < best[1] ? c : best));
  return {
    contextWindow,
    source,
    ...(facts?.trainedContext ? { trainedContext: facts.trainedContext } : {}),
    maxOutputTokens: Math.min(facts?.numPredict ?? recommendedMaxOutput(contextWindow), Math.floor(contextWindow / 2)),
    ...(facts?.kvBytesPerToken ? { kvBytesPerToken: facts.kvBytesPerToken } : {}),
    local: true,
  };
}

const PROBE_TIMEOUT_MS = 5_000;

/** POST /api/show; null when Ollama does not answer */
export async function fetchOllamaShow(baseUrl: string, model: string, fetchImpl: Fetch = fetch): Promise<OllamaShowFacts | null> {
  try {
    const res = await fetchImpl(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseOllamaShow(await res.json());
  } catch {
    return null;
  }
}

export async function probeOllamaLimits(baseUrl: string, model: string, ownerSetting?: number, fetchImpl: Fetch = fetch): Promise<ModelLimits> {
  return resolveOllamaLimits(await fetchOllamaShow(baseUrl, model, fetchImpl), ownerSetting);
}

/** GET /api/ps for one model: is it loaded, at what window, and does it fit in GPU memory? */
export interface OllamaResidency {
  loaded: boolean;
  contextLength?: number;
  sizeBytes?: number;
  vramBytes?: number;
  /** part of the model runs on the CPU */
  onCpu: boolean;
}

export async function ollamaResidency(baseUrl: string, model: string, fetchImpl: Fetch = fetch): Promise<OllamaResidency | null> {
  try {
    const res = await fetchImpl(`${baseUrl}/api/ps`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { models?: Array<{ name?: string; model?: string; size?: number; size_vram?: number; context_length?: number }> };
    const m = (body.models ?? []).find((x) => x.name === model || x.model === model);
    if (!m) return { loaded: false, onCpu: false };
    const size = positive(m.size);
    const vram = typeof m.size_vram === 'number' ? m.size_vram : undefined;
    return {
      loaded: true,
      ...(positive(m.context_length) ? { contextLength: positive(m.context_length) } : {}),
      ...(size ? { sizeBytes: size } : {}),
      ...(vram !== undefined ? { vramBytes: vram } : {}),
      onCpu: size !== undefined && vram !== undefined && vram < size,
    };
  } catch {
    return null;
  }
}

/** A valid owner setting, or undefined (Auto) */
export function validContextSetting(value: unknown): number | undefined {
  return typeof value === 'number' && (CONTEXT_WINDOW_OPTIONS as readonly number[]).includes(value) ? value : undefined;
}
