// EX11.1: Anthropic provider — Claude through Anthropic's own SDK
// @see docs/phases/phase-ex11.md §1, docs/DECISIONS.md (ADR-027)
//
// The agents keep their OpenAI-shaped history; this file translates it at the edge.
// What is Claude's own:
//  · Current models always think. The reply's blocks, signed thinking included, ride on the
//    assistant ChatMessage (`reasoning`) and go back unchanged, in their places. The agents
//    edit their history (compaction, collapsed views, notes on results), so every request
//    asks the API to drop thinking that no longer matches instead of refusing (`drop_block`).
//  · Effort, not budgets: medium for agent turns, low for parsing. The reply cap gets room
//    for the thinking on top.
//  · Prompt caching: a mark on the system prompt, and one that moves to each request's end.
//  · Parsing asks for JSON in words, with the schema in the system prompt: structured
//    outputs' schema subset may not cover the view and planner schemas.
//  · Every request streams, so a long reply cannot time out, and is read whole.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
  ChatCompletionTool,
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
import { parseToolArgs, repairJson } from '../../agent/loop/tool-input.js';
import { hostedLimits, type ModelLimits } from '../model-limits.js';

type WireMessage = Anthropic.Beta.Messages.BetaMessageParam;
type WireBlock = Anthropic.Beta.Messages.BetaContentBlockParam;
type WireTool = Anthropic.Beta.Messages.BetaTool;
type WireReply = Anthropic.Beta.Messages.BetaMessage;
type StreamParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Effort = 'low' | 'medium';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
/** EX11.2: the default in Settings → AI — the fastest and cheapest current model */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';
/** EX11.2: the models Settings → AI offers */
export const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', description: 'Default — fastest, lowest cost, $0.10 / $0.50 per 1M tokens', recommended: true },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', description: 'Faster than Opus, strong at agent work, $2 / $10 per 1M tokens' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', description: 'Most capable, highest cost, $4 / $20 per 1M tokens' },
];

/** the most a current Claude model writes in one reply */
const OUTPUT_MAX = 128_000;
/** room for the thinking on top of the reply cap, by effort */
const THINKING_ROOM: Record<Effort, number> = { low: 8_192, medium: 16_384 };
/** five minutes: an agent run's steps follow each other within seconds */
const CACHE = { type: 'ephemeral' as const };
const BETA_BINDING = 'thinking-binding-controls-2026-08-01';
const BETA_FALLBACK = 'server-side-fallback-2026-07-01';
/** models whose declined requests another Claude model can finish; Haiku 5.5 has no fallback */
const FALLS_BACK = /^claude-(?:opus-5-5|opus-5|sonnet-5-5|fable-5-1)$/;
/** reply blocks that go back with the reply; server-tool blocks never occur (no server tools) */
const KEPT = new Set(['thinking', 'redacted_thinking', 'text', 'tool_use', 'fallback']);

/** A reply block as returned, kept untyped so it goes back exactly as it came */
type Kept = { type: string; [key: string]: unknown };

/** A Claude model id's generation (`claude-haiku-5-5` → 5.5), or undefined for older naming */
export function claudeVersion(model: string): { major: number; minor: number } | undefined {
  const m = /claude-[a-z]+-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(model);
  return m ? { major: Number(m[1]), minor: Number(m[2] ?? 0) } : undefined;
}

/** Claude 4.6 and later think adaptively, steered by effort; older ones take a budget or none */
export function thinksAdaptively(model: string): boolean {
  const v = claudeVersion(model);
  return !!v && (v.major > 4 || (v.major === 4 && v.minor >= 6));
}

// ── History → Messages API ──────────────────────────────

const lastFallbackIn = (blocks: Kept[]) => blocks.reduce((at, b, i) => (b.type === 'fallback' ? i : at), -1);
const joinText = (blocks: Kept[]) => blocks.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('');
const argsOf = (tc: ToolCall) => parseToolArgs(tc.function.arguments).input as Record<string, unknown>;
const useOf = (tc: ToolCall): WireBlock => ({ type: 'tool_use', id: tc.id, name: tc.function.name, input: argsOf(tc) });

/**
 * An assistant message's blocks. A Claude reply goes back as it came: thinking and fallback
 * blocks verbatim and in place; its text and calls verbatim unless the agents changed them
 * (a collapsed view, a dropped call), then rebuilt from the message. Calls made before a
 * fallback switch never ran and are left out. Exported for testing.
 */
