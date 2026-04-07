// EX2.10: Error Recovery Strategies
// @see docs/phases/phase-ex2.md — EX2.10
//
// Provides typed error classification, recovery strategies per error type,
// exponential backoff with announcement, typed error context for LLM self-correction,
// and context overflow compaction trigger.
//
// Key patterns (from research):
// - Roo Code: exponential backoff with countdown events
// - Aider: typed error context with actualData/didYouMean
// - Continue: context overflow triggers compaction
// - All: graceful degradation — always return something useful

import type { ModelRole } from '../config/models.js';
import type { AgentEvent } from './executor.js';

// ── Error Types ──

export type ErrorType =
  | 'zod_validation_failed'
  | 'ssh_command_failed'
  | 'llm_call_failed'
  | 'llm_rate_limited'
  | 'tool_blocked'
  | 'timeout'
  | 'context_overflow'
  | 'unknown';

// ── Typed Error Context (from Aider's reflected_message) ──

export interface TypedErrorContext {
  errorType: ErrorType;
  message: string;
  /** What the data actually looks like */
  actualData?: string;
  /** What was expected */
  expectedFormat?: string;
  /** Suggested fix: "did you mean 'table' instead of 'chart'?" */
  didYouMean?: string;
  /** Zod path to the failing field, e.g., "widgets.0.data.rows.2.cells.1" */
  zodPath?: string;
  /** HTTP status code (for LLM errors) */
  statusCode?: number;
  /** Original error for debugging */
  originalError?: Error;
}

// ── Recovery Actions ──

export type RecoveryAction =
  | { type: 'retry_with_context'; context: string }
  | { type: 'fallback_command'; command: string }
  | { type: 'fallback_model'; model: ModelRole }
  | { type: 'skip_and_continue' }
  | { type: 'partial_result'; partialView: unknown }
  | { type: 'backoff_and_retry'; delayMs: number }
  | { type: 'compact_context' }
  | { type: 'abort'; reason: string };

// ── Recovery Strategy Interface ──

export interface RecoveryContext {
  /** How many times we've retried this error */
  attemptNumber: number;
  /** Error context from the failure */
  errorContext: TypedErrorContext;
  /** Current tool or step that failed */
  currentTool?: string;
  /** Available fallback commands (from planner hints) */
  fallbackCommands?: string[];
  /** Approximate token count of current conversation */
  estimatedTokens?: number;
  /** Max token window for current model */
  maxTokens?: number;
}

export interface RecoveryStrategy {
  errorType: ErrorType;
  maxRetries: number;
  recover(context: RecoveryContext): RecoveryAction;
}

// ── Error Classification ──

/**
 * Classify an error into a typed ErrorType.
 * Inspects error messages, HTTP status codes, and common patterns.
 */
export function classifyError(error: unknown): TypedErrorContext {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Rate limit detection
    if (
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('rate_limit_exceeded')
    ) {
      return {
        errorType: 'llm_rate_limited',
        message: error.message,
        statusCode: 429,
        originalError: error,
      };
    }

    // Context overflow detection
    if (
      message.includes('context length') ||
      message.includes('token limit') ||
      message.includes('maximum context') ||
      message.includes('context_length_exceeded') ||
      message.includes('max_tokens')
    ) {
      return {
        errorType: 'context_overflow',
        message: error.message,
        originalError: error,
      };
    }

    // SSH/command failure
    if (
      message.includes('ssh') ||
      message.includes('command failed') ||
      message.includes('exit code') ||
      message.includes('connection refused') ||
      message.includes('econnrefused')
    ) {
      return {
        errorType: 'ssh_command_failed',
        message: error.message,
        originalError: error,
      };
    }

    // Timeout
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('etimedout')
    ) {
      return {
        errorType: 'timeout',
        message: error.message,
        originalError: error,
      };
    }

    // Zod validation
    if (
      message.includes('zod') ||
      message.includes('validation') ||
      message.includes('expected') ||
      message.includes('invalid_type')
    ) {
      return {
        errorType: 'zod_validation_failed',
        message: error.message,
        originalError: error,
      };
    }

    // Generic LLM failure
    if (
      message.includes('openai') ||
      message.includes('api error') ||
      message.includes('model') ||
      message.includes('completion')
    ) {
      return {
        errorType: 'llm_call_failed',
        message: error.message,
        originalError: error,
      };
    }

    return {
      errorType: 'unknown',
      message: error.message,
      originalError: error,
    };
  }

  return {
    errorType: 'unknown',
    message: String(error),
  };
}

/**
 * Create a typed error context from a Zod validation error.
 * Extracts paths, expected types, and provides suggestions.
 */
