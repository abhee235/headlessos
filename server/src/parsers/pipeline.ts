// M1.3: Parsing Pipeline
// @see docs/phases/phase-1.md

import type { ZodSchema } from 'zod';
import stripAnsi from 'strip-ansi';
import { BaseService } from '../services/base-service.js';
import type { LLMProvider, ParseResult } from '../llm/provider.js';

export interface DeterministicParser<T = unknown> {
  name: string;
  /** Commands this parser handles (matched against the command string) */
  commands: string[];
  parse(rawOutput: string): T;
}

export interface PipelineResult<T> {
  data: T;
  parsedBy: 'deterministic' | 'llm';
  latencyMs: number;
  tokensUsed?: { input: number; output: number };
}

export class ParsingPipeline extends BaseService {
  private deterministicParsers = new Map<string, DeterministicParser>();
  private llmProvider: LLMProvider | null = null;

  protected async _init(): Promise<void> {
    // LLM provider will be set after LLM service initializes
  }

  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }

  registerParser(parser: DeterministicParser): void {
    for (const cmd of parser.commands) {
      this.deterministicParsers.set(cmd, parser);
    }
  }

  async parse<T>(command: string, rawOutput: string, schema: ZodSchema<T>): Promise<PipelineResult<T>> {
    const start = Date.now();

    // Step 1: Strip ANSI escape codes
    const cleaned = stripAnsi(rawOutput);

    // Step 2: Try deterministic parser
    const parser = this.findParser(command);
    if (parser) {
      try {
        const rawResult = parser.parse(cleaned);
        const validated = schema.parse(rawResult) as T;
        return {
          data: validated,
          parsedBy: 'deterministic',
          latencyMs: Date.now() - start,
        };
      } catch (detErr) {
        // Deterministic parser failed — fall through to LLM
        console.warn(`[Pipeline] Deterministic parser "${parser.name}" failed for "${command}":`, (detErr as Error).message);
      }
    }

    // Step 3: Fall back to LLM
    if (!this.llmProvider) {
      throw new Error('No LLM provider configured and no deterministic parser available');
    }

    const llmResult: ParseResult<T> = await this.llmProvider.parseText({
      rawOutput: cleaned,
      command,
      schema,
    });

    return {
      data: llmResult.data,
      parsedBy: 'llm',
      latencyMs: Date.now() - start,
      tokensUsed: llmResult.tokensUsed,
    };
  }

  private findParser(command: string): DeterministicParser | undefined {
    // Exact match first
    if (this.deterministicParsers.has(command)) {
      return this.deterministicParsers.get(command);
    }

    // Prefix match (e.g., "df -h" matches parser registered for "df")
    for (const [key, parser] of this.deterministicParsers.entries()) {
      if (command.startsWith(key)) {
        return parser;
      }
    }

    return undefined;
  }
}
