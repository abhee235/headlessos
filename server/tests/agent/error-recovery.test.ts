// EX2.10: Error Recovery Strategies — Tests
// @see docs/phases/phase-ex2.md — EX2.10

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyError,
  createZodErrorContext,
  ErrorRecoveryManager,
  backoffAndRetry,
  sleep,
  estimateTokens,
  shouldCompactContext,
  zodValidationStrategy,
  sshCommandStrategy,
  llmCallStrategy,
  rateLimitStrategy,
  timeoutStrategy,
  toolBlockedStrategy,
  contextOverflowStrategy,
  unknownErrorStrategy,
  type ErrorType,
  type TypedErrorContext,
  type RecoveryAction,
  type RecoveryContext,
} from '../../src/agent/error-recovery.js';

// ── classifyError Tests ──

describe('classifyError', () => {
  it('classifies rate limit errors', () => {
    const ctx = classifyError(new Error('Rate limit exceeded'));
    expect(ctx.errorType).toBe('llm_rate_limited');
    expect(ctx.statusCode).toBe(429);
  });

  it('classifies 429 errors', () => {
    const ctx = classifyError(new Error('Error 429: Too Many Requests'));
    expect(ctx.errorType).toBe('llm_rate_limited');
  });

  it('classifies context overflow errors', () => {
    const ctx = classifyError(new Error('context_length_exceeded: max 128000 tokens'));
    expect(ctx.errorType).toBe('context_overflow');
  });

  it('classifies token limit errors', () => {
    const ctx = classifyError(new Error('Request exceeds token limit'));
    expect(ctx.errorType).toBe('context_overflow');
  });

  it('classifies SSH errors', () => {
    const ctx = classifyError(new Error('SSH connection refused'));
    expect(ctx.errorType).toBe('ssh_command_failed');
  });

  it('classifies command failed errors', () => {
    const ctx = classifyError(new Error('Command failed with exit code 1'));
    expect(ctx.errorType).toBe('ssh_command_failed');
  });

  it('classifies timeout errors', () => {
    const ctx = classifyError(new Error('Request timed out'));
    expect(ctx.errorType).toBe('timeout');
  });

  it('classifies ETIMEDOUT errors', () => {
    const ctx = classifyError(new Error('connect ETIMEDOUT'));
    expect(ctx.errorType).toBe('timeout');
  });

  it('classifies Zod validation errors', () => {
    const ctx = classifyError(new Error('Zod validation failed'));
    expect(ctx.errorType).toBe('zod_validation_failed');
  });

  it('classifies OpenAI API errors', () => {
    const ctx = classifyError(new Error('OpenAI API error: 500'));
    expect(ctx.errorType).toBe('llm_call_failed');
  });

  it('classifies unknown errors', () => {
    const ctx = classifyError(new Error('Something went wrong somehow'));
    expect(ctx.errorType).toBe('unknown');
  });

  it('handles non-Error values', () => {
    const ctx = classifyError('string error');
    expect(ctx.errorType).toBe('unknown');
    expect(ctx.message).toBe('string error');
  });

  it('preserves original error', () => {
    const original = new Error('test');
    const ctx = classifyError(original);
    expect(ctx.originalError).toBe(original);
  });
});

// ── createZodErrorContext Tests ──

describe('createZodErrorContext', () => {
  it('creates context from Zod-like error', () => {
    const zodError = {
      issues: [
        { path: ['widgets', 0, 'data'], message: 'Required', code: 'invalid_type', expected: 'object', received: 'undefined' },
      ],
    };
    const ctx = createZodErrorContext(zodError);
    expect(ctx.errorType).toBe('zod_validation_failed');
    expect(ctx.zodPath).toBe('widgets.0.data');
    expect(ctx.didYouMean).toContain('expected object');
    expect(ctx.didYouMean).toContain('got undefined');
  });

  it('includes truncated actual data', () => {
    const zodError = {
      issues: [
        { path: ['type'], message: 'Invalid enum value', code: 'invalid_enum_value' },
      ],
    };
    const ctx = createZodErrorContext(zodError, { type: 'invalid-widget', data: {} });
    expect(ctx.actualData).toContain('invalid-widget');
  });

  it('handles multiple issues', () => {
    const zodError = {
      issues: [
        { path: ['title'], message: 'Required', code: 'invalid_type' },
        { path: ['sections'], message: 'Required', code: 'invalid_type' },
      ],
    };
    const ctx = createZodErrorContext(zodError);
    expect(ctx.message).toContain('title');
    expect(ctx.message).toContain('sections');
  });

  it('handles empty issues array', () => {
    const ctx = createZodErrorContext({ issues: [] });
    expect(ctx.errorType).toBe('zod_validation_failed');
    expect(ctx.zodPath).toBeUndefined();
  });
});

