// FakeLLM Provider — Scripted LLM for pipeline testing
//
// Returns pre-defined responses from a queue, implementing the full
// LLMProvider interface. Used to test the agent pipeline end-to-end
// without real LLM calls.

import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  ParseTextInput,
  ParseImageInput,
  ParseResult,
  ChatWithToolsInput,
  ChatWithToolsResult,
} from '../provider.js';

// ── Scripted Scenario ──

/**
 * A pre-defined scenario that the FakeLLM will replay.
 * Responses are consumed in order — each call dequeues the next item.
 */
export interface FakeLLMScenario {
  /** Name of this scenario (for error messages) */
  name: string;
  /**
   * Queue of parseText responses.
   * Used by ModelRouter.reason() (Planner, Reflector) and ModelRouter.fast().
   * The `data` field should be the raw object — FakeLLM will validate it
   * against the provided Zod schema to catch schema drift.
   */
  parseTextResponses: Array<{
    data: unknown;
    model?: string;
    tokensUsed?: { input: number; output: number };
    latencyMs?: number;
  }>;
  /**
   * Queue of chatWithTools responses.
   * Used by ModelRouter.chat() (Executor tool-calling loop).
   */
  chatResponses: ChatWithToolsResult[];
}

// ── Call Tracking ──

export interface FakeLLMCallLog {
  parseTextCalls: Array<{ command: string; schema: string }>;
  chatCalls: Array<{ messageCount: number; toolCount: number }>;
}

// ── Helpers ──

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── FakeLLM Provider ──

export class FakeLLMProvider implements LLMProvider {
  readonly name = 'fake';
  readonly model: string;

  private scenario: FakeLLMScenario;
  private parseTextIndex = 0;
  private chatIndex = 0;
  private _callLog: FakeLLMCallLog = { parseTextCalls: [], chatCalls: [] };

  /**
   * When true, auto-resets when the queue is exhausted (for live server mode).
   * When false, throws on exhaustion (for tests).
   */
  looping: boolean;

  /**
   * When true, simulates realistic token-generation delay by sleeping
   * for the `latencyMs` specified in each scenario response.
   * Defaults to the value of `looping` (live server = delay, tests = instant).
   */
  simulateDelay: boolean;

  /**
   * Speed multiplier for simulated delays. 1.0 = real-time, 0.5 = 2x faster.
   * Useful for demo mode where you want visible but snappier delays.
   */
  delayMultiplier: number;

  constructor(
    scenario: FakeLLMScenario,
    model = 'fake-model',
    looping = false,
    opts?: { simulateDelay?: boolean; delayMultiplier?: number },
  ) {
    this.scenario = scenario;
    this.model = model;
    this.looping = looping;
    this.simulateDelay = opts?.simulateDelay ?? looping;
    this.delayMultiplier = opts?.delayMultiplier ?? 1.0;
  }

  // ── LLMProvider Interface ──

  async parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    const queue = this.scenario.parseTextResponses;

    // Auto-reset in looping mode when queue is exhausted
    if (this.parseTextIndex >= queue.length && this.looping) {
      console.log(`[FakeLLM] 🔄 Resetting parseText queue (looping mode)`);
      this.parseTextIndex = 0;
      this.chatIndex = 0;
    }

    const idx = this.parseTextIndex++;

    if (idx >= queue.length) {
      throw new Error(
        `FakeLLM [${this.scenario.name}]: parseText queue exhausted — ` +
        `expected ${queue.length} calls, got call #${idx + 1} ` +
        `(command: "${input.command}")`,
      );
    }

    const entry = queue[idx]!;

    // Track the call
    this._callLog.parseTextCalls.push({
      command: input.command,
      schema: (input.schema as ZodSchema).description ?? '(unnamed schema)',
    });

    // Validate against the provided Zod schema to catch drift
    const validated = (input.schema as ZodSchema<T>).parse(entry.data);

    // Simulate token generation delay
    const latency = entry.latencyMs ?? 50;
    if (this.simulateDelay && latency > 0) {
      const effectiveDelay = Math.round(latency * this.delayMultiplier);
      console.log(`[FakeLLM] ⏱️  parseText delay ${effectiveDelay}ms (command: "${input.command}")`);
      await sleep(effectiveDelay);
    }

