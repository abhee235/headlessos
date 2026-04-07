// EX2.13: Context Manager
// @see docs/phases/phase-ex2.md — EX2.13
//
// Manages conversation history, tracks token usage, and compacts context
// when approaching the model's context window limit. Ensures long agent
// sessions don't fail due to context overflow.
//
// Inspired by:
// - Continue: Compacts at 80% context usage
// - Aider: head/tail split, summarizes head with weak model

import type { ModelRouter } from '../llm/model-router.js';
import type { ChatMessage } from '../llm/provider.js';

// ── Config ──

export interface ContextManagerConfig {
  /** Max tokens for the model's context window (e.g., 128000 for GPT-4.1) */
  maxContextTokens: number;
  /** Fraction of context usage that triggers compaction (default: 0.8) */
  compactionThreshold: number;
  /** Number of most-recent messages to preserve verbatim (default: 6) */
  preserveRecentMessages: number;
}

export const DEFAULT_CONTEXT_CONFIG: ContextManagerConfig = {
  maxContextTokens: 128000,
  compactionThreshold: 0.8,
  preserveRecentMessages: 6,
};

// ── Compaction Result ──

export interface CompactionResult {
  /** The (possibly compacted) message list */
  messages: ChatMessage[];
  /** Whether compaction was performed */
  compacted: boolean;
  /** Token count before compaction */
  originalTokens: number;
  /** Token count after compaction (same as original if not compacted) */
  newTokens: number;
}

// ── Context Manager ──

export class ContextManager {
  private tokenCount = 0;
  private modelRouter: ModelRouter;
  private config: ContextManagerConfig;

  constructor(
    modelRouter: ModelRouter,
    config: Partial<ContextManagerConfig> = {},
  ) {
    this.modelRouter = modelRouter;
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  /**
   * Check if context needs compaction. If so, summarize older messages
   * with the weak model and return the compacted message list.
   *
   * Strategy (from Aider):
   * - Split messages into: system prompt | head (older) | tail (recent N)
   * - Summarize head with weak/cheap model
   * - Reassemble: system prompt + summary message + tail
   */
  async maybeCompact(messages: ChatMessage[]): Promise<CompactionResult> {
    this.tokenCount = estimateTokens(messages);
    const threshold = this.config.maxContextTokens * this.config.compactionThreshold;

    // Not at limit yet — no compaction needed
    if (this.tokenCount < threshold) {
      return {
        messages,
        compacted: false,
        originalTokens: this.tokenCount,
        newTokens: this.tokenCount,
      };
    }

    // Not enough messages to compact
    if (messages.length <= this.config.preserveRecentMessages + 1) {
      return {
        messages,
        compacted: false,
        originalTokens: this.tokenCount,
        newTokens: this.tokenCount,
      };
    }

    // ── Split ──
    const systemMessage = messages[0]; // Always keep system prompt
    const preserveCount = Math.min(this.config.preserveRecentMessages, messages.length - 1);
    const tail = messages.slice(-preserveCount);
    const head = messages.slice(1, messages.length - preserveCount);

    // Nothing to summarize
    if (head.length === 0) {
      return {
        messages,
        compacted: false,
        originalTokens: this.tokenCount,
        newTokens: this.tokenCount,
      };
    }

    // ── Summarize the head with weak model (cheap) ──
    const headText = head
      .map((m) => {
        const content = typeof m.content === 'string' ? m.content : '[complex]';
        const toolInfo = m.tool_calls
          ? ` [called: ${m.tool_calls.map((tc) => tc.function.name).join(', ')}]`
          : '';
        const toolId = m.tool_call_id ? ` [tool response for ${m.tool_call_id}]` : '';
        return `${m.role}${toolInfo}${toolId}: ${content}`;
      })
      .join('\n');

    let summary: string;
    try {
      const result = await this.modelRouter.summarize(
        headText,
        'Summarize this agent conversation history concisely. Preserve: tool calls made, key data gathered, commands executed, and any errors encountered. Focus on facts, not narrative.',
      );
      summary = result.data;
    } catch {
      // Summarization failed — skip compaction rather than losing context
      return {
        messages,
        compacted: false,
        originalTokens: this.tokenCount,
        newTokens: this.tokenCount,
      };
    }

    // ── Reassemble ──
    const compactedMessages: ChatMessage[] = [
      systemMessage,
      {
        role: 'user',
        content: `[Context summary of ${head.length} previous messages]\n${summary}\n\n[Continue from here — the above is a summary of earlier conversation]`,
      },
      ...tail,
    ];

    const newTokens = estimateTokens(compactedMessages);

    return {
      messages: compactedMessages,
      compacted: true,
      originalTokens: this.tokenCount,
      newTokens,
    };
  }

  /**
   * Get the current estimated token count.
   */
  getTokenCount(): number {
    return this.tokenCount;
  }

  /**
   * Get the compaction threshold in tokens.
   */
  getThreshold(): number {
    return Math.floor(this.config.maxContextTokens * this.config.compactionThreshold);
  }

  /**
   * Check if compaction would be triggered for the given messages
   * (without actually compacting).
   */
  wouldCompact(messages: ChatMessage[]): boolean {
    const tokens = estimateTokens(messages);
    return tokens >= this.config.maxContextTokens * this.config.compactionThreshold;
  }
}

// ── Token Estimation (exported for testing) ──

/**
 * Fast token estimation — ~4 chars per token for English text.
 * No LLM call needed. Within ~20% accuracy for typical text.
 *
 * Accounts for:
 * - String content
 * - Array content (JSON serialized)
 * - Per-message overhead (~10 tokens for role, metadata)
 * - Tool call arguments
 */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;

  for (const msg of messages) {
    // Content
    if (typeof msg.content === 'string') {
      chars += msg.content.length;
    } else if (msg.content === null) {
      // null content (e.g., tool-calling assistant messages)
      chars += 0;
    }

    // Tool calls (arguments are JSON strings)
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        chars += tc.function.name.length;
        chars += tc.function.arguments.length;
      }
    }

    // Tool call ID
    if (msg.tool_call_id) {
      chars += msg.tool_call_id.length;
    }

    // Per-message overhead (role, metadata separators)
    chars += 10;
  }

  return Math.ceil(chars / 4);
}

/**
 * Check whether context should be compacted given the current token
 * usage and a threshold.
 */
export function shouldCompactContext(
  messages: ChatMessage[],
  maxTokens: number,
  threshold = 0.8,
): boolean {
  const tokens = estimateTokens(messages);
  return tokens >= maxTokens * threshold;
}
