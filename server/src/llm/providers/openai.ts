// M1.2: OpenAI LLM Provider Implementation
// @see docs/phases/phase-1.md

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { LLMProvider, ParseTextInput, ParseImageInput, ParseResult } from '../provider.js';
import { SYSTEM_PROMPT, buildTextPrompt } from '../provider.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    const start = Date.now();

    const response = await this.client.responses.parse({
      model: this.model,
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: 'user' as const,
          content: buildTextPrompt(input.command, input.rawOutput, input.context),
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
}