// ── Individual Strategy Tests ──

describe('zodValidationStrategy', () => {
  it('retries with context on first attempt', () => {
    const action = zodValidationStrategy.recover({
      attemptNumber: 1,
      errorContext: {
        errorType: 'zod_validation_failed',
        message: 'expected number, got string',
        zodPath: 'widgets.0.data.rows.0',
        didYouMean: 'expected number, got string',
      },
    } as RecoveryContext);
    expect(action.type).toBe('retry_with_context');
    if (action.type === 'retry_with_context') {
      expect(action.context).toContain('expected number');
      expect(action.context).toContain('widgets.0.data.rows.0');
    }
  });

  it('aborts after max retries', () => {
    const action = zodValidationStrategy.recover({
      attemptNumber: 3,
      errorContext: { errorType: 'zod_validation_failed', message: 'still failing' },
    } as RecoveryContext);
    expect(action.type).toBe('abort');
  });
});

describe('sshCommandStrategy', () => {
  it('uses fallback command when available', () => {
    const action = sshCommandStrategy.recover({
      attemptNumber: 1,
      errorContext: { errorType: 'ssh_command_failed', message: 'nginx: not found' },
      fallbackCommands: ['nginx -T', 'cat /etc/nginx/nginx.conf'],
    } as RecoveryContext);
    expect(action.type).toBe('fallback_command');
    if (action.type === 'fallback_command') {
      expect(action.command).toBe('cat /etc/nginx/nginx.conf');
    }
  });

  it('skips and continues after max retries', () => {
    const action = sshCommandStrategy.recover({
      attemptNumber: 2,
      errorContext: { errorType: 'ssh_command_failed', message: 'failed' },
    } as RecoveryContext);
    expect(action.type).toBe('skip_and_continue');
  });

  it('retries with context when no fallback commands', () => {
    const action = sshCommandStrategy.recover({
      attemptNumber: 1,
      errorContext: { errorType: 'ssh_command_failed', message: 'failed' },
    } as RecoveryContext);
    expect(action.type).toBe('retry_with_context');
  });
});

describe('llmCallStrategy', () => {
  it('retries on first attempt', () => {
    const action = llmCallStrategy.recover({
      attemptNumber: 1,
      errorContext: { errorType: 'llm_call_failed', message: 'API error' },
    } as RecoveryContext);
    expect(action.type).toBe('retry_with_context');
  });

  it('falls back to different model on second attempt', () => {
    const action = llmCallStrategy.recover({
      attemptNumber: 2,
      errorContext: { errorType: 'llm_call_failed', message: 'API error' },
    } as RecoveryContext);
    expect(action.type).toBe('fallback_model');
    if (action.type === 'fallback_model') {
      expect(action.model).toBe('fast');
    }
  });
});

describe('rateLimitStrategy', () => {
  it('backs off with exponential delay', () => {
    const action1 = rateLimitStrategy.recover({
      attemptNumber: 1,
      errorContext: { errorType: 'llm_rate_limited', message: '429' },
    } as RecoveryContext);
    expect(action1.type).toBe('backoff_and_retry');
    if (action1.type === 'backoff_and_retry') {
      expect(action1.delayMs).toBe(2000); // 1000 * 2^1
    }

    const action2 = rateLimitStrategy.recover({
      attemptNumber: 2,
      errorContext: { errorType: 'llm_rate_limited', message: '429' },
    } as RecoveryContext);
    if (action2.type === 'backoff_and_retry') {
      expect(action2.delayMs).toBe(4000); // 1000 * 2^2
    }
  });

  it('aborts after max retries', () => {
    const action = rateLimitStrategy.recover({
      attemptNumber: 4,
      errorContext: { errorType: 'llm_rate_limited', message: '429' },
    } as RecoveryContext);
    expect(action.type).toBe('abort');
  });
});

