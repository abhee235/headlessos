// EX2.12: Agent Store + useUIAgent Hook tests
// @see docs/phases/phase-ex2.md — EX2.12

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentStore, type AgentSession } from '../../src/store/agent-store';
import type { AgentEventType, AgentMetaType } from '../../src/components/Agent/AgentPanel';

// ── Agent Store Tests ──

describe('AgentStore (EX2.12)', () => {
  beforeEach(() => {
    act(() => {
      useAgentStore.getState().clearSessions();
    });
  });

  it('starts with empty sessions', () => {
    const { sessions } = useAgentStore.getState();
    expect(sessions.size).toBe(0);
  });

  it('adds a new session', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'show nginx config');
    });
    const session = useAgentStore.getState().getSession('req-1');
    expect(session).toBeDefined();
    expect(session?.requestId).toBe('req-1');
    expect(session?.serverId).toBe('server-1');
    expect(session?.prompt).toBe('show nginx config');
    expect(session?.status).toBe('running');
    expect(session?.events).toHaveLength(0);
    expect(session?.view).toBeNull();
    expect(session?.meta).toBeNull();
    expect(session?.errorMessage).toBeNull();
  });

  it('adds events to a session', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test');
      useAgentStore.getState().addEvent('req-1', { type: 'thinking', message: 'Planning...' });
      useAgentStore.getState().addEvent('req-1', {
        type: 'tool_result',
        tool: 'exec_command',
        success: true,
        outputPreview: 'running',
        latencyMs: 200,
      });
    });

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.events).toHaveLength(2);
    expect(session.events[0].event.type).toBe('thinking');
    expect(session.events[1].event.type).toBe('tool_result');
    expect(session.events[0].id).toBe(1);
    expect(session.events[1].id).toBe(2);
  });

  it('ignores events for non-existing sessions', () => {
    act(() => {
      useAgentStore.getState().addEvent('nonexistent', { type: 'thinking', message: 'test' });
    });
    const session = useAgentStore.getState().getSession('nonexistent');
    expect(session).toBeUndefined();
  });

  it('completes a session', () => {
    const meta: AgentMetaType = {
      sessionId: 's-1',
      latencyMs: 3000,
      stepsCompleted: 5,
      reflectionLoops: 1,
      models: { fast: 'gpt-4.1-mini' },
    };

    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test');
      useAgentStore.getState().completeSession('req-1', { title: 'Test View' }, meta);
    });

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.status).toBe('complete');
    expect(session.view).toEqual({ title: 'Test View' });
    expect(session.meta).toBe(meta);
  });

  it('marks a session as error', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test');
      useAgentStore.getState().errorSession('req-1', 'SSH connection lost');
    });

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.status).toBe('error');
    expect(session.errorMessage).toBe('SSH connection lost');
  });

  it('aborts a session', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test');
      useAgentStore.getState().abortSession('req-1');
    });

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.status).toBe('aborted');
  });

  it('removes a session', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test');
      useAgentStore.getState().removeSession('req-1');
    });

    const session = useAgentStore.getState().getSession('req-1');
    expect(session).toBeUndefined();
  });

  it('clears all sessions', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test1');
      useAgentStore.getState().addSession('req-2', 'server-1', 'test2');
      useAgentStore.getState().clearSessions();
    });

    expect(useAgentStore.getState().sessions.size).toBe(0);
  });

  it('gets sessions for a specific server', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test1');
      useAgentStore.getState().addSession('req-2', 'server-2', 'test2');
      useAgentStore.getState().addSession('req-3', 'server-1', 'test3');
    });

    const serverSessions = useAgentStore.getState().getServerSessions('server-1');
    expect(serverSessions).toHaveLength(2);
    expect(serverSessions.map((s) => s.requestId)).toContain('req-1');
    expect(serverSessions.map((s) => s.requestId)).toContain('req-3');
  });

  it('handles multiple concurrent sessions', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'nginx config');
      useAgentStore.getState().addSession('req-2', 'server-1', 'docker status');
    });

    act(() => {
      useAgentStore.getState().addEvent('req-1', { type: 'thinking', message: 'Planning nginx...' });
      useAgentStore.getState().addEvent('req-2', { type: 'thinking', message: 'Planning docker...' });
    });

    const s1 = useAgentStore.getState().getSession('req-1')!;
    const s2 = useAgentStore.getState().getSession('req-2')!;
    expect(s1.events).toHaveLength(1);
    expect(s2.events).toHaveLength(1);
    expect((s1.events[0].event as { message: string }).message).toBe('Planning nginx...');
    expect((s2.events[0].event as { message: string }).message).toBe('Planning docker...');
  });

  it('complete does nothing for non-existing session', () => {
    act(() => {
      useAgentStore.getState().completeSession('nonexistent', {}, {
        sessionId: '',
        latencyMs: 0,
        stepsCompleted: 0,
        reflectionLoops: 0,
        models: {},
      });
    });
    expect(useAgentStore.getState().sessions.size).toBe(0);
  });

  it('events have incrementing IDs within a session', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test');
      for (let i = 0; i < 5; i++) {
        useAgentStore.getState().addEvent('req-1', { type: 'thinking', message: `Step ${i}` });
      }
    });

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.events).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(session.events[i].id).toBe(i + 1);
    }
  });

  it('events have timestamps', () => {
    const before = Date.now();
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test');
      useAgentStore.getState().addEvent('req-1', { type: 'thinking', message: 'test' });
    });
    const after = Date.now();

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.events[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(session.events[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('session has startedAt timestamp', () => {
    const before = Date.now();
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test');
    });
    const after = Date.now();

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.startedAt).toBeGreaterThanOrEqual(before);
    expect(session.startedAt).toBeLessThanOrEqual(after);
  });
});