export function assistantBlocks(m: ChatMessage): WireBlock[] {
  const text = m.content ?? '';
  const calls = m.tool_calls ?? [];
  const stored = m.reasoning?.provider === 'anthropic' && Array.isArray(m.reasoning.blocks) ? (m.reasoning.blocks as Kept[]) : null;
  if (!stored) return [...(text.trim() ? [{ type: 'text' as const, text }] : []), ...calls.map(useOf)];

  const cut = lastFallbackIn(stored);
  const sameText = text === joinText(stored.slice(cut + 1));
  const byId = new Map(calls.map((tc) => [tc.id, tc]));
  const placed = new Set<string>();
  const out: WireBlock[] = [];
  let answerText = false;
  stored.forEach((b, i) => {
    if (b.type === 'thinking' || b.type === 'redacted_thinking' || b.type === 'fallback') {
      out.push(b as unknown as WireBlock);
    } else if (i <= cut) {
      if (b.type === 'text') out.push(b as unknown as WireBlock); // the declined model's words
    } else if (b.type === 'text') {
      if (sameText) out.push(b as unknown as WireBlock);
      else if (!answerText && text.trim()) out.push({ type: 'text', text });
      answerText = true;
    } else {
      const tc = byId.get(String(b.id));
      if (!tc) return; // the agents dropped this call
      placed.add(tc.id);
      out.push(JSON.stringify(b.input ?? {}) === tc.function.arguments ? (b as unknown as WireBlock) : useOf(tc));
    }
  });
  if (!sameText && !answerText && text.trim()) {
    const at = out.findIndex((b) => b.type === 'tool_use');
    out.splice(at < 0 ? out.length : at, 0, { type: 'text', text });
  }
  for (const tc of calls) if (!placed.has(tc.id)) out.push(useOf(tc));
  return out;
}

/** A result for a call that has none in the history */
const notRun = (id: string): WireBlock => ({ type: 'tool_result', tool_use_id: id, content: 'Not run.', is_error: true });

/**
 * The agents' history → Claude's. Leading system messages become the top-level system.
 * Each call is answered in the user message right after it: results lead, in order, then
 * any text. A call without its result gets one saying it did not run; a result whose call
 * is gone (compacted away) is left out. Either, sent as it stands, is a 400. Exported for testing.
 */
export function toAnthropicMessages(history: ChatMessage[]): { system: string; messages: WireMessage[] } {
  const system: string[] = [];
  const out: WireMessage[] = [];
  let open: string[] = []; // the last assistant turn's calls
  let answered = new Set<string>();
  let results: WireBlock[] = [];
  let rest: WireBlock[] = [];
  const flush = () => {
    const content = [...results, ...open.filter((id) => !answered.has(id)).map(notRun), ...rest];
    if (content.length) out.push({ role: 'user', content });
    open = [];
    answered = new Set();
    results = [];
    rest = [];
  };
  for (const m of history) {
    if (m.role === 'system' && out.length === 0 && rest.length === 0) {
      if (m.content?.trim()) system.push(m.content);
    } else if (m.role === 'assistant') {
      const content = assistantBlocks(m);
      // thinking alone is not a turn the API takes
      if (!content.some((b) => b.type === 'text' || b.type === 'tool_use')) continue;
      flush();
      out.push({ role: 'assistant', content });
      open = content.flatMap((b) => (b.type === 'tool_use' ? [b.id] : []));
    } else if (m.role === 'tool') {
      const id = m.tool_call_id ?? '';
      if (!open.includes(id) || answered.has(id)) continue;
      answered.add(id);
      results.push({ type: 'tool_result', tool_use_id: id, ...(m.content ? { content: m.content } : {}) });
    } else if (m.content?.trim()) {
      rest.push({ type: 'text', text: m.content });
    }
  }
  flush();
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '(The conversation so far.)' });
  // a trailing assistant turn would be a prefill, which current models refuse
  if (out.at(-1)?.role === 'assistant') out.push({ role: 'user', content: 'Continue.' });
  return { system: system.join('\n\n'), messages: out };
}

/** OpenAI function tools → Claude's. Arguments stream as they are written; the tools check them. */
export function toAnthropicTools(tools?: ChatCompletionTool[]): WireTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => {
    const { $schema: _dialect, ...schema } = (t.function.parameters ?? {}) as Record<string, unknown>;
    return {
      name: t.function.name,
      description: t.function.description,
      input_schema: { ...schema, type: 'object' } as WireTool['input_schema'],
      eager_input_streaming: true,
    };
  });
}

