// EX9.3: Ollama provider — local models through the same LLMProvider interface
// EX10.1: num_ctx / num_predict from the model's limits, think: false on every request
// @see docs/phases/phase-ex9.md §8, docs/phases/phase-ex10.md §1, docs/DECISIONS.md (ADR-024, ADR-025)
//
// POST {baseUrl}/api/chat, stream: false. Tools are passed in the OpenAI function
// shape (Ollama accepts it); tool-call arguments come back as objects. A model that
// writes its tool call as text gets it executed when it names an offered tool.
// parseText uses Ollama's `format: <JSON schema>` structured output.

import { randomUUID } from 'node:crypto';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import type {
  ChatMessage,
  ChatWithToolsInput,
  ChatWithToolsResult,
  LLMProvider,
  ParseImageInput,
  ParseResult,
  ParseTextInput,
  ToolCall,
} from '../provider.js';
import { SYSTEM_PROMPT, buildTextPrompt } from '../provider.js';
import { extractProseToolCalls, parseToolArgs, repairJson } from '../../agent/loop/tool-input.js';
import { DEFAULT_LOCAL_WINDOW, recommendedMaxOutput, type ModelLimits } from '../model-limits.js';

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const REQUEST_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 5_000;

type Fetch = typeof fetch;

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  /** EX10.1: resolved by probeOllamaLimits(); num_ctx and num_predict come from it */
  limits?: ModelLimits;
  /** a fixed window when no limits were resolved (tests) */
  contextWindow?: number;
  timeoutMs?: number;
  fetch?: Fetch;
}

// ── URL rule ────────────────────────────────────────────

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\])$/i;

/**
 * Ollama URLs are http(s) with no credentials or path. A non-loopback host needs
 * `allowRemote`, because prompts and server output then leave this machine.
 */
export function checkOllamaUrl(input: string, allowRemote = false): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: 'Enter a URL like http://127.0.0.1:11434' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'Ollama URLs start with http:// or https://' };
  if (url.username || url.password) return { ok: false, error: 'Leave credentials out of the Ollama URL' };
  if (url.pathname !== '/' || url.search || url.hash) return { ok: false, error: 'Use the base URL only, e.g. http://127.0.0.1:11434' };
  if (!LOOPBACK.test(url.hostname) && !allowRemote) {
    return { ok: false, error: 'This Ollama is on another machine. Confirm that prompts and server output may be sent there.' };
  }
  return { ok: true, url: `${url.protocol}//${url.host}` };
}

// ── Probes ──────────────────────────────────────────────

export interface OllamaModelInfo {
  name: string;
  parameterSize?: string;
  family?: string;
  sizeBytes?: number;
}

/** Installed models (GET /api/tags). Throws when Ollama does not answer. */
export async function listOllamaModels(baseUrl: string, fetchImpl: Fetch = fetch): Promise<OllamaModelInfo[]> {
  const res = await fetchImpl(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  const body = (await res.json()) as { models?: Array<{ name?: string; size?: number; details?: { parameter_size?: string; family?: string } }> };
  return (body.models ?? [])
    .filter((m): m is { name: string; size?: number; details?: { parameter_size?: string; family?: string } } => typeof m.name === 'string')
    .map((m) => ({
      name: m.name,
      ...(m.details?.parameter_size ? { parameterSize: m.details.parameter_size } : {}),
      ...(m.details?.family ? { family: m.details.family } : {}),
      ...(typeof m.size === 'number' ? { sizeBytes: m.size } : {}),
    }));
}

// ── Provider ────────────────────────────────────────────

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  tool_name?: string;
}

