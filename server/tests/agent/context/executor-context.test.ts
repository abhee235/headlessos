// EX10.4: UI Agent executor on the context manager; stopping early keeps the last good view
// @see docs/phases/phase-ex10.md §5

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ReactiveExecutor, VIEW_CUT_OFF, emptySections, type AgentEvent } from '../../../src/agent/executor.js';
import { ToolRegistry } from '../../../src/agent/tools/tool-registry.js';
import { updateViewTool } from '../../../src/agent/tools/update-view.js';
import { UIAgent, type UIAgentEvent } from '../../../src/agent/ui-agent.js';
import { planContext } from '../../../src/agent/context/plan.js';
import { SUMMARY_SYSTEM } from '../../../src/agent/context/manager.js';
import type { AgentTool, ToolContext } from '../../../src/agent/tools/types.js';
import type { ChatMessage, ChatWithToolsResult } from '../../../src/llm/provider.js';
import type { PlannerHints } from '../../../src/agent/planner.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

const hints = {
  intent: 'Docker overview', interactivityLevel: 'display-only', expectedWidgets: ['table'], templateHint: null,
  dataSourceHints: ['containers'], suggestedLayout: 'stack', suggestedSections: ['Containers', 'Images'],
  securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false }, estimatedComplexity: 'medium', skipPostReflection: true,
} as unknown as PlannerHints;

const SKELETON = {
  title: 'Docker', sidebarItems: [{ id: 'containers', label: 'Containers' }, { id: 'images', label: 'Images' }],
  sections: {
    containers: { layout: 'stack', gap: 'md', children: [{ type: 'stat-card', title: 'Running', value: '4' }] },
    images: { layout: 'stack', gap: 'md', children: [] },
  },
};

let callId = 0;
const reply = (o: { call?: string; args?: unknown; text?: string; finishReason?: ChatWithToolsResult['finishReason']; input?: number }): ChatWithToolsResult => ({
  message: o.call
    ? { role: 'assistant', content: null, tool_calls: [{ id: `c${++callId}`, type: 'function', function: { name: o.call, arguments: JSON.stringify(o.args ?? {}) } }] }
    : { role: 'assistant', content: o.text ?? null },
  tokensUsed: { input: o.input ?? 0, output: 1 },
  latencyMs: 1,
  model: 'm',
  finishReason: o.finishReason ?? (o.call ? 'tool_calls' : 'stop'),
});

/** An action-like tool whose every result differs and is long */
function bigAction(chars: number): AgentTool {
  let n = 0;
  return {
    name: 'docker_containers', description: 'list containers', securityTier: 'action', parameters: z.object({}),
    execute: vi.fn(async () => ({ success: true, output: `${++n}${'x'.repeat(chars)}`, metadata: { command: 'docker ps' } })),
  };
}

function run(chat: ReturnType<typeof vi.fn> | ((...a: never[]) => unknown), tools: AgentTool[], context: Partial<ToolContext> = {}): Promise<AgentEvent[]> {
  const registry = new ToolRegistry();
  for (const t of tools) registry.register(t);
  const router = { chat, toolProvider: null } as never;
  const executor = new ReactiveExecutor(router, registry);
  const ctx = { serverId: 's', previousOutputs: new Map(), ...context } as unknown as ToolContext;
  return (async () => {
    const out: AgentEvent[] = [];
    for await (const e of executor.execute(hints, ctx)) out.push(e);
    return out;
  })();
}

