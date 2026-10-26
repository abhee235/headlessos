// M1.2: OpenAI LLM Provider Implementation
// @see docs/phases/phase-1.md

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type {
  LLMProvider,
  ParseTextInput,
  ParseImageInput,
  ParseResult,
  ChatWithToolsInput,
  ChatWithToolsResult,
  ChatMessage,
  ToolCall,
} from '../provider.js';
import { SYSTEM_PROMPT, buildTextPrompt } from '../provider.js';
import { hostedLimits, type ModelLimits } from '../model-limits.js';
import { jsonFromReply, jsonSchemaOf } from '../json-schema.js';
import type { ZodSchema } from 'zod';

/** EX8.20: default model for LLM parsing (Settings → AI) */
export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

/**
 * M14.2: how a schema's reply is asked for. With zod 4, OpenAI's helper refuses what strict
 * Structured Outputs cannot express: optional fields that are not also nullable, maps
 * (`z.record`), a root that is not an object. Those schemas are sent as a plain JSON schema
 * (strict: false); a non-object root (a summary string) gets plain text.
 */
export function textFormatFor(schema: ZodSchema, name = 'parsed_output'):
  | { kind: 'strict'; format: ReturnType<typeof zodTextFormat> }
  | { kind: 'json'; format: { type: 'json_schema'; name: string; schema: Record<string, unknown>; strict: false } }
  | { kind: 'text' } {
  try {
    return { kind: 'strict', format: zodTextFormat(schema, name) };
  } catch { /* not expressible in strict mode */ }
  const json = jsonSchemaOf(schema);
  if (json.type !== 'object') return { kind: 'text' };
  return { kind: 'json', format: { type: 'json_schema', name, schema: json, strict: false } };
}

/**
 * Extra Chat Completions params for a tool call. GPT-6 Luna is a reasoning model
 * whose Chat Completions function calling needs `reasoning_effort: 'none'`
 * (OpenAI model page). SDK 5.23 does not list 'none' yet, so it is cast.
 */
export function toolCallParams(model: string, hasTools: boolean): { reasoning_effort?: OpenAI.ReasoningEffort } {
  return hasTools && model.startsWith('gpt-6-luna')
    ? { reasoning_effort: 'none' as unknown as OpenAI.ReasoningEffort }
    : {};
}

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;
  model: string;

  constructor(apiKey: string, model = DEFAULT_OPENAI_MODEL, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey });
    this.model = model;
  }

  /** EX10.1: the window comes from the model-name table, capped at 128K */
  get limits(): ModelLimits {
    return hostedLimits(this.model);
  }

  get contextWindow(): number {
    return this.limits.contextWindow;
  }

  /** Same key (same client), another model: switching model in Settings keeps the key */
  withModel(model: string): OpenAIProvider {
    return new OpenAIProvider('', model, this.client);
  }

  async parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    const instructions = input.systemPrompt ?? SYSTEM_PROMPT;
    const userContent = input.userPrompt ?? buildTextPrompt(input.command, input.rawOutput, input.context);
    return this.parseWith(input.schema, instructions, [{ role: 'user' as const, content: userContent }], 'parsed output');
  }

  async parseImage<T>(input: ParseImageInput<T>): Promise<ParseResult<T>> {
    return this.parseWith(input.schema, SYSTEM_PROMPT, [
      {
        role: 'user' as const,
        content: [
          {
            type: 'input_image' as const,
            image_url: `data:image/png;base64,${input.imageBase64}`,
            detail: 'auto' as const,
          },
          {
            type: 'input_text' as const,
            text: `Parse this terminal screenshot of command: \`${input.command}\``,
          },
        ],
      },
    ], 'parsed output for image');
  }

  /**
   * M14.2: one parse, in the format the schema allows (see textFormatFor). Every reply is
   * checked with Zod, so a non-strict reply that drifts from the schema is caught here.
   */
  private async parseWith<T>(schema: ZodSchema<T>, instructions: string, input: OpenAI.Responses.ResponseInput, what: string): Promise<ParseResult<T>> {
    const start = Date.now();
    const tf = textFormatFor(schema);
    let value: unknown;
    let usage: OpenAI.Responses.ResponseUsage | undefined;
    if (tf.kind === 'strict') {
      const response = await this.client.responses.parse({ model: this.model, instructions, input, text: { format: tf.format } });
      if (!response.output_parsed) throw new Error(`OpenAI returned no ${what}`);
      value = response.output_parsed;
      usage = response.usage;
    } else {
      const response = await this.client.responses.create({ model: this.model, instructions, input, ...(tf.kind === 'json' ? { text: { format: tf.format } } : {}) });
      const text = response.output_text ?? '';
      if (!text.trim()) throw new Error(`OpenAI returned no ${what}`);
      value = tf.kind === 'json' ? jsonFromReply(text, 'OpenAI') : text.trim();
      usage = response.usage;
    }
    return {
      data: schema.parse(value),
      tokensUsed: { input: usage?.input_tokens ?? 0, output: usage?.output_tokens ?? 0 },
      latencyMs: Date.now() - start,
      model: this.model,
    };
  }

  /**
   * Chat completion with native function calling (EX2.1).
   * Uses the Chat Completions API for tool-calling loops.
   */
  async chatWithTools(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
    const start = Date.now();

    // Build OpenAI-compatible message objects directly
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = input.messages.map(msg => {
      if (msg.role === 'system') {
        return { role: 'system' as const, content: msg.content ?? '' };
      }
      if (msg.role === 'user') {
        return { role: 'user' as const, content: msg.content ?? '' };
      }
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content ?? '',
          tool_call_id: msg.tool_call_id ?? '',
        };
      }
      // assistant
      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: 'assistant' as const,
        content: msg.content,
      };
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        assistantMsg.tool_calls = msg.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }));
      }
      return assistantMsg;
    });

    const hasTools = !!input.tools && input.tools.length > 0;
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      ...(hasTools ? {
        tools: input.tools as OpenAI.Chat.Completions.ChatCompletionTool[],
        tool_choice: input.tool_choice ?? 'auto',
      } : {}),
      ...toolCallParams(this.model, hasTools),
      // max_tokens is deprecated and rejected by reasoning models; this works for all
      ...(input.maxTokens ? { max_completion_tokens: input.maxTokens } : {}),
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('OpenAI returned no choices');
    }

    // Convert tool_calls from OpenAI format to our format
    const toolCalls: ToolCall[] | undefined = choice.message.tool_calls
      ?.filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
        tc.type === 'function')
      .map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));

    const resultMessage: ChatMessage = {
      role: 'assistant',
      content: choice.message.content,
      ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };

    return {
      message: resultMessage,
      tokensUsed: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
      },
      latencyMs: Date.now() - start,
      model: this.model,
      finishReason: (choice.finish_reason as ChatWithToolsResult['finishReason']) ?? 'stop',
    };
  }
}
