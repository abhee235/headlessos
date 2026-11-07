// M1.3: Parsing Pipeline
// @see docs/phases/phase-1.md
// M4.7: Integrated with OutputCache for hash-based caching

import type { ZodSchema } from 'zod';
import stripAnsi from 'strip-ansi';
import { BaseService } from '../services/base-service.js';
import type { LLMProvider, ParseResult } from '../llm/provider.js';
import type { OutputCache } from '../cache/output-cache.js';
import type { LLMUsageTracker } from '../llm/usage-tracker.js';
import { redactSecrets } from '../agent/actions/redact.js';

export interface DeterministicParser<T = unknown> {
  name: string;
  /** Commands this parser handles (matched against the command string) */
  commands: string[];
  parse(rawOutput: string): T;
}

export interface PipelineResult<T> {
  data: T;
  parsedBy: 'deterministic' | 'llm' | 'cache';
  latencyMs: number;
  tokensUsed?: { input: number; output: number };
  model?: string;
}

export class ParsingPipeline extends BaseService {
  private deterministicParsers = new Map<string, DeterministicParser>();
  private llmProvider: LLMProvider | null = null;
  private outputCache: OutputCache | null = null;
  private usageTracker: LLMUsageTracker | null = null;

  protected async _init(): Promise<void> {
    // LLM provider and cache will be set after their services initialize
  }

  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }

  setCache(cache: OutputCache): void {
    this.outputCache = cache;
  }

  setUsageTracker(tracker: LLMUsageTracker): void {
    this.usageTracker = tracker;
  }

  registerParser(parser: DeterministicParser): void {
    for (const cmd of parser.commands) {
      this.deterministicParsers.set(cmd, parser);
    }
  }

  async parse<T>(command: string, rawOutput: string, schema: ZodSchema<T>, serverId?: string): Promise<PipelineResult<T>> {
    const start = Date.now();

    // Step 0: Check cache (if serverId provided)
    if (serverId && this.outputCache) {
      const cached = this.outputCache.get<T>(serverId, command, rawOutput);
      if (cached !== null) {
        return {
          data: cached,
          parsedBy: 'cache',
          latencyMs: Date.now() - start,
        };
      }
    }

    // Step 1: Strip ANSI escape codes
    const cleaned = stripAnsi(rawOutput);

    // Step 2: Try deterministic parser
    const parser = this.findParser(command);
    if (parser) {
      try {
        const rawResult = parser.parse(cleaned);
        const validated = schema.parse(rawResult) as T;

        // Cache the result
        if (serverId && this.outputCache) {
          this.outputCache.set(serverId, command, rawOutput, validated);
        }

        return {
          data: validated,
          parsedBy: 'deterministic',
          latencyMs: Date.now() - start,
        };
      } catch {
        // Deterministic parser failed — fall through to LLM
        // M16.12: no command or message here. Either can hold a path, a name or a password.
        console.warn(`[Pipeline] Deterministic parser "${parser.name}" failed, so trying the model`);
      }
    }

    // Step 3: Fall back to LLM
    if (!this.llmProvider) {
      throw new Error('No LLM provider configured and no deterministic parser available');
    }

    const llmResult: ParseResult<T> = await this.llmProvider.parseText({
      // M15.13: server output can hold secrets, and this goes to the model provider
      rawOutput: redactSecrets(cleaned).text,
      command,
      schema,
    });

    // Cache the LLM result
    if (serverId && this.outputCache) {
      this.outputCache.set(serverId, command, rawOutput, llmResult.data);
    }

    // Track LLM usage
    if (this.usageTracker) {
      this.usageTracker.recordCall({
        command,
        model: llmResult.model,
        inputTokens: llmResult.tokensUsed.input,
        outputTokens: llmResult.tokensUsed.output,
        latencyMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      data: llmResult.data,
      parsedBy: 'llm',
      latencyMs: Date.now() - start,
      tokensUsed: llmResult.tokensUsed,
      model: llmResult.model,
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
