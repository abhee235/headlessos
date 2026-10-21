// EX8.24: investigation progress — client-chosen session id, every step streamed
import { describe, it, expect, vi } from 'vitest';
import { InvestigationAgent } from '../../src/agent/investigation-agent.js';

function agentWith(thoughts: Array<Record<string, unknown>>) {
  const parseText = vi.fn();
  for (const data of thoughts) parseText.mockResolvedValueOnce({ data, tokensUsed: { input: 10, output: 5 } });
  const ssh = { exec: vi.fn().mockResolvedValue({ stdout: 'Mem: 16G 9G', stderr: '', exitCode: 0 }) };
  return new InvestigationAgent(ssh as never, { parseText } as never);
}

// EX9.1: the model names an action; the server builds the command
const RUN_FREE = { thought: 'Check memory', action: 'memory_usage', params: '{}', answer: null, decision: 'run_action' };
const ANSWER = { thought: 'Enough data', action: null, params: null, answer: '9 of 16 GB used', decision: 'answer' };

describe('InvestigationAgent progress (EX8.24)', () => {
  it('uses the session id the client chose and streams thought → step for every step', async () => {
    const agent = agentWith([RUN_FREE, ANSWER]);
    const events: Array<Record<string, unknown>> = [];
    agent.events.on('step:client-session-1', (e) => events.push(e));

    const result = await agent.investigate('s1', 'Why is memory high?', { sessionId: 'client-session-1' });

    expect(result.sessionId).toBe('client-session-1');
    expect(events.map((e) => `${e.kind}:${e.step}`)).toEqual(['thought:1', 'step:1', 'thought:2', 'step:2']);
    expect(events[0]).toMatchObject({ thought: 'Check memory', decision: 'run_action', action: 'memory_usage', command: 'free -m' });
    expect(events[1]).toMatchObject({ data: { stepNumber: 1, action: 'memory_usage', command: 'free -m', output: 'Mem: 16G 9G', decision: 'continue' } });
    expect(events[3]).toMatchObject({ data: { stepNumber: 2, decision: 'answer' } });
    // the streamed steps are the steps of the result
    expect(events.filter((e) => e.kind === 'step').map((e) => e.data)).toEqual(result.steps);
  });

  it('ignores a session id that does not look like one', async () => {
    const agent = agentWith([ANSWER]);
    const result = await agent.investigate('s1', 'q', { sessionId: '../../etc' });
    expect(result.sessionId).not.toBe('../../etc');
    expect(result.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stops at the next step when aborted with that id', async () => {
    const agent = agentWith([RUN_FREE, RUN_FREE, ANSWER]);
    agent.events.on('step:abort-me-123', (e) => { if (e.kind === 'step') agent.abort('abort-me-123'); });
    const result = await agent.investigate('s1', 'q', { sessionId: 'abort-me-123' });
    expect(result.status).toBe('aborted');
    expect(result.steps).toHaveLength(1);
  });
});
