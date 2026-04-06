// M1.2: LLM Provider Interface
// @see docs/phases/phase-1.md

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

/**
 * Provider-agnostic LLM interface.
 * Implementations: OpenAI, Anthropic, Ollama (future).
 */
export interface LLMProvider {
  name: string;
  parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>>;
  parseImage<T>(input: ParseImageInput<T>): Promise<ParseResult<T>>;
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
