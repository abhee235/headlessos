// EX2.13: Context Manager tests
// @see docs/phases/phase-ex2.md — EX2.13

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContextManager,
  estimateTokens,
  shouldCompactContext,
  DEFAULT_CONTEXT_CONFIG,
  type ContextManagerConfig,
} from '../../src/agent/context-manager.js';
import type { ChatMessage } from '../../src/llm/provider.js';

// ── Mock ModelRouter ──

function createMockModelRouter(summaryText = 'Summary of previous conversation') {
  return {
    summarize: vi.fn().mockResolvedValue({
      data: summaryText,
      tokensUsed: { input: 100, output: 20 },
      latencyMs: 200,
      model: 'gpt-4o-mini',
    }),
    // Other methods not needed by ContextManager
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ── Helpers ──

function makeMessage(role: ChatMessage['role'], content: string, extras?: Partial<ChatMessage>): ChatMessage {
  return { role, content, ...extras };
}

function makeMessages(count: number, contentLength = 100): ChatMessage[] {
  const messages: ChatMessage[] = [
    makeMessage('system', 'You are an agent that generates UI schemas.'),
  ];
  for (let i = 0; i < count; i++) {
    const content = 'x'.repeat(contentLength);
    messages.push(makeMessage(i % 2 === 0 ? 'user' : 'assistant', content));
  }
  return messages;
}

/**
 * Create messages that exceed a token threshold.
 * Each message is ~contentLength chars → ~contentLength/4 tokens + overhead.
 */
function makeMessagesExceedingThreshold(
  config: ContextManagerConfig,
  contentLength = 2000,
): ChatMessage[] {
  const thresholdTokens = config.maxContextTokens * config.compactionThreshold;
  // Each message: (contentLength + 10) / 4 tokens
  const tokensPerMsg = Math.ceil((contentLength + 10) / 4);
  const needed = Math.ceil(thresholdTokens / tokensPerMsg) + 2;
  return makeMessages(needed, contentLength);
}

// ── estimateTokens ──

describe('estimateTokens (EX2.13)', () => {
  it('estimates based on ~4 chars per token', () => {
    const messages: ChatMessage[] = [
      makeMessage('system', 'a'.repeat(400)), // 400 chars → ~100 tokens + overhead
    ];
    const tokens = estimateTokens(messages);
    // (400 + 10) / 4 = 102.5 → 103
    expect(tokens).toBe(103);
  });

  it('handles empty messages', () => {
    const tokens = estimateTokens([]);
    expect(tokens).toBe(0);
  });

  it('handles null content', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'exec_command', arguments: '{"cmd":"ls"}' } }] },
    ];
    const tokens = estimateTokens(messages);
    // name(12) + args(14) + id(0) + overhead(10) = 36 chars → 9 tokens
    expect(tokens).toBeGreaterThan(0);
  });

  it('counts tool_call arguments', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'tc1', type: 'function', function: { name: 'exec_command', arguments: '{"command":"df -h","timeout":10000}' } },
          { id: 'tc2', type: 'function', function: { name: 'read_file', arguments: '{"path":"/etc/nginx/nginx.conf"}' } },
        ],
      },
    ];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(10);
  });

  it('counts tool_call_id', () => {
    const withId: ChatMessage[] = [makeMessage('tool', 'result', { tool_call_id: 'call_abc123' })];
    const withoutId: ChatMessage[] = [makeMessage('tool', 'result')];
    expect(estimateTokens(withId)).toBeGreaterThan(estimateTokens(withoutId));
  });

  it('handles multiple messages', () => {
    const messages = makeMessages(10, 100);
    const tokens = estimateTokens(messages);
    // 11 messages, each ~100 chars + 10 overhead => 11 * 110 / 4 = 302.5
    expect(tokens).toBeGreaterThan(250);
    expect(tokens).toBeLessThan(400);
  });

  it('is within ~20% accuracy for typical text', () => {
    // GPT-4 tokenizer: ~3.5-4.5 chars per token for English
    // Our estimate: 4 chars per token
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
    const messages: ChatMessage[] = [makeMessage('user', text)];
    const estimated = estimateTokens(messages);
    // text is 4500 chars → ~1125 tokens + overhead ≈ 1128
    // Actual GPT-4 tokenization would be ~1000-1200 tokens
    expect(estimated).toBeGreaterThan(900);
    expect(estimated).toBeLessThan(1400);
  });
});