interface OllamaChatResponse {
  model?: string;
  message?: { role?: string; content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly model: string;
  readonly baseUrl: string;
  readonly limits: ModelLimits;
  private readonly timeoutMs: number;
  private readonly fetchImpl: Fetch;
  /** EX10.1: this model rejected the `think` field once; stop sending it */
  private thinkUnsupported = false;

  constructor(opts: OllamaOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.model = opts.model;
    const window = opts.contextWindow ?? DEFAULT_LOCAL_WINDOW;
    this.limits = opts.limits ?? {
      contextWindow: window,
      source: opts.contextWindow ? 'owner' : 'default',
      maxOutputTokens: recommendedMaxOutput(window),
      local: true,
    };
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  get contextWindow(): number {
    return this.limits.contextWindow;
  }

  async parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    const start = Date.now();
    const messages: OllamaMessage[] = [
      { role: 'system', content: input.systemPrompt ?? SYSTEM_PROMPT },
      { role: 'user', content: input.userPrompt ?? buildTextPrompt(input.command, input.rawOutput, input.context) },
    ];
    const plainText = input.schema instanceof z.ZodString;
    const res = await this.chat({
      messages,
      ...(plainText ? {} : { format: jsonSchemaOf(input.schema) }),
      options: { temperature: 0 },
    });
    const content = (res.message?.content ?? '').trim();
    let value: unknown = content;
    if (!plainText) {
      try {
        value = JSON.parse(content);
      } catch {
        value = repairJson(content);
        if (value === undefined) throw new Error(`Ollama returned text that is not JSON: ${content.slice(0, 120)}`);
      }
    }
    return {
      data: input.schema.parse(value),
      tokensUsed: { input: res.prompt_eval_count ?? 0, output: res.eval_count ?? 0 },
      latencyMs: Date.now() - start,
      model: res.model ?? this.model,
    };
  }

  async parseImage<T>(input: ParseImageInput<T>): Promise<ParseResult<T>> {
    const start = Date.now();
    const res = await this.chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Parse this terminal screenshot of command: \`${input.command}\``, images: [input.imageBase64] },
      ],
      format: jsonSchemaOf(input.schema),
      options: { temperature: 0 },
    });
    const content = (res.message?.content ?? '').trim();
    let value: unknown;
    try { value = JSON.parse(content); } catch { value = repairJson(content); }
    return {
      data: input.schema.parse(value),
      tokensUsed: { input: res.prompt_eval_count ?? 0, output: res.eval_count ?? 0 },
      latencyMs: Date.now() - start,
      model: res.model ?? this.model,
    };
  }

  async chatWithTools(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
    const start = Date.now();
    const tools = input.tools ?? [];
    const offerTools = tools.length > 0 && input.tool_choice !== 'none';
    const res = await this.chat({
      messages: toOllamaMessages(input.messages),
      ...(offerTools ? { tools } : {}),
      options: { temperature: 0.2, ...(input.maxTokens ? { num_predict: input.maxTokens } : {}) },
    });

    const content = res.message?.content ?? '';
    let toolCalls: ToolCall[] = (res.message?.tool_calls ?? [])
      .filter((tc) => typeof tc.function?.name === 'string')
      .map((tc) => ({
        id: tc.id || `call_${randomUUID().slice(0, 8)}`,
        type: 'function' as const,
        function: { name: tc.function!.name!, arguments: JSON.stringify(parseToolArgs(tc.function!.arguments).input) },
      }));
    let text: string | null = content || null;
    // A model that wrote its call as text: run the first one it named
    if (toolCalls.length === 0 && offerTools) {
      const prose = extractProseToolCalls(content, tools.map((t) => t.function.name));
      if (prose.length > 0) {
        toolCalls = [{ id: `prose_${randomUUID().slice(0, 8)}`, type: 'function', function: { name: prose[0]!.name, arguments: JSON.stringify(prose[0]!.input) } }];
        text = null;
      }
    }

    return {
      message: { role: 'assistant', content: text, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
      tokensUsed: { input: res.prompt_eval_count ?? 0, output: res.eval_count ?? 0 },
      latencyMs: Date.now() - start,
      model: res.model ?? this.model,
      finishReason: toolCalls.length ? 'tool_calls' : res.done_reason === 'length' ? 'length' : 'stop',
    };
  }

  /**
   * EX10.1: every request runs at the model's one window (num_ctx), with the reply capped
   * (num_predict) and thinking off. A model that rejects `think` is asked again without it.
   */
  private async chat(body: { messages: OllamaMessage[]; tools?: unknown; format?: unknown; options?: Record<string, unknown> }): Promise<OllamaChatResponse> {
    const send = async (withThink: boolean): Promise<Response> => {
      try {
        return await this.fetchImpl(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            stream: false,
            ...(withThink ? { think: false } : {}),
            ...body,
            options: { num_ctx: this.limits.contextWindow, num_predict: this.limits.maxOutputTokens, ...body.options },
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        throw new Error(`Ollama is not reachable at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    let res = await send(!this.thinkUnsupported);
    if (!res.ok && res.status === 400 && !this.thinkUnsupported) {
      const detail = await res.clone().text().catch(() => '');
      if (/think/i.test(detail)) {
        this.thinkUnsupported = true;
        res = await send(false);
      }
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Ollama answered ${res.status}: ${detail.slice(0, 200)}`);
    }
    return (await res.json()) as OllamaChatResponse;
  }
}

/** OpenAI-shaped history → Ollama messages (tool results carry the tool's name). */
export function toOllamaMessages(messages: ChatMessage[]): OllamaMessage[] {
  const nameById = new Map<string, string>();
  return messages.map((m): OllamaMessage => {
    if (m.role === 'assistant') {
      for (const tc of m.tool_calls ?? []) nameById.set(tc.id, tc.function.name);
      return {
        role: 'assistant',
        content: m.content ?? '',
        ...(m.tool_calls?.length
          ? { tool_calls: m.tool_calls.map((tc) => ({ function: { name: tc.function.name, arguments: parseToolArgs(tc.function.arguments).input } })) }
          : {}),
      };
    }
    if (m.role === 'tool') {
      const name = m.tool_call_id ? nameById.get(m.tool_call_id) : undefined;
      return { role: 'tool', content: m.content ?? '', ...(name ? { tool_name: name } : {}) };
    }
    return { role: m.role, content: m.content ?? '' };
  });
}

function jsonSchemaOf(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { $refStrategy: 'none', target: 'jsonSchema7' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