export function createZodErrorContext(
  zodError: { issues: Array<{ path: (string | number)[]; message: string; code: string; expected?: unknown; received?: unknown }> },
  actualData?: unknown,
): TypedErrorContext {
  const issues = zodError.issues;
  const firstIssue = issues[0];

  return {
    errorType: 'zod_validation_failed',
    message: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    zodPath: firstIssue ? firstIssue.path.join('.') : undefined,
    actualData: actualData ? JSON.stringify(actualData).substring(0, 500) : undefined,
    expectedFormat: firstIssue?.expected ? String(firstIssue.expected) : undefined,
    didYouMean: firstIssue?.received && firstIssue?.expected
      ? `expected ${String(firstIssue.expected)}, got ${String(firstIssue.received)}`
      : undefined,
  };
}

// ── Built-in Recovery Strategies ──

export const zodValidationStrategy: RecoveryStrategy = {
  errorType: 'zod_validation_failed',
  maxRetries: 3,
  recover(context: RecoveryContext): RecoveryAction {
    if (context.attemptNumber >= 3) {
      return { type: 'abort', reason: 'Schema validation failed after 3 attempts' };
    }

    // Build rich context for the LLM to self-correct
    const parts: string[] = [`Zod validation error: ${context.errorContext.message}`];
    if (context.errorContext.zodPath) {
      parts.push(`At path: ${context.errorContext.zodPath}`);
    }
    if (context.errorContext.didYouMean) {
      parts.push(`Hint: ${context.errorContext.didYouMean}`);
    }
    if (context.errorContext.actualData) {
      parts.push(`Actual data (truncated): ${context.errorContext.actualData}`);
    }

    return { type: 'retry_with_context', context: parts.join('\n') };
  },
};

export const sshCommandStrategy: RecoveryStrategy = {
  errorType: 'ssh_command_failed',
  maxRetries: 2,
  recover(context: RecoveryContext): RecoveryAction {
    if (context.attemptNumber >= 2) {
      return { type: 'skip_and_continue' };
    }

    // Try fallback commands if available
    if (context.fallbackCommands && context.fallbackCommands.length > context.attemptNumber) {
      return { type: 'fallback_command', command: context.fallbackCommands[context.attemptNumber]! };
    }

    return {
      type: 'retry_with_context',
      context: `Command failed: ${context.errorContext.message}. Try an alternative command.`,
    };
  },
};

export const llmCallStrategy: RecoveryStrategy = {
  errorType: 'llm_call_failed',
  maxRetries: 2,
  recover(context: RecoveryContext): RecoveryAction {
    if (context.attemptNumber === 1) {
      // First retry: try again
      return {
        type: 'retry_with_context',
        context: `LLM call failed: ${context.errorContext.message}. Retrying.`,
      };
    }

    // Second retry: fall back to a different model
    return { type: 'fallback_model', model: 'fast' };
  },
};

export const rateLimitStrategy: RecoveryStrategy = {
  errorType: 'llm_rate_limited',
  maxRetries: 4,
  recover(context: RecoveryContext): RecoveryAction {
    if (context.attemptNumber >= 4) {
      return { type: 'abort', reason: 'Rate limited after 4 retries' };
    }

    // Exponential backoff: 1s, 2s, 4s, 8s
    const delayMs = 1000 * Math.pow(2, context.attemptNumber);
    return { type: 'backoff_and_retry', delayMs };
  },
};

export const timeoutStrategy: RecoveryStrategy = {
  errorType: 'timeout',
  maxRetries: 1,
  recover(context: RecoveryContext): RecoveryAction {
    if (context.attemptNumber >= 1) {
      return { type: 'skip_and_continue' };
    }
    return {
      type: 'retry_with_context',
      context: `Command timed out: ${context.errorContext.message}. Try with a shorter or simpler command.`,
    };
  },
};

export const toolBlockedStrategy: RecoveryStrategy = {
  errorType: 'tool_blocked',
  maxRetries: 1,
  recover(_context: RecoveryContext): RecoveryAction {
    // Tool blocks are already fed back as tool results in the executor —
    // this strategy handles the case where the same tool keeps being blocked
    return { type: 'skip_and_continue' };
  },
};

export const contextOverflowStrategy: RecoveryStrategy = {
  errorType: 'context_overflow',
  maxRetries: 2,
  recover(context: RecoveryContext): RecoveryAction {
    if (context.attemptNumber >= 2) {
      return { type: 'abort', reason: 'Context still too large after compaction' };
    }
    return { type: 'compact_context' };
  },
};

export const unknownErrorStrategy: RecoveryStrategy = {
  errorType: 'unknown',
  maxRetries: 1,
  recover(context: RecoveryContext): RecoveryAction {
    if (context.attemptNumber >= 1) {
      return { type: 'abort', reason: `Unknown error: ${context.errorContext.message}` };
    }
    return {
      type: 'retry_with_context',
      context: `An unexpected error occurred: ${context.errorContext.message}. Try a different approach.`,
    };
  },
};

// ── Strategy Registry ──