describe('timeoutStrategy', () => {
  it('retries once with context', () => {
    const action = timeoutStrategy.recover({
      attemptNumber: 0,
      errorContext: { errorType: 'timeout', message: 'timed out' },
    } as RecoveryContext);
    expect(action.type).toBe('retry_with_context');
  });

  it('skips after first retry', () => {
    const action = timeoutStrategy.recover({
      attemptNumber: 1,
      errorContext: { errorType: 'timeout', message: 'timed out' },
    } as RecoveryContext);
    expect(action.type).toBe('skip_and_continue');
  });
});

describe('toolBlockedStrategy', () => {
  it('always skips and continues', () => {
    const action = toolBlockedStrategy.recover({
      attemptNumber: 1,
      errorContext: { errorType: 'tool_blocked', message: 'blocked' },
    } as RecoveryContext);
    expect(action.type).toBe('skip_and_continue');
  });
});

describe('contextOverflowStrategy', () => {
  it('triggers compaction on first attempt', () => {
    const action = contextOverflowStrategy.recover({
      attemptNumber: 1,
      errorContext: { errorType: 'context_overflow', message: 'too many tokens' },
    } as RecoveryContext);
    expect(action.type).toBe('compact_context');
  });

  it('aborts after max compactions', () => {
    const action = contextOverflowStrategy.recover({
      attemptNumber: 2,
      errorContext: { errorType: 'context_overflow', message: 'still too large' },
    } as RecoveryContext);
    expect(action.type).toBe('abort');
  });
});

describe('unknownErrorStrategy', () => {
  it('retries once with context', () => {
    const action = unknownErrorStrategy.recover({
      attemptNumber: 0,
      errorContext: { errorType: 'unknown', message: 'weird error' },
    } as RecoveryContext);
    expect(action.type).toBe('retry_with_context');
  });

  it('aborts after first retry', () => {
    const action = unknownErrorStrategy.recover({
      attemptNumber: 1,
      errorContext: { errorType: 'unknown', message: 'weird error' },
    } as RecoveryContext);
    expect(action.type).toBe('abort');
  });
});

// ── ErrorRecoveryManager Tests ──