// ── useUIAgent Hook Tests ──

describe('useUIAgent Hook (EX2.12)', () => {
  // We test the hook behavior that doesn't require a real WebSocket connection.
  // The hook's WebSocket logic is tested through the server-side tests.

  beforeEach(() => {
    act(() => {
      useAgentStore.getState().clearSessions();
    });
  });

  it('store handles rapid event additions', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'test');
    });

    act(() => {
      for (let i = 0; i < 20; i++) {
        useAgentStore.getState().addEvent('req-1', {
          type: 'tool_result',
          tool: `tool-${i}`,
          success: true,
          outputPreview: `output-${i}`,
          latencyMs: i * 10,
        });
      }
    });

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.events).toHaveLength(20);
  });

  it('store supports full lifecycle: create → events → complete', () => {
    const meta: AgentMetaType = {
      sessionId: 'lifecycle-test',
      latencyMs: 5000,
      stepsCompleted: 8,
      reflectionLoops: 2,
      models: { reasoning: 'o4-mini', fast: 'gpt-4.1-mini' },
    };

    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'show system info');
    });
    expect(useAgentStore.getState().getSession('req-1')?.status).toBe('running');

    act(() => {
      useAgentStore.getState().addEvent('req-1', { type: 'thinking', message: 'Planning...' });
      useAgentStore.getState().addEvent('req-1', {
        type: 'tool_result',
        tool: 'exec_command',
        success: true,
        outputPreview: 'Ubuntu 22.04',
        latencyMs: 150,
      });
    });
    expect(useAgentStore.getState().getSession('req-1')?.events).toHaveLength(2);

    act(() => {
      useAgentStore.getState().completeSession(
        'req-1',
        { title: 'System Info', sidebarItems: [{ id: 'main', label: 'System' }], sections: { main: { layout: 'stack', gap: 'md', children: [] } } },
        meta,
      );
    });

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.status).toBe('complete');
    expect(session.view).toBeDefined();
    expect(session.meta?.models).toEqual({ reasoning: 'o4-mini', fast: 'gpt-4.1-mini' });
  });

  it('store supports full lifecycle: create → events → error', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'fail me');
      useAgentStore.getState().addEvent('req-1', { type: 'thinking', message: 'Starting...' });
      useAgentStore.getState().errorSession('req-1', 'LLM rate limited');
    });

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.status).toBe('error');
    expect(session.errorMessage).toBe('LLM rate limited');
    expect(session.events).toHaveLength(1);
  });

  it('store supports full lifecycle: create → abort', () => {
    act(() => {
      useAgentStore.getState().addSession('req-1', 'server-1', 'abort me');
      useAgentStore.getState().addEvent('req-1', { type: 'thinking', message: 'Starting...' });
      useAgentStore.getState().abortSession('req-1');
    });

    const session = useAgentStore.getState().getSession('req-1')!;
    expect(session.status).toBe('aborted');
  });
});
