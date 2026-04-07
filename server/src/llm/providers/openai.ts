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

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;
  model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    const start = Date.now();

    const instructions = input.systemPrompt ?? SYSTEM_PROMPT;
    const userContent = input.userPrompt ?? buildTextPrompt(input.command, input.rawOutput, input.context);

    const response = await this.client.responses.parse({
      model: this.model,
      instructions,
      input: [
        {
          role: 'user' as const,
          content: userContent,
        },
      ],
      text: {
        format: zodTextFormat(input.schema, 'parsed_output'),
      },
    });

    const output = response.output_parsed;
    if (!output) {
      throw new Error('OpenAI returned no parsed output');
    }

    // Validate with Zod as a safety net
    const validated = input.schema.parse(output) as T;

    return {
      data: validated,
      tokensUsed: {
        input: response.usage?.input_tokens ?? 0,
        output: response.usage?.output_tokens ?? 0,
      },
      latencyMs: Date.now() - start,
      model: this.model,
    };
  }

  async parseImage<T>(input: ParseImageInput<T>): Promise<ParseResult<T>> {
    const start = Date.now();

    const response = await this.client.responses.parse({
      model: this.model,
      instructions: SYSTEM_PROMPT,
      input: [
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
      ],
      text: {
        format: zodTextFormat(input.schema, 'parsed_output'),
      },
    });

    const output = response.output_parsed;
    if (!output) {
      throw new Error('OpenAI returned no parsed output for image');
    }

    const validated = input.schema.parse(output) as T;

    return {
      data: validated,
      tokensUsed: {
        input: response.usage?.input_tokens ?? 0,
        output: response.usage?.output_tokens ?? 0,
      },
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

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      ...(input.tools && input.tools.length > 0 ? {
        tools: input.tools as OpenAI.Chat.Completions.ChatCompletionTool[],
        tool_choice: input.tool_choice ?? 'auto',
      } : {}),
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
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
