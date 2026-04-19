// EX6-A.3: SessionStateSchema unit tests
// @see docs/phases/phase-ex6.md

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  SessionStateSchema,
  SessionPreferenceOverridesSchema,
  PersistedAgentMessageSchema,
  AGENT_HISTORY_CAP,
  createEmptySessionState,
  trimAgentHistory,
  type SessionState,
  type PersistedAgentMessage,
} from 'headlessos-shared/schemas/session';

const validSession: SessionState = {
  schemaVersion: 1,
  serverId: 'srv-1',
  lifecycle: 'active',
  lastActiveAt: '2026-04-18T12:00:00.000Z',
  windows: [
    {
      id: 'win-1',
      appId: 'dashboard',
      title: 'Dashboard',
      icon: 'dashboard',
      x: 100,
      y: 100,
      width: 800,
      height: 600,
      minimized: false,
      maximized: false,
      zIndex: 1,
    },
  ],
  nextZIndex: 2,
  preferenceOverrides: { accentColorIndex: 3 },
  agentHistory: [],
  pinnedDynamicViewIds: [],
  unreadNotificationCount: 0,
};

describe('SessionStateSchema', () => {
  it('parses a valid session', () => {
    const parsed = SessionStateSchema.parse(validSession);
    expect(parsed.serverId).toBe('srv-1');
    expect(parsed.windows).toHaveLength(1);
  });

  it('round-trips JSON', () => {
    const parsed = SessionStateSchema.parse(validSession);
    const reparsed = SessionStateSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  it('rejects unknown schemaVersion', () => {
    const bad = { ...validSession, schemaVersion: 2 };
    expect(() => SessionStateSchema.parse(bad)).toThrow(ZodError);
  });

  it('rejects missing required fields', () => {
    const { serverId: _serverId, ...incomplete } = validSession;
    expect(() => SessionStateSchema.parse(incomplete)).toThrow(ZodError);
  });

  it('rejects invalid lifecycle', () => {
    const bad = { ...validSession, lifecycle: 'frozen' };
    expect(() => SessionStateSchema.parse(bad)).toThrow(ZodError);
  });

  it('enforces agent-history cap on parse', () => {
    const overflow: PersistedAgentMessage[] = Array.from({ length: AGENT_HISTORY_CAP + 1 }, (_, i) => ({
      requestId: `req-${i}`,
      prompt: 'p',
      status: 'complete' as const,
      startedAt: '2026-04-18T12:00:00.000Z',
    }));
    const bad = { ...validSession, agentHistory: overflow };
    expect(() => SessionStateSchema.parse(bad)).toThrow(ZodError);
  });

  it('rejects negative dimensions', () => {
    const bad = {
      ...validSession,
      windows: [{ ...validSession.windows[0], width: -10 }],
    };
    expect(() => SessionStateSchema.parse(bad)).toThrow(ZodError);
  });
});

describe('SessionPreferenceOverridesSchema', () => {
  it('accepts empty overrides', () => {
    expect(SessionPreferenceOverridesSchema.parse({})).toEqual({});
  });

  it('rejects unknown preference keys (strict mode)', () => {
    expect(() =>
      SessionPreferenceOverridesSchema.parse({ unknownKey: 'x' }),
    ).toThrow(ZodError);
  });

  it('validates terminalFontSize bounds', () => {
    expect(() =>
      SessionPreferenceOverridesSchema.parse({ terminalFontSize: 4 }),
    ).toThrow(ZodError);
    expect(() =>
      SessionPreferenceOverridesSchema.parse({ terminalFontSize: 64 }),
    ).toThrow(ZodError);
    expect(SessionPreferenceOverridesSchema.parse({ terminalFontSize: 14 }))
      .toEqual({ terminalFontSize: 14 });
  });

  it('validates autoRefreshInterval bounds', () => {
    expect(() =>
      SessionPreferenceOverridesSchema.parse({ autoRefreshInterval: -1 }),
    ).toThrow(ZodError);
    expect(() =>
      SessionPreferenceOverridesSchema.parse({ autoRefreshInterval: 9999 }),
    ).toThrow(ZodError);
    expect(SessionPreferenceOverridesSchema.parse({ autoRefreshInterval: 30 }))
      .toEqual({ autoRefreshInterval: 30 });
  });
});

describe('PersistedAgentMessageSchema', () => {
  it('accepts a complete message', () => {
    const msg: PersistedAgentMessage = {
      requestId: 'req-1',
      prompt: 'show me disk usage',
      status: 'complete',
      startedAt: '2026-04-18T12:00:00.000Z',
      completedAt: '2026-04-18T12:00:05.000Z',
      viewTitle: 'Disk Usage',
      meta: { latencyMs: 5000, stepsCompleted: 3, reflectionLoops: 0 },
    };
    expect(PersistedAgentMessageSchema.parse(msg)).toEqual(msg);
  });

  it('rejects invalid status', () => {
    expect(() =>
      PersistedAgentMessageSchema.parse({
        requestId: 'r',
        prompt: 'p',
        status: 'pending',
        startedAt: '2026-04-18T12:00:00.000Z',
      }),
    ).toThrow(ZodError);
  });
});

describe('createEmptySessionState', () => {
  it('produces a valid session', () => {
    const s = createEmptySessionState('srv-x');
    expect(() => SessionStateSchema.parse(s)).not.toThrow();
    expect(s.serverId).toBe('srv-x');
    expect(s.lifecycle).toBe('active');
    expect(s.windows).toEqual([]);
    expect(s.agentHistory).toEqual([]);
  });
});

describe('trimAgentHistory', () => {
  it('returns array unchanged when under cap', () => {
    const h: PersistedAgentMessage[] = Array.from({ length: 10 }, (_, i) => ({
      requestId: `r-${i}`,
      prompt: 'p',
      status: 'complete' as const,
      startedAt: '2026-04-18T12:00:00.000Z',
    }));
    expect(trimAgentHistory(h)).toBe(h);
  });

  it('keeps the most recent entries when over cap', () => {
    const h: PersistedAgentMessage[] = Array.from({ length: AGENT_HISTORY_CAP + 5 }, (_, i) => ({
      requestId: `r-${i}`,
      prompt: 'p',
      status: 'complete' as const,
      startedAt: '2026-04-18T12:00:00.000Z',
    }));
    const trimmed = trimAgentHistory(h);
    expect(trimmed).toHaveLength(AGENT_HISTORY_CAP);
    expect(trimmed[0].requestId).toBe('r-5');
    expect(trimmed[AGENT_HISTORY_CAP - 1].requestId).toBe(`r-${AGENT_HISTORY_CAP + 4}`);
  });
});