const DEFAULT_STRATEGIES: RecoveryStrategy[] = [
  zodValidationStrategy,
  sshCommandStrategy,
  llmCallStrategy,
  rateLimitStrategy,
  timeoutStrategy,
  toolBlockedStrategy,
  contextOverflowStrategy,
  unknownErrorStrategy,
];

/**
 * ErrorRecoveryManager: Manages recovery strategies and tracks attempt counts.
 *
 * Usage:
 * ```typescript
 * const manager = new ErrorRecoveryManager();
 * const action = manager.getRecoveryAction(classifyError(err), { currentTool: 'exec_command' });
 * ```
 */
export class ErrorRecoveryManager {
  private strategies: Map<ErrorType, RecoveryStrategy>;
  private attemptCounts: Map<string, number>;

  constructor(customStrategies?: RecoveryStrategy[]) {
    this.strategies = new Map();
    this.attemptCounts = new Map();

    const strategies = customStrategies ?? DEFAULT_STRATEGIES;
    for (const s of strategies) {
      this.strategies.set(s.errorType, s);
    }
  }

  /**
   * Get the recovery action for an error.
   * Automatically tracks attempt counts per error-key (errorType + tool).
   */
  getRecoveryAction(
    errorContext: TypedErrorContext,
    options?: { currentTool?: string; fallbackCommands?: string[]; estimatedTokens?: number; maxTokens?: number },
  ): RecoveryAction {
    const strategy = this.strategies.get(errorContext.errorType);
    if (!strategy) {
      return { type: 'abort', reason: `No recovery strategy for: ${errorContext.errorType}` };
    }

    // Track attempts per error-type + tool combination
    const attemptKey = `${errorContext.errorType}:${options?.currentTool ?? 'global'}`;
    const attemptNumber = (this.attemptCounts.get(attemptKey) ?? 0) + 1;
    this.attemptCounts.set(attemptKey, attemptNumber);

    if (attemptNumber > strategy.maxRetries) {
      return { type: 'abort', reason: `Max retries (${strategy.maxRetries}) exceeded for ${errorContext.errorType}` };
    }

    return strategy.recover({
      attemptNumber,
      errorContext,
      currentTool: options?.currentTool,
      fallbackCommands: options?.fallbackCommands,
      estimatedTokens: options?.estimatedTokens,
      maxTokens: options?.maxTokens,
    });
  }

  /**
   * Check if retry budget is exhausted for a specific error type and tool.
   */
  isExhausted(errorType: ErrorType, tool?: string): boolean {
    const strategy = this.strategies.get(errorType);
    if (!strategy) return true;

    const attemptKey = `${errorType}:${tool ?? 'global'}`;
    const attempts = this.attemptCounts.get(attemptKey) ?? 0;
    return attempts >= strategy.maxRetries;
  }

  /**
   * Reset attempt counters (e.g., when starting a new step in the loop).
   */
  reset(): void {
    this.attemptCounts.clear();
  }

  /**
   * Reset attempts for a specific error type (e.g., after successful retry).
   */
  resetForType(errorType: ErrorType, tool?: string): void {
    const attemptKey = `${errorType}:${tool ?? 'global'}`;
    this.attemptCounts.delete(attemptKey);
  }

  /**
   * Get the current attempt count for an error type + tool.
   */
  getAttemptCount(errorType: ErrorType, tool?: string): number {
    const attemptKey = `${errorType}:${tool ?? 'global'}`;
    return this.attemptCounts.get(attemptKey) ?? 0;
  }
}

// ── Exponential Backoff with Announcement (from Roo Code) ──

/**
 * Exponential backoff that streams rate_limited events to the frontend.
 *
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retries
 * @param onEvent - Callback to emit agent events (rate_limited countdown)
 * @param signal - Optional AbortSignal
 * @returns The result of `fn` on success
 * @throws The last error if all retries exhausted
 */
export async function backoffAndRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<T> {
  let delay = 1000; // Start at 1 second

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Check abort signal
      if (signal?.aborted) {
        throw new Error('Aborted');
      }

      const errorContext = classifyError(err);

      // Only back off for rate limits
      if (errorContext.errorType !== 'llm_rate_limited' || attempt >= maxRetries) {
        throw err;
      }

      // Stream rate_limited event so frontend can show countdown
      onEvent({
        type: 'thinking',
        message: `Rate limited. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`,
      });

      await sleep(delay);
      delay *= 2; // Exponential: 1s → 2s → 4s → 8s
    }
  }

  // Should not reach here, but TypeScript needs this
  throw new Error('backoffAndRetry: exhausted retries');
}

/**
 * Sleep for a given duration. Respects AbortSignal.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}

// ── Context Compaction Helper ──

/**
 * Estimate token count for a string (rough approximation: ~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if the current conversation is approaching the context limit.
 */
export function shouldCompactContext(
  conversationText: string,
  maxTokens: number,
  threshold = 0.85,
): boolean {
  const estimated = estimateTokens(conversationText);
  return estimated >= maxTokens * threshold;
}