describe('ErrorRecoveryManager', () => {
  let manager: ErrorRecoveryManager;

  beforeEach(() => {
    manager = new ErrorRecoveryManager();
  });

  it('returns recovery action for known error types', () => {
    const ctx: TypedErrorContext = { errorType: 'zod_validation_failed', message: 'test' };
    const action = manager.getRecoveryAction(ctx);
    expect(action.type).toBe('retry_with_context');
  });

  it('tracks attempt counts automatically', () => {
    const ctx: TypedErrorContext = { errorType: 'llm_rate_limited', message: '429' };
    manager.getRecoveryAction(ctx);
    expect(manager.getAttemptCount('llm_rate_limited')).toBe(1);
    manager.getRecoveryAction(ctx);
    expect(manager.getAttemptCount('llm_rate_limited')).toBe(2);
  });

  it('aborts when max retries exceeded', () => {
    const ctx: TypedErrorContext = { errorType: 'timeout', message: 'timed out' };
    // timeout maxRetries = 1
    manager.getRecoveryAction(ctx); // attempt 1 → OK
    const action = manager.getRecoveryAction(ctx); // attempt 2 → exceeds
    expect(action.type).toBe('abort');
  });

  it('tracks attempts per tool', () => {
    const ctx: TypedErrorContext = { errorType: 'ssh_command_failed', message: 'failed' };
    manager.getRecoveryAction(ctx, { currentTool: 'exec_command' });
    manager.getRecoveryAction(ctx, { currentTool: 'sftp_read' });
    expect(manager.getAttemptCount('ssh_command_failed', 'exec_command')).toBe(1);
    expect(manager.getAttemptCount('ssh_command_failed', 'sftp_read')).toBe(1);
  });

  it('resets all attempt counters', () => {
    const ctx: TypedErrorContext = { errorType: 'llm_rate_limited', message: '429' };
    manager.getRecoveryAction(ctx);
    manager.getRecoveryAction(ctx);
    manager.reset();
    expect(manager.getAttemptCount('llm_rate_limited')).toBe(0);
  });

  it('resets attempts for specific error type', () => {
    const ctx: TypedErrorContext = { errorType: 'llm_rate_limited', message: '429' };
    manager.getRecoveryAction(ctx);
    manager.resetForType('llm_rate_limited');
    expect(manager.getAttemptCount('llm_rate_limited')).toBe(0);
  });

  it('reports exhaustion correctly', () => {
    const ctx: TypedErrorContext = { errorType: 'timeout', message: 'timed out' };
    expect(manager.isExhausted('timeout')).toBe(false);
    manager.getRecoveryAction(ctx); // attempt 1 → exhausted (maxRetries=1)
    expect(manager.isExhausted('timeout')).toBe(true);
  });

  it('passes fallback commands to strategy', () => {
    const ctx: TypedErrorContext = { errorType: 'ssh_command_failed', message: 'nginx not found' };
    const action = manager.getRecoveryAction(ctx, {
      currentTool: 'exec_command',
      fallbackCommands: ['nginx -T', 'cat /etc/nginx/nginx.conf'],
    });
    expect(action.type).toBe('fallback_command');
  });

  it('uses custom strategies when provided', () => {
    const customManager = new ErrorRecoveryManager([
      {
        errorType: 'unknown',
        maxRetries: 5,
        recover: () => ({ type: 'skip_and_continue' }),
      },
    ]);
    const action = customManager.getRecoveryAction({ errorType: 'unknown', message: 'test' });
    expect(action.type).toBe('skip_and_continue');
  });

  it('aborts for unregistered error types', () => {
    const customManager = new ErrorRecoveryManager([]);
    const action = customManager.getRecoveryAction({ errorType: 'timeout', message: 'test' });
    expect(action.type).toBe('abort');
  });
});

// ── backoffAndRetry Tests ──

describe('backoffAndRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const onEvent = vi.fn();
    const result = await backoffAndRetry(fn, 3, onEvent);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('retries on rate limit error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValue('ok');
    const onEvent = vi.fn();
    const result = await backoffAndRetry(fn, 3, onEvent);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('throws non-rate-limit errors immediately', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Some other error'));
    const onEvent = vi.fn();
    await expect(backoffAndRetry(fn, 3, onEvent)).rejects.toThrow('Some other error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));
    const onEvent = vi.fn();
    await expect(backoffAndRetry(fn, 2, onEvent)).rejects.toThrow('Rate limit exceeded');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('respects abort signal', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));
    const onEvent = vi.fn();

    controller.abort();
    await expect(backoffAndRetry(fn, 3, onEvent, controller.signal)).rejects.toThrow('Aborted');
  });
});

// ── sleep Tests ──

describe('sleep', () => {
  it('resolves after delay', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('rejects when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toThrow('Aborted');
  });

  it('rejects when signal is aborted during sleep', async () => {
    const controller = new AbortController();
    const promise = sleep(5000, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toThrow('Aborted');
  });
});

// ── Utility Tests ──

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('hello world')).toBe(3); // ceil(11/4)
  });

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('shouldCompactContext', () => {
  it('returns false when under threshold', () => {
    const text = 'a'.repeat(1000);
    expect(shouldCompactContext(text, 1000)).toBe(false); // 250 tokens < 850
  });

  it('returns true when over threshold', () => {
    const text = 'a'.repeat(4000);
    expect(shouldCompactContext(text, 1000)).toBe(true); // 1000 tokens > 850
  });

  it('respects custom threshold', () => {
    const text = 'a'.repeat(2000); // 500 tokens
    expect(shouldCompactContext(text, 1000, 0.4)).toBe(true); // 500 >= 400
    expect(shouldCompactContext(text, 1000, 0.6)).toBe(false); // 500 < 600
  });
});