describe('executor context handling', () => {
  /** Scripted replies; a compaction summary request (EX10.2) gets a summary instead */
  function scripted(replies: ChatWithToolsResult[]) {
    const queue = [...replies];
    return vi.fn(async (input: { messages: ChatMessage[] }) => {
      if (input.messages[0]?.content === SUMMARY_SYSTEM) return reply({ text: 'Found so far: 4 containers running.' });
      const next = queue.shift();
      if (!next) throw new Error('script ended');
      return next;
    });
  }

  it('compacts before a call once the history reaches the plan’s trigger, and says so', async () => {
    const chat = scripted([
      ...Array.from({ length: 6 }, () => reply({ call: 'docker_containers' })),
      reply({ text: 'no tools' }), reply({ text: 'no tools' }), reply({ text: 'no tools' }),
    ]);
    const plan = planContext({ contextWindow: 8_192, maxOutputTokens: 2_048, local: true });
    const events = await run(chat, [bigAction(4_000)], { plan });
    expect(events.some((e) => e.type === 'thinking' && e.message.startsWith('Made room in the model’s context'))).toBe(true);
    const turns = chat.mock.calls.map((c) => c[0].messages as ChatMessage[]).filter((m) => m[0]?.content !== SUMMARY_SYSTEM);
    const seventh = turns[6]!;
    expect(seventh.some((m) => m.content?.startsWith('[output trimmed — docker_containers') || m.content?.startsWith('[Earlier steps, summarized'))).toBe(true);
    // every tool result still has its call
    const ids = new Set(seventh.flatMap((m) => m.tool_calls ?? []).map((tc) => tc.id));
    expect(seventh.filter((m) => m.role === 'tool').every((m) => ids.has(m.tool_call_id!))).toBe(true);
    // the request survives verbatim
    expect(seventh[1]).toEqual(turns[0]![1]);
  });

  it('answers a cut-off reply with a reminder, not a "text only" nudge', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply({ text: '{"view": {"title":', finishReason: 'length' }))
      .mockResolvedValueOnce(reply({ call: 'update_view', args: { view: JSON.stringify(SKELETON) } }))
      .mockResolvedValue(reply({ text: 'half', finishReason: 'length' }));
    const events = await run(chat, [updateViewTool]);
    const second = chat.mock.calls[1]![0].messages as ChatMessage[];
    expect(second.at(-1)).toEqual({ role: 'user', content: VIEW_CUT_OFF });
    expect(second.some((m) => m.content === '{"view": {"title":')).toBe(false);
    // three more cut-offs in a row: the run ends with the last good view and the reason
    const last = events.at(-1)!;
    expect(last).toMatchObject({ type: 'generation_incomplete', reason: 'the model’s replies kept getting cut off at its output limit', emptySections: ['Images'] });
    expect(events.some((e) => e.type === 'safety_warning')).toBe(false);
  });

  it('says why when it stops before any valid view', async () => {
    const chat = vi.fn().mockResolvedValue(reply({ text: 'half', finishReason: 'length' }));
    const events = await run(chat, [updateViewTool]);
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Stopped: the model’s replies kept getting cut off at its output limit, before any complete view was built.' });
  });

  it('keeps the partial view when the model stops calling tools', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(reply({ call: 'update_view', args: { view: JSON.stringify(SKELETON) } }))
      .mockResolvedValue(reply({ text: 'I think that is all.' }));
    const events = await run(chat, [updateViewTool]);
    expect(events.some((e) => e.type === 'safety_warning')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'generation_incomplete', reason: 'the model stopped calling tools', emptySections: ['Images'] });
  });

  it('forces a compaction and retries after an overflow error, then stops with the view', async () => {
    const overflow = new Error('Ollama answered 400: input is too long for the context window');
    const chat = vi.fn()
      .mockResolvedValueOnce(reply({ call: 'update_view', args: { view: JSON.stringify(SKELETON) } }))
      .mockRejectedValueOnce(overflow)
      .mockResolvedValueOnce(reply({ call: 'docker_containers' }))
      .mockRejectedValue(overflow);
    const events = await run(chat, [updateViewTool, bigAction(100)]);
    expect(chat).toHaveBeenCalledTimes(5); // 1 ok, 1 overflow + retry ok, then 1 + 2 retries
    expect(events.at(-1)).toMatchObject({ type: 'generation_incomplete', reason: 'the model’s context window is full' });
  });

  it('rethrows other errors', async () => {
    const chat = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));
    await expect(run(chat, [updateViewTool])).rejects.toThrow('401 Unauthorized');
  });

  it('emptySections names the sidebar items with nothing in them, tabs included', () => {
    const view = {
      title: 't',
      sidebarItems: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
      sections: {
        a: { layout: 'stack', children: [{ type: 'alert', message: 'x' }] },
        b: { layout: 'tabs', tabs: [{ id: 't1', label: 'T1', children: [] }] },
        c: { layout: 'grid', columns: 2, children: [] },
      },
    } as unknown as DynamicView;
    expect(emptySections(view)).toEqual(['B', 'C']);
  });
});

describe('UI Agent with an early stop', () => {
  const agentWith = (events: AgentEvent[], reflector = { reflect: vi.fn(), shouldSkip: vi.fn().mockReturnValue(false) }) => new UIAgent({
    modelRouter: { getModelMap: vi.fn().mockReturnValue({}), toolProvider: null } as never,
    planner: { plan: vi.fn().mockResolvedValue({ ...hints, skipPostReflection: false }) } as never,
    executor: {
      execute: vi.fn(async function* () { yield* events; }),
      executeWithFixes: vi.fn(async function* () { yield* events; }),
    } as never,
    reflector: reflector as never,
    ssh: { exec: vi.fn(), getSftp: vi.fn() } as never,
    templateRegistry: {} as never,
  });
  const collect = async (agent: UIAgent) => {
    const out: UIAgentEvent[] = [];
    for await (const e of agent.generate('srv', 'docker overview')) out.push(e);
    return out;
  };

  it('completes with the partial view, the reason and the empty sections, and skips the review', async () => {
    const view = SKELETON as unknown as DynamicView;
    const reflector = { reflect: vi.fn(), shouldSkip: vi.fn().mockReturnValue(false) };
    const events = await collect(agentWith([{ type: 'generation_incomplete', view, reason: 'the model’s context window is full', emptySections: ['Images'] }], reflector));
    const complete = events.at(-1) as Extract<UIAgentEvent, { type: 'complete' }>;
    expect(complete.type).toBe('complete');
    expect(complete.view).toBe(view);
    expect(complete.meta).toMatchObject({ warning: 'Stopped early — 1 section empty', incomplete: { reason: 'the model’s context window is full', emptySections: ['Images'] } });
    expect(reflector.reflect).not.toHaveBeenCalled();
  });

  it('keeps the reviewed view when a fix attempt stops early', async () => {
    const good = { ...SKELETON, title: 'Reviewed' } as unknown as DynamicView;
    const reflector = { reflect: vi.fn().mockResolvedValue({ approved: false, issues: [{ severity: 'critical', description: 'x' }], summary: 's' }), shouldSkip: vi.fn().mockReturnValue(false) };
    const agent = agentWith([], reflector);
    const exec = (agent as unknown as { executor: { execute: ReturnType<typeof vi.fn>; executeWithFixes: ReturnType<typeof vi.fn> } }).executor;
    exec.execute.mockImplementation(async function* () { yield { type: 'generation_complete', view: good }; });
    exec.executeWithFixes.mockImplementation(async function* () { yield { type: 'generation_incomplete', view: SKELETON, reason: 'it reached the maximum step limit (30)', emptySections: ['Images'] }; });
    const events = await collect(agent);
    const complete = events.at(-1) as Extract<UIAgentEvent, { type: 'complete' }>;
    expect(complete.view).toBe(good);
    expect(complete.meta.warning).toBe('The fix attempt stopped early (it reached the maximum step limit (30)); showing the earlier version');
  });
});
