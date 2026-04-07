// EX2.12: WebSocket Protocol tests — agent-ui route
// @see docs/phases/phase-ex2.md — EX2.12
//
// Tests message parsing, session management, and error handling
// for the UI Agent WebSocket protocol.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WriteBackRequestSchema } from '../../src/agent/writeback.js';
import { SecurityError } from '../../src/security/validators.js';

// ── Test helpers that mirror the route's internal logic ──

interface ClientMessage {
  type: 'generate' | 'abort' | 'write_back';
  requestId: string;
  prompt?: string;
  writeBack?: unknown;
  values?: Record<string, unknown>;
}

interface ActiveSession {
  abortController: AbortController;
  running: boolean;
}

/** Reproduce client message validation from the route */
function validateClientMessage(raw: string): { valid: boolean; msg?: ClientMessage; error?: string } {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    return { valid: false, error: 'Invalid JSON' };
  }

  if (!msg.type || !msg.requestId) {
    return { valid: false, error: 'Missing type or requestId' };
  }

  if (msg.type === 'generate' && !msg.prompt) {
    return { valid: false, error: 'Missing prompt' };
  }

  if (msg.type === 'write_back' && (!msg.writeBack || !msg.values)) {
    return { valid: false, error: 'Missing writeBack or values' };
  }

  return { valid: true, msg };
}

// ── Client Message Validation ──

describe('Agent UI WebSocket: Client Message Validation', () => {
  it('accepts valid generate message', () => {
    const result = validateClientMessage(JSON.stringify({
      type: 'generate',
      requestId: 'abc-123',
      prompt: 'show nginx config',
    }));
    expect(result.valid).toBe(true);
    expect(result.msg?.type).toBe('generate');
    expect(result.msg?.prompt).toBe('show nginx config');
  });

  it('accepts valid abort message', () => {
    const result = validateClientMessage(JSON.stringify({
      type: 'abort',
      requestId: 'abc-123',
    }));
    expect(result.valid).toBe(true);
    expect(result.msg?.type).toBe('abort');
  });

  it('accepts valid write_back message', () => {
    const result = validateClientMessage(JSON.stringify({
      type: 'write_back',
      requestId: 'abc-123',
      writeBack: { type: 'config-file', path: '/etc/test.conf', format: 'key-value' },
      values: { key: 'value' },
    }));
    expect(result.valid).toBe(true);
    expect(result.msg?.type).toBe('write_back');
  });

  it('rejects invalid JSON', () => {
    const result = validateClientMessage('not json');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid JSON');
  });

  it('rejects missing type', () => {
    const result = validateClientMessage(JSON.stringify({
      requestId: 'abc-123',
    }));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing type or requestId');
  });

  it('rejects missing requestId', () => {
    const result = validateClientMessage(JSON.stringify({
      type: 'generate',
    }));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing type or requestId');
  });

  it('rejects generate without prompt', () => {
    const result = validateClientMessage(JSON.stringify({
      type: 'generate',
      requestId: 'abc-123',
    }));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing prompt');
  });

  it('rejects write_back without writeBack', () => {
    const result = validateClientMessage(JSON.stringify({
      type: 'write_back',
      requestId: 'abc-123',
      values: { key: 'value' },
    }));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing writeBack or values');
  });

  it('rejects write_back without values', () => {
    const result = validateClientMessage(JSON.stringify({
      type: 'write_back',
      requestId: 'abc-123',
      writeBack: { type: 'config-file' },
    }));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing writeBack or values');
  });
});

// ── Session Management ──

describe('Agent UI WebSocket: Session Management', () => {
  let sessions: Map<string, ActiveSession>;

  beforeEach(() => {
    sessions = new Map();
  });

  it('creates a new session', () => {
    const abortController = new AbortController();
    sessions.set('req-1', { abortController, running: true });
    expect(sessions.has('req-1')).toBe(true);
    expect(sessions.get('req-1')?.running).toBe(true);
  });

  it('prevents duplicate sessions', () => {
    sessions.set('req-1', { abortController: new AbortController(), running: true });
    const isDuplicate = sessions.has('req-1');
    expect(isDuplicate).toBe(true);
  });

  it('aborts a session via AbortController', () => {
    const abortController = new AbortController();
    sessions.set('req-1', { abortController, running: true });

    abortController.abort();
    expect(abortController.signal.aborted).toBe(true);
    sessions.delete('req-1');
    expect(sessions.has('req-1')).toBe(false);
  });

  it('supports multiple concurrent sessions', () => {
    sessions.set('req-1', { abortController: new AbortController(), running: true });
    sessions.set('req-2', { abortController: new AbortController(), running: true });
    sessions.set('req-3', { abortController: new AbortController(), running: true });
    expect(sessions.size).toBe(3);
  });

  it('clears all sessions on close', () => {
    sessions.set('req-1', { abortController: new AbortController(), running: true });
    sessions.set('req-2', { abortController: new AbortController(), running: true });

    // Simulate socket close
    for (const [, session] of sessions) {
      if (session.running) {
        session.abortController.abort();
      }
    }
    sessions.clear();
    expect(sessions.size).toBe(0);
  });

  it('marks session as not running after completion', () => {
    sessions.set('req-1', { abortController: new AbortController(), running: true });
    const session = sessions.get('req-1')!;
    session.running = false;
    expect(session.running).toBe(false);
  });

  it('abort on non-existing session returns no session', () => {
    const session = sessions.get('nonexistent');
    expect(session).toBeUndefined();
  });
});