interface Send {
  system: string;
  messages: WireMessage[];
  tools?: WireTool[];
  toolChoice?: 'auto' | 'none';
  /** the reply's own cap; thinking gets room on top */
  cap: number;
  effort: Effort;
}

/** One request. Exported for testing. */
export function anthropicRequest(model: string, s: Send): StreamParams {
  const betas: string[] = [];
  const body: StreamParams = { model, max_tokens: s.cap, messages: s.messages, cache_control: CACHE };
  if (s.system) body.system = [{ type: 'text', text: s.system, cache_control: CACHE }];
  if (s.tools?.length) {
    body.tools = s.tools;
    // 'none' keeps the tools on the request, so the list (and the cache) stays the same
    body.tool_choice = s.toolChoice === 'none' ? { type: 'none' } : { type: 'auto' };
  }
  if (thinksAdaptively(model)) {
    betas.push(BETA_BINDING);
    body.thinking = { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } };
    body.output_config = { effort: s.effort };
    body.max_tokens = Math.min(s.cap + THINKING_ROOM[s.effort], OUTPUT_MAX);
  }
  if (FALLS_BACK.test(model)) {
    body.fallbacks = 'default';
    betas.push(BETA_FALLBACK);
  }
  if (betas.length) body.betas = betas;
  return body;
}

// ── Reply → agents ──────────────────────────────────────

const safetyCheck = (category: string | null | undefined) => (category ? ` (its safety check: ${category})` : '');

/** The words a declined reply ends with, so the owner sees why it stopped */
function declined(category: string | null | undefined): string {
  return `\n\nClaude declined to go on with this${safetyCheck(category)}.`;
}

/**
 * Claude's reply → the agents' assistant message. Calls are passed on only when whole: a
 * call cut off by the cap, or in a declined reply, is dropped. Exported for testing.
 */
export function fromAnthropicReply(reply: Pick<WireReply, 'content' | 'stop_reason' | 'stop_details'>): {
  message: ChatMessage;
  finishReason: ChatWithToolsResult['finishReason'];
} {
  const stop = reply.stop_reason;
  const cutOff = stop === 'max_tokens' || stop === 'model_context_window_exceeded';
  let blocks = (reply.content as unknown as Kept[]).filter((b) => KEPT.has(b.type));
  let note = '';
  if (stop === 'refusal') {
    blocks = blocks.filter((b) => b.type !== 'tool_use');
    note = declined(reply.stop_details?.category);
  } else if (cutOff && blocks.at(-1)?.type === 'tool_use') {
    blocks = blocks.slice(0, -1);
  }
  const answer = blocks.slice(lastFallbackIn(blocks) + 1);
  const text = joinText(answer) + note;
  const calls: ToolCall[] = answer
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: String(b.id), type: 'function' as const, function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
  return {
    message: {
      role: 'assistant',
      content: text.trim() ? text : null,
      ...(calls.length ? { tool_calls: calls } : {}),
      reasoning: { provider: 'anthropic', blocks },
    },
    finishReason: stop === 'refusal' ? 'content_filter' : cutOff ? 'length' : calls.length ? 'tool_calls' : 'stop',
  };
}

/** The whole prompt (uncached + written to the cache + read from it), as the context manager counts it */
export function usageOf(reply: Pick<WireReply, 'usage'>): { input: number; output: number } {
  const u = reply.usage;
  return {
    input: (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0),
    output: u?.output_tokens ?? 0,
  };
}

/**
 * An SDK error in words the owner can act on. "prompt is too long" keeps its words, so the
 * context manager's overflow path compacts and tries again. The SDK has already retried
 * 408/409/429/5xx and dropped connections.
 */
export function anthropicError(model: string, err: unknown): unknown {
  if (err instanceof Anthropic.APIUserAbortError || !(err instanceof Anthropic.APIError)) return err;
  if (err instanceof Anthropic.APIConnectionError) return new Error(`Could not reach Anthropic: ${err.message}`);
  const body = (err.error as { error?: { type?: unknown; message?: unknown } } | undefined)?.error;
  const words = typeof body?.message === 'string' ? body.message : err.message;
  if (err.status === 401) return new Error('Anthropic rejected the API key (401). Enter a valid key in Settings → AI.');
  if (err.status === 403) return new Error(`This Anthropic key is not allowed to use ${model} (403): ${words}`);
  if (err.status === 404) return new Error(`${model} is not available to this Anthropic key (404): ${words}`);
  if (err.status === 429) return new Error(`Anthropic rate limit reached for ${model} (429): ${words}`);
  if (err.status === 529 || body?.type === 'overloaded_error') return new Error(`Anthropic is overloaded (529): ${words}`);
  return new Error(`Anthropic answered ${err.status ?? 'with an error'}: ${words}`);
}