    return {
      data: validated,
      tokensUsed: entry.tokensUsed ?? { input: 100, output: 200 },
      latencyMs: latency,
      model: entry.model ?? this.model,
    };
  }

  async parseImage<T>(_input: ParseImageInput<T>): Promise<ParseResult<T>> {
    throw new Error(
      `FakeLLM [${this.scenario.name}]: parseImage not supported in fake provider`,
    );
  }

  async chatWithTools(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
    const queue = this.scenario.chatResponses;

    // Auto-reset in looping mode when queue is exhausted
    if (this.chatIndex >= queue.length && this.looping) {
      console.log(`[FakeLLM] 🔄 Resetting chat queue (looping mode)`);
      this.parseTextIndex = 0;
      this.chatIndex = 0;
    }

    const idx = this.chatIndex++;

    if (idx >= queue.length) {
      throw new Error(
        `FakeLLM [${this.scenario.name}]: chatWithTools queue exhausted — ` +
        `expected ${queue.length} calls, got call #${idx + 1} ` +
        `(messages: ${input.messages.length})`,
      );
    }

    // Track the call
    this._callLog.chatCalls.push({
      messageCount: input.messages.length,
      toolCount: input.tools?.length ?? 0,
    });

    const entry = queue[idx]!;

    // Simulate token generation delay
    const latency = entry.latencyMs ?? 50;
    if (this.simulateDelay && latency > 0) {
      const effectiveDelay = Math.round(latency * this.delayMultiplier);
      const toolName = entry.message?.tool_calls?.[0]?.function?.name ?? 'chat';
      console.log(`[FakeLLM] ⏱️  chatWithTools delay ${effectiveDelay}ms (tool: "${toolName}")`);
      await sleep(effectiveDelay);
    }

    return entry;
  }

  // ── Inspection API ──

  /** Get the call log for assertions */
  get callLog(): FakeLLMCallLog {
    return this._callLog;
  }

  /** How many parseText responses remain unconsumed */
  get remainingParseTextCalls(): number {
    return this.scenario.parseTextResponses.length - this.parseTextIndex;
  }

  /** How many chat responses remain unconsumed */
  get remainingChatCalls(): number {
    return this.scenario.chatResponses.length - this.chatIndex;
  }

  /** True if all queued responses were consumed */
  get isExhausted(): boolean {
    return this.remainingParseTextCalls === 0 && this.remainingChatCalls === 0;
  }

  /** Reset to replay the scenario from scratch */
  reset(): void {
    this.parseTextIndex = 0;
    this.chatIndex = 0;
    this._callLog = { parseTextCalls: [], chatCalls: [] };
  }
}

// ── Factory: Create a mock ModelRouter from FakeLLMProvider ──

/**
 * Create a ModelRouter-shaped object backed by a FakeLLMProvider.
 * This uses the REAL ModelRouter method signatures but delegates to FakeLLM.
 *
 * Usage:
 *   const fake = new FakeLLMProvider(scenario);
 *   const router = createFakeModelRouter(fake);
 *   // Pass router to Planner, Executor, Reflector, UIAgent
 */
export function createFakeModelRouter(provider: FakeLLMProvider) {
  return {
    reason: <T>(input: ParseTextInput<T>) => provider.parseText(input),
    chat: (input: ChatWithToolsInput) => provider.chatWithTools(input),
    fast: <T>(input: ParseTextInput<T>) => provider.parseText(input),
    summarize: async (text: string) => provider.parseText({
      rawOutput: text,
      command: 'summarize',
      schema: { parse: (v: unknown) => v } as ZodSchema<string>,
    }),
    getModel: () => provider,
    getRoleConfig: () => ({ provider: 'fake', model: provider.model, maxTokens: 16384 }),
    getModelMap: () => ({
      reasoning: provider.model,
      'structured-output': provider.model,
      fast: provider.model,
      weak: provider.model,
    }),
    hasProvider: () => true,
    updateConfig: () => { /* no-op */ },
  };
}