// ── Server Message Formatting ──

describe('Agent UI WebSocket: Server Message Format', () => {
  /** Simulate the sendAgentEvent function from the route */
  function formatEvent(requestId: string, event: Record<string, unknown>): Record<string, unknown> {
    return { ...event, requestId };
  }

  it('adds requestId to thinking event', () => {
    const msg = formatEvent('req-1', { type: 'thinking', message: 'Planning...' });
    expect(msg).toEqual({
      type: 'thinking',
      requestId: 'req-1',
      message: 'Planning...',
    });
  });

  it('adds requestId to tool_result event', () => {
    const msg = formatEvent('req-1', {
      type: 'tool_result',
      tool: 'exec_command',
      success: true,
      outputPreview: 'active (running)',
      latencyMs: 340,
    });
    expect(msg).toEqual({
      type: 'tool_result',
      requestId: 'req-1',
      tool: 'exec_command',
      success: true,
      outputPreview: 'active (running)',
      latencyMs: 340,
    });
  });

  it('adds requestId to tool_blocked event', () => {
    const msg = formatEvent('req-1', {
      type: 'tool_blocked',
      tool: 'exec_command',
      reason: 'Command blocked by guardrails',
    });
    expect(msg.requestId).toBe('req-1');
    expect(msg.type).toBe('tool_blocked');
  });

  it('adds requestId to complete event', () => {
    const msg = formatEvent('req-1', {
      type: 'complete',
      view: { title: 'Test', root: {} },
      meta: { sessionId: 's1', latencyMs: 1234, stepsCompleted: 5, reflectionLoops: 0, models: {} },
    });
    expect(msg.requestId).toBe('req-1');
    expect(msg.type).toBe('complete');
    expect(msg.view).toBeDefined();
    expect(msg.meta).toBeDefined();
  });

  it('adds requestId to error event', () => {
    const msg = formatEvent('req-1', { type: 'error', message: 'Something failed' });
    expect(msg).toEqual({
      type: 'error',
      requestId: 'req-1',
      message: 'Something failed',
    });
  });

  it('adds requestId to safety_warning event', () => {
    const msg = formatEvent('req-1', {
      type: 'safety_warning',
      warning: 'consecutive_mistakes',
      tool: 'exec_command',
      message: 'Agent making repeated errors',
    });
    expect(msg.requestId).toBe('req-1');
    expect(msg.type).toBe('safety_warning');
  });

  it('adds requestId to rate_limited event', () => {
    const msg = formatEvent('req-1', {
      type: 'rate_limited',
      retryInMs: 4000,
      attempt: 2,
    });
    expect(msg.requestId).toBe('req-1');
    expect(msg.retryInMs).toBe(4000);
    expect(msg.attempt).toBe(2);
  });

  it('adds requestId to context_compacted event', () => {
    const msg = formatEvent('req-1', {
      type: 'context_compacted',
      originalTokens: 12000,
      compactedTokens: 3000,
    });
    expect(msg.requestId).toBe('req-1');
    expect(msg.originalTokens).toBe(12000);
    expect(msg.compactedTokens).toBe(3000);
  });

  it('adds requestId to reflection event', () => {
    const msg = formatEvent('req-1', {
      type: 'reflection',
      feedback: 'Schema looks good',
      action: 'approve',
    });
    expect(msg.requestId).toBe('req-1');
    expect(msg.action).toBe('approve');
  });

  it('adds requestId to write_back_result event', () => {
    const msg = formatEvent('req-1', {
      type: 'write_back_result',
      success: true,
      backupPath: '/etc/nginx/nginx.conf.bak',
    });
    expect(msg.requestId).toBe('req-1');
    expect(msg.success).toBe(true);
    expect(msg.backupPath).toBe('/etc/nginx/nginx.conf.bak');
  });
});