// ── Parsing ─────────────────────────────────────────────

function jsonSchemaOf(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { $refStrategy: 'none', target: 'jsonSchema7' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function jsonRule(schema: z.ZodTypeAny): string {
  return `Reply with one JSON value that matches this JSON Schema, and nothing else: no prose, no code fences.\n${JSON.stringify(jsonSchemaOf(schema))}`;
}

/** The reply's JSON value: fences stripped, broken JSON repaired as for Ollama. Exported for testing. */
export function jsonValue(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch { /* repaired below */ }
  const repaired = repairJson(t);
  if (repaired !== undefined) return repaired;
  throw new Error(`Claude returned text that is not JSON: ${t.slice(0, 120)}`);
}

// ── Provider ────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model = DEFAULT_ANTHROPIC_MODEL, client?: Anthropic) {
    this.model = model;
    // the key and address as given, never ANTHROPIC_* from the environment; the SDK retries twice
    this.client = client ?? new Anthropic({ apiKey, authToken: null, baseURL: ANTHROPIC_BASE_URL, maxRetries: 2 });
  }

  /** EX10.1: the window comes from the model-name table, capped at 128K */
  get limits(): ModelLimits {
    return hostedLimits(this.model);
  }

  get contextWindow(): number {
    return this.limits.contextWindow;
  }

  /** Same key (same client), another model */
  withModel(model: string): AnthropicProvider {
    return new AnthropicProvider('', model, this.client);
  }

  /** EX11.2: does the key work, and may it use this model? Throws in the owner's words. */
  async checkModel(): Promise<void> {
    try {
      await this.client.models.retrieve(this.model, {}, { timeout: 10_000, maxRetries: 1 });
    } catch (err) {
      throw anthropicError(this.model, err);
    }
  }

  async parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    const start = Date.now();
    const plain = input.schema instanceof z.ZodString;
    const reply = await this.send({
      system: [input.systemPrompt ?? SYSTEM_PROMPT, ...(plain ? [] : [jsonRule(input.schema)])].join('\n\n'),
      messages: [{ role: 'user', content: input.userPrompt ?? buildTextPrompt(input.command, input.rawOutput, input.context) }],
      cap: this.limits.maxOutputTokens,
      effort: 'low',
    });
    return this.parsed(input.schema, reply, plain, start);
  }

  async parseImage<T>(input: ParseImageInput<T>): Promise<ParseResult<T>> {
    const start = Date.now();
    const reply = await this.send({
      system: `${SYSTEM_PROMPT}\n\n${jsonRule(input.schema)}`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: input.imageBase64 } },
          { type: 'text', text: `Parse this terminal screenshot of command: \`${input.command}\`` },
        ],
      }],
      cap: this.limits.maxOutputTokens,
      effort: 'low',
    });
    return this.parsed(input.schema, reply, false, start);
  }

  async chatWithTools(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
    const start = Date.now();
    const { system, messages } = toAnthropicMessages(input.messages);
    const reply = await this.send({
      system,
      messages,
      tools: toAnthropicTools(input.tools),
      toolChoice: input.tool_choice === 'none' ? 'none' : 'auto',
      cap: input.maxTokens ?? this.limits.maxOutputTokens,
      effort: 'medium',
    });
    const { message, finishReason } = fromAnthropicReply(reply);
    return { message, tokensUsed: usageOf(reply), latencyMs: Date.now() - start, model: reply.model || this.model, finishReason };
  }

  private parsed<T>(schema: z.ZodType<T>, reply: WireReply, plain: boolean, start: number): ParseResult<T> {
    if (reply.stop_reason === 'refusal') throw new Error(`Claude declined to parse this${safetyCheck(reply.stop_details?.category)}.`);
    const text = joinText((reply.content as unknown as Kept[]).filter((b) => b.type === 'text'));
    const value = plain ? text.trim() : jsonValue(text);
    return { data: schema.parse(value), tokensUsed: usageOf(reply), latencyMs: Date.now() - start, model: reply.model || this.model };
  }

  /** One request, streamed (a long reply cannot time out) and read whole */
  private async send(s: Send): Promise<WireReply> {
    try {
      return await this.client.beta.messages.stream(anthropicRequest(this.model, s)).finalMessage();
    } catch (err) {
      throw anthropicError(this.model, err);
    }
  }
}