// ── shouldCompactContext ──

describe('shouldCompactContext (EX2.13)', () => {
  it('returns false when below threshold', () => {
    const messages: ChatMessage[] = [makeMessage('system', 'short')];
    expect(shouldCompactContext(messages, 100000)).toBe(false);
  });

  it('returns true when above threshold', () => {
    const messages = makeMessages(500, 1000); // ~500 * 1010/4 ≈ 126250 tokens
    expect(shouldCompactContext(messages, 1000)).toBe(true);
  });

  it('uses custom threshold', () => {
    const messages = makeMessages(10, 100);
    const tokens = estimateTokens(messages);
    // Set maxTokens just above the estimated tokens with 0.5 threshold
    expect(shouldCompactContext(messages, tokens * 3, 0.5)).toBe(false);
    expect(shouldCompactContext(messages, tokens + 1, 0.5)).toBe(true);
  });

  it('uses 0.8 default threshold', () => {
    const messages = makeMessages(10, 100);
    const tokens = estimateTokens(messages);
    // tokens >= maxTokens * 0.8 should trigger
    // So maxTokens where tokens is exactly at 80%: maxTokens = tokens / 0.8
    // Use floor to ensure tokens >= maxTokens * 0.8
    const maxTokensTriggering = Math.floor(tokens / 0.8);
    expect(shouldCompactContext(messages, maxTokensTriggering)).toBe(true);
    // With much higher max, should not trigger
    expect(shouldCompactContext(messages, tokens * 10)).toBe(false);
  });
});

// ── ContextManager.maybeCompact ──

