// M1.2: LLM Provider Interface
// @see docs/phases/phase-1.md

import type { ModelLimits } from './model-limits.js';
import type { ZodSchema } from 'zod';

export interface ParseTextInput<T> {
  rawOutput: string;
  command: string;
  schema: ZodSchema<T>;
  context?: string;       // retry context (e.g., Zod error message from previous attempt)
  systemPrompt?: string;  // override the default system prompt (e.g., for agent mode)
  userPrompt?: string;    // override the default user prompt (e.g., for agent mode)
}

export interface ParseImageInput<T> {
  imageBase64: string;
  command: string;
  schema: ZodSchema<T>;
  context?: string;
}

export interface ParseResult<T> {
  data: T;
  tokensUsed: { input: number; output: number };
  latencyMs: number;
  model: string;
}

// ── Chat with Tools types (EX2.1) ──

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** EX11.1: the provider's own record of this reply, sent back by that provider only */
  reasoning?: ProviderReasoning;
}

/**
 * EX11.1: what a provider must get back with its reply. Claude: the reply's content
 * blocks in order, with its signed thinking, which goes back unchanged (ADR-027).
 */
export interface ProviderReasoning {
  provider: string;
  blocks: unknown[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

export interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
}

export interface ChatWithToolsInput {
  messages: ChatMessage[];
  tools?: ChatCompletionTool[];
  tool_choice?: 'auto' | 'none' | 'required';
  maxTokens?: number;
}

export interface ChatWithToolsResult {
  message: ChatMessage;
  tokensUsed: { input: number; output: number };
  latencyMs: number;
  model: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

/**
 * Provider-agnostic LLM interface.
 * Implementations: OpenAI, Ollama (EX9.3), Anthropic (EX11.1).
 */
export interface LLMProvider {
  name: string;
  model: string;
  /** EX9.3: tokens the model can see per request (local models: num_ctx); sizes the tool list */
  contextWindow?: number;
  /** EX10.1: the window and reply cap every budget is planned from, and where they came from */
  limits?: ModelLimits;
  parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>>;
  parseImage<T>(input: ParseImageInput<T>): Promise<ParseResult<T>>;

  /**
   * Chat completion with native function calling support.
   * Used by the Reactive Executor (EX2.5) for tool-calling loops.
   * Optional — not all providers/models support function calling.
   */
  chatWithTools?(input: ChatWithToolsInput): Promise<ChatWithToolsResult>;
}

export const SYSTEM_PROMPT = `You are a Linux terminal output parser. You receive raw command output and parse it into structured JSON matching the provided schema.

Rules:
- Extract data precisely from the output — do not invent or assume values
- Numbers should be actual numbers, not strings (unless the schema specifies string)
- If a field cannot be determined from the output, use a sensible default (empty string, 0, etc.)
- For percentages, extract the numeric value without the % sign
- Dates/times should be in ISO 8601 format when possible
- Handle edge cases: empty output, error messages, partial output`;

export function buildTextPrompt(command: string, rawOutput: string, context?: string): string {
  let prompt = `Parse this Linux command output into the specified JSON structure.

Command: \`${command}\`

Output:
\`\`\`
${rawOutput}
\`\`\``;

  if (context) {
    prompt += `\n\nPrevious attempt failed validation. Error context:\n${context}\n\nPlease fix the output to match the schema exactly.`;
  }

  return prompt;
}

/**
 * EX10.1 follow-up: the provider gave up waiting — no first token in time, or the reply
 * stopped arriving. Not a connection failure and not an HTTP error: agent loops treat it
 * like a reply cut off at the output limit (ask for a smaller step).
 * EX10.13: `alive: false` — the backend did not answer a status check either, so asking
 * again would only wait again; loops end the run.
 */
export class LLMTimeoutError extends Error {
  override readonly name = 'LLMTimeoutError';
  constructor(
    message: string,
    readonly phase: 'first-token' | 'idle',
    /** chunks (about one token each) received before it stopped */
    readonly received = 0,
    /** EX10.13: false when a status check got no answer; undefined when none was made */
    readonly alive?: boolean,
  ) {
    super(message);
  }
}

/** By name, so it survives being re-thrown across module copies */
export function isLLMTimeout(err: unknown): err is LLMTimeoutError {
  return err instanceof Error && err.name === 'LLMTimeoutError';
}

/**
 * EX10.13: the reply broke down into one or two characters repeated, and was cut off
 * while streaming. Loops discard it and ask again.
 */
export class LLMDegenerateError extends Error {
  override readonly name = 'LLMDegenerateError';
  constructor(
    message: string,
    /** characters of text received before it was cut off */
    readonly received: number,
  ) {
    super(message);
  }
}

export function isLLMDegenerate(err: unknown): err is LLMDegenerateError {
  return err instanceof Error && err.name === 'LLMDegenerateError';
}

/**
 * EX10.13 follow-up: the backend closed the reply before it was finished, again after one
 * retry as is. Loops treat it like a garbled reply: discard it, ask again with a note.
 */
export class LLMIncompleteError extends Error {
  override readonly name = 'LLMIncompleteError';
  constructor(
    message: string,
    /** chunks received before it ended */
    readonly received: number,
  ) {
    super(message);
  }
}

export function isLLMIncomplete(err: unknown): err is LLMIncompleteError {
  return err instanceof Error && err.name === 'LLMIncompleteError';
}

/** EX10.13 follow-up: a reply the loops discard and ask again for — garbled, or ended unfinished */
export function isUnusableReply(err: unknown): err is LLMDegenerateError | LLMIncompleteError {
  return isLLMDegenerate(err) || isLLMIncomplete(err);
}