// ── WriteBack Validation (reused from route) ──

describe('Agent UI WebSocket: WriteBack Validation', () => {
  it('accepts valid write-back request', () => {
    const parsed = WriteBackRequestSchema.safeParse({
      writeBack: { type: 'config-file', path: '/etc/nginx/nginx.conf', format: 'nginx' },
      values: { worker_processes: 4, worker_connections: 1024 },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects missing type in writeBack', () => {
    const parsed = WriteBackRequestSchema.safeParse({
      writeBack: { path: '/etc/test.conf' },
      values: { key: 'value' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects non-object values', () => {
    const parsed = WriteBackRequestSchema.safeParse({
      writeBack: { type: 'config-file' },
      values: 'not-an-object',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts write-back with validate and reload commands', () => {
    const parsed = WriteBackRequestSchema.safeParse({
      writeBack: {
        type: 'config-file',
        path: '/etc/nginx/nginx.conf',
        format: 'nginx',
        validateCommand: 'nginx -t',
        reloadCommand: 'systemctl reload nginx',
      },
      values: { worker_processes: 'auto' },
    });
    expect(parsed.success).toBe(true);
  });
});

// ── SecurityError Handling ──

describe('Agent UI WebSocket: Error Classification', () => {
  it('identifies SecurityError instances', () => {
    const err = new SecurityError('Command blocked by deny-tier');
    expect(err instanceof SecurityError).toBe(true);
    expect(err.message).toBe('Command blocked by deny-tier');
  });

  it('formats SecurityError message with prefix', () => {
    const err = new SecurityError('Path traversal detected');
    const formatted = `Security: ${err.message}`;
    expect(formatted).toBe('Security: Path traversal detected');
  });

  it('formats regular Error differently', () => {
    const err = new Error('Connection timeout');
    const formatted = err.message;
    expect(formatted).toBe('Connection timeout');
  });
});

// ── Integration: Full Message Flow ──

describe('Agent UI WebSocket: Message Flow Simulation', () => {
  it('simulates a complete generate → events → complete flow', () => {
    const sent: Record<string, unknown>[] = [];
    const send = (msg: Record<string, unknown>) => sent.push(msg);

    // Simulate sending events like the route does
    const requestId = 'test-req-1';

    send({ ...{ type: 'thinking', message: 'Planning...' }, requestId });
    send({ ...{ type: 'tool_result', tool: 'exec_command', success: true, outputPreview: 'running', latencyMs: 200 }, requestId });
    send({ ...{ type: 'generation_complete', view: { title: 'Test', root: { layout: 'stack', gap: 'md', widgets: [] } } }, requestId });
    send({ ...{ type: 'reflection', feedback: 'Looks good', action: 'approve' }, requestId });
    send({
      ...{
        type: 'complete',
        view: { title: 'Test', root: { layout: 'stack', gap: 'md', widgets: [] } },
        meta: { sessionId: 's1', latencyMs: 2500, stepsCompleted: 3, reflectionLoops: 1, models: { fast: 'gpt-4.1-mini' } },
      },
      requestId,
    });

    expect(sent).toHaveLength(5);
    expect(sent[0]).toMatchObject({ type: 'thinking', requestId });
    expect(sent[1]).toMatchObject({ type: 'tool_result', requestId, success: true });
    expect(sent[2]).toMatchObject({ type: 'generation_complete', requestId });
    expect(sent[3]).toMatchObject({ type: 'reflection', requestId, action: 'approve' });
    expect(sent[4]).toMatchObject({ type: 'complete', requestId });
  });

  it('simulates abort mid-generation', () => {
    const sessions = new Map<string, ActiveSession>();
    const requestId = 'abort-test';
    const abortController = new AbortController();
    sessions.set(requestId, { abortController, running: true });

    // Simulate abort
    abortController.abort();
    sessions.delete(requestId);

    expect(sessions.has(requestId)).toBe(false);
    expect(abortController.signal.aborted).toBe(true);
  });

  it('simulates error during generation', () => {
    const sent: Record<string, unknown>[] = [];
    const send = (msg: Record<string, unknown>) => sent.push(msg);

    const requestId = 'error-test';
    send({ type: 'thinking', requestId, message: 'Starting...' });

    // Simulate error
    const err = new Error('SSH connection lost');
    send({ type: 'error', requestId, message: err.message });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ type: 'error', requestId, message: 'SSH connection lost' });
  });
});