describe('ContextManager.maybeCompact (EX2.13)', () => {
  let mockRouter: ReturnType<typeof createMockModelRouter>;

  beforeEach(() => {
    mockRouter = createMockModelRouter();
  });

  it('does not compact when below threshold', async () => {
    const cm = new ContextManager(mockRouter, { maxContextTokens: 100000 });
    const messages: ChatMessage[] = [
      makeMessage('system', 'You are a helpful agent.'),
      makeMessage('user', 'Hello'),
      makeMessage('assistant', 'Hi there!'),
    ];

    const result = await cm.maybeCompact(messages);
    expect(result.compacted).toBe(false);
    expect(result.messages).toBe(messages);
    expect(result.originalTokens).toBe(result.newTokens);
    expect(mockRouter.summarize).not.toHaveBeenCalled();
  });

  it('compacts when above threshold', async () => {
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 200,     // Very low for testing
      compactionThreshold: 0.5,  // Trigger at 100 tokens
      preserveRecentMessages: 2,
    });

    const messages: ChatMessage[] = [
      makeMessage('system', 'System prompt.'),
      makeMessage('user', 'a'.repeat(200)),
      makeMessage('assistant', 'b'.repeat(200)),
      makeMessage('user', 'c'.repeat(200)),
      makeMessage('assistant', 'd'.repeat(200)),
      makeMessage('user', 'recent 1'),
      makeMessage('assistant', 'recent 2'),
    ];

    const result = await cm.maybeCompact(messages);
    expect(result.compacted).toBe(true);
    expect(result.newTokens).toBeLessThan(result.originalTokens);
    expect(mockRouter.summarize).toHaveBeenCalledOnce();
  });

  it('preserves system prompt (first message)', async () => {
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 200,
      compactionThreshold: 0.5,
      preserveRecentMessages: 2,
    });

    const systemMsg = makeMessage('system', 'Important system prompt that must survive.');
    const messages: ChatMessage[] = [
      systemMsg,
      makeMessage('user', 'x'.repeat(200)),
      makeMessage('assistant', 'y'.repeat(200)),
      makeMessage('user', 'z'.repeat(200)),
      makeMessage('assistant', 'recent reply'),
      makeMessage('user', 'recent question'),
    ];

    const result = await cm.maybeCompact(messages);
    expect(result.compacted).toBe(true);
    expect(result.messages[0]).toBe(systemMsg);
  });

  it('preserves last N messages verbatim', async () => {
    const preserveN = 3;
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 200,
      compactionThreshold: 0.5,
      preserveRecentMessages: preserveN,
    });

    const recentMsgs = [
      makeMessage('assistant' as const, 'recent-1'),
      makeMessage('user' as const, 'recent-2'),
      makeMessage('assistant' as const, 'recent-3'),
    ];

    const messages: ChatMessage[] = [
      makeMessage('system', 'System'),
      makeMessage('user', 'x'.repeat(200)),
      makeMessage('assistant', 'y'.repeat(200)),
      makeMessage('user', 'z'.repeat(200)),
      ...recentMsgs,
    ];

    const result = await cm.maybeCompact(messages);
    expect(result.compacted).toBe(true);

    // Last N messages should be preserved exactly
    const lastN = result.messages.slice(-preserveN);
    expect(lastN).toEqual(recentMsgs);
  });

  it('inserts summary as second message', async () => {
    mockRouter = createMockModelRouter('Agent gathered system info and ran nginx -t.');
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 200,
      compactionThreshold: 0.5,
      preserveRecentMessages: 2,
    });

    const messages: ChatMessage[] = [
      makeMessage('system', 'System prompt'),
      makeMessage('user', 'x'.repeat(200)),
      makeMessage('assistant', 'y'.repeat(200)),
      makeMessage('user', 'recent'),
      makeMessage('assistant', 'reply'),
    ];

    const result = await cm.maybeCompact(messages);
    expect(result.compacted).toBe(true);
    expect(result.messages[1].role).toBe('user');
    expect(result.messages[1].content).toContain('Context summary');
    expect(result.messages[1].content).toContain('Agent gathered system info');
  });

  it('does not compact when too few messages', async () => {
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 10,       // Very low
      compactionThreshold: 0.1,   // Very aggressive
      preserveRecentMessages: 6,
    });

    // 3 messages but preserveRecentMessages is 6 (plus system = 7 needed)
    const messages: ChatMessage[] = [
      makeMessage('system', 'x'.repeat(100)),
      makeMessage('user', 'x'.repeat(100)),
      makeMessage('assistant', 'x'.repeat(100)),
    ];

    const result = await cm.maybeCompact(messages);
    expect(result.compacted).toBe(false);
    expect(mockRouter.summarize).not.toHaveBeenCalled();
  });

  it('does not compact when head is empty after split', async () => {
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 10,
      compactionThreshold: 0.1,
      preserveRecentMessages: 10, // More than total messages
    });

    const messages = makeMessages(5, 50);

    const result = await cm.maybeCompact(messages);
    expect(result.compacted).toBe(false);
    expect(mockRouter.summarize).not.toHaveBeenCalled();
  });

  it('handles summarization failure gracefully', async () => {
    mockRouter.summarize.mockRejectedValueOnce(new Error('LLM unavailable'));
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 200,
      compactionThreshold: 0.5,
      preserveRecentMessages: 2,
    });

    const messages: ChatMessage[] = [
      makeMessage('system', 'System'),
      makeMessage('user', 'x'.repeat(200)),
      makeMessage('assistant', 'y'.repeat(200)),
      makeMessage('user', 'recent'),
      makeMessage('assistant', 'reply'),
    ];

    const result = await cm.maybeCompact(messages);
    // Should return original messages (no compaction) rather than crash
    expect(result.compacted).toBe(false);
    expect(result.messages).toBe(messages);
    expect(mockRouter.summarize).toHaveBeenCalledOnce();
  });

  it('passes conversation text to summarize with custom prompt', async () => {
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 200,
      compactionThreshold: 0.5,
      preserveRecentMessages: 2,
    });

    const messages: ChatMessage[] = [
      makeMessage('system', 'System prompt'),
      makeMessage('user', 'a'.repeat(200)),
      makeMessage('assistant', 'b'.repeat(200)),
      makeMessage('user', 'recent'),
      makeMessage('assistant', 'reply'),
    ];

    await cm.maybeCompact(messages);

    expect(mockRouter.summarize).toHaveBeenCalledWith(
      expect.stringContaining('user:'),
      expect.stringContaining('Summarize this agent conversation history'),
    );
  });

  it('includes tool call info in summary text', async () => {
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 200,
      compactionThreshold: 0.5,
      preserveRecentMessages: 2,
    });

    const messages: ChatMessage[] = [
      makeMessage('system', 'System'),
      makeMessage('assistant', null, {
        tool_calls: [
          { id: 'tc1', type: 'function', function: { name: 'exec_command', arguments: '{}' } },
        ],
      } as Partial<ChatMessage>),
      makeMessage('tool', 'Command output', { tool_call_id: 'tc1' }),
      makeMessage('user', 'x'.repeat(400)),
      makeMessage('assistant', 'y'.repeat(400)),
      makeMessage('user', 'recent'),
      makeMessage('assistant', 'reply'),
    ];

    await cm.maybeCompact(messages);

    const callArgs = mockRouter.summarize.mock.calls[0][0] as string;
    expect(callArgs).toContain('exec_command');
    expect(callArgs).toContain('tool response for tc1');
  });

  it('reduces token count after compaction', async () => {
    const cm = new ContextManager(mockRouter, {
      maxContextTokens: 500,
      compactionThreshold: 0.5,
      preserveRecentMessages: 2,
    });

    const messages: ChatMessage[] = [
      makeMessage('system', 'System'),
      ...Array.from({ length: 20 }, (_, i) =>
        makeMessage(i % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(100)),
      ),
      makeMessage('user', 'recent'),
      makeMessage('assistant', 'reply'),
    ];

    const result = await cm.maybeCompact(messages);
    expect(result.compacted).toBe(true);
    // Summary should be much shorter than 20 messages × 100 chars
    expect(result.newTokens).toBeLessThan(result.originalTokens);
  });
});

// ── ContextManager helper methods ──

describe('ContextManager helpers (EX2.13)', () => {
  it('getTokenCount returns 0 before first call', () => {
    const cm = new ContextManager(createMockModelRouter());
    expect(cm.getTokenCount()).toBe(0);
  });

  it('getTokenCount updates after maybeCompact', async () => {
    const cm = new ContextManager(createMockModelRouter(), { maxContextTokens: 100000 });
    const messages = makeMessages(5, 100);
    await cm.maybeCompact(messages);
    expect(cm.getTokenCount()).toBeGreaterThan(0);
  });

  it('getThreshold returns correct value', () => {
    const cm = new ContextManager(createMockModelRouter(), {
      maxContextTokens: 128000,
      compactionThreshold: 0.8,
    });
    expect(cm.getThreshold()).toBe(102400);
  });

  it('wouldCompact returns true for large context', () => {
    const cm = new ContextManager(createMockModelRouter(), {
      maxContextTokens: 100,
      compactionThreshold: 0.5,
    });
    const messages = makeMessages(50, 100);
    expect(cm.wouldCompact(messages)).toBe(true);
  });

  it('wouldCompact returns false for small context', () => {
    const cm = new ContextManager(createMockModelRouter(), {
      maxContextTokens: 100000,
    });
    const messages: ChatMessage[] = [makeMessage('system', 'short')];
    expect(cm.wouldCompact(messages)).toBe(false);
  });
});

// ── DEFAULT_CONTEXT_CONFIG ──

describe('DEFAULT_CONTEXT_CONFIG (EX2.13)', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_CONTEXT_CONFIG.maxContextTokens).toBe(128000);
    expect(DEFAULT_CONTEXT_CONFIG.compactionThreshold).toBe(0.8);
    expect(DEFAULT_CONTEXT_CONFIG.preserveRecentMessages).toBe(6);
  });
});
