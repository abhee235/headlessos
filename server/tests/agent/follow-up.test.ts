// EX10.9: follow-up requests refine the open view; unclear requests get a question
// @see docs/phases/phase-ex10.md §9c

import { describe, it, expect, vi } from 'vitest';
import { MAX_FOLLOW_UP_VIEW_BYTES, VAGUE_QUESTION, namesNothing, outlineView, readFollowUp } from '../../src/agent/follow-up.js';
import { Planner, PlannerHintsSchema, type PlannerHints } from '../../src/agent/planner.js';
import { UIAgent, type UIAgentEvent } from '../../src/agent/ui-agent.js';
import { ReactiveExecutor, type AgentEvent } from '../../src/agent/executor.js';
import { ToolRegistry } from '../../src/agent/tools/tool-registry.js';
import { LOCAL_AGENT_TOOLS } from '../../src/agent/tools/index.js';
import { TemplateRegistry } from '../../src/dynamic-ui/template-registry.js';
import { WorkingView } from '../../src/dynamic-ui/working-view.js';
import type { ToolContext } from '../../src/agent/tools/types.js';
import type { ChatMessage, ChatWithToolsResult } from '../../src/llm/provider.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

const VIEW: DynamicView = {
  title: 'Disk',
  sidebarItems: [{ id: 'disk', label: 'Disk' }, { id: 'more', label: 'Details' }],
  sections: {
    disk: { layout: 'stack', gap: 'md', children: [{ type: 'table', title: 'Filesystems', columns: [{ key: 'mount', label: 'Mount', type: 'text', sortable: false }], rows: [{ mount: '/' }] }, { type: 'stat-card', title: 'Root', value: '6', unit: '%' }] },
    more: { layout: 'tabs', tabs: [{ id: 'logs', label: 'Logs', children: [{ type: 'alert', message: 'quiet', variant: 'default' }] }] },
  },
} as unknown as DynamicView;

const hints = (over: Partial<PlannerHints> = {}): PlannerHints => ({
  intent: 'Disk usage with a memory chart', interactivityLevel: 'display-only', expectedWidgets: ['table'], templateHint: null,
  dataSourceHints: ['disk'], suggestedLayout: 'stack', suggestedSections: ['Disk'],
  securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false }, estimatedComplexity: 'simple', skipPostReflection: true,
  ...over,
});

describe('reading a follow-up (EX10.9)', () => {
  it('takes the earlier request and a valid view; anything else is a new request', () => {
    expect(readFollowUp({ prompt: ' show disk ', view: VIEW })).toMatchObject({ prompt: 'show disk', view: { title: 'Disk' } });
    expect(readFollowUp({ prompt: 'show disk', view: { title: 'no sections' } })).toBeNull();
    expect(readFollowUp({ prompt: '', view: VIEW })).toBeNull();
    expect(readFollowUp({ prompt: 'x'.repeat(2_001), view: VIEW })).toBeNull();
    expect(readFollowUp({ prompt: 'big', view: { ...VIEW, description: 'x'.repeat(MAX_FOLLOW_UP_VIEW_BYTES) } })).toBeNull();
    expect(readFollowUp(undefined)).toBeNull();
  });

  it('outlines the view, with positions for the executor', () => {
    expect(outlineView(VIEW)).toBe(`"Disk"\n- disk "Disk": table 'Filesystems', stat-card 'Root'\n- more "Details": tab logs "Logs": alert`);
    expect(outlineView(VIEW, true)).toContain(`- disk "Disk": [0] table 'Filesystems', [1] stat-card 'Root'`);
  });
});

describe('the planner (EX10.9)', () => {
  const router = (data: PlannerHints) => ({ reason: vi.fn().mockResolvedValue({ data, tokensUsed: { input: 1, output: 1 }, latencyMs: 1, model: 'm' }) });

  it('gets the earlier request and the open view on a follow-up', async () => {
    const r = router(hints());
    await new Planner(r as never, new TemplateRegistry()).plan('add a memory chart', undefined, { followUp: { prompt: 'show disk usage', view: VIEW } });
    const userPrompt = (r.reason.mock.calls[0]![0] as { rawOutput: string }).rawOutput;
    expect(userPrompt).toContain('User request: "add a memory chart"');
    expect(userPrompt).toContain('Their earlier request: "show disk usage"');
    expect(userPrompt).toContain(`- disk "Disk": table 'Filesystems', stat-card 'Root'`);
    expect(userPrompt).toContain('keep what still fits, change what the request asks');
  });

  it('may return a question; its schema allows null', async () => {
    expect(PlannerHintsSchema.safeParse(hints({ question: null })).success).toBe(true);
    const r = router(hints({ question: 'Which part of the server: logs, Docker or services?' }));
    expect((await new Planner(r as never, new TemplateRegistry()).plan('fix it')).question).toBe('Which part of the server: logs, Docker or services?');
  });
});

describe('the UI Agent (EX10.9)', () => {
  const agentWith = (planned: PlannerHints, executor = { execute: vi.fn(async function* () { /* nothing */ }), executeWithFixes: vi.fn() }) => ({
    agent: new UIAgent({
      modelRouter: { getModelMap: vi.fn().mockReturnValue({}), toolProvider: null } as never,
      planner: { plan: vi.fn().mockResolvedValue(planned) } as never,
      executor: executor as never,
      reflector: { reflect: vi.fn(), shouldSkip: vi.fn().mockReturnValue(true) } as never,
      ssh: { exec: vi.fn(), getSftp: vi.fn() } as never,
      templateRegistry: {} as never,
    }),
    executor,
  });
  const collect = async (gen: AsyncGenerator<UIAgentEvent>) => { const out: UIAgentEvent[] = []; for await (const e of gen) out.push(e); return out; };

  it('asks instead of guessing, and does not run the executor', async () => {
    const { agent, executor } = agentWith(hints({ question: '  Which part of the server?  ' }));
    const events = await collect(agent.generate('srv', 'tune the box'));
    expect(events.at(-1)).toEqual({ type: 'question', question: 'Which part of the server?' });
    expect(executor.execute).not.toHaveBeenCalled();
  });

  // live 10:46 UTC: the planner never set question — "help" became a view called "Planner Output"
  it('asks before planning when the request names nothing', async () => {
    for (const vague of ['help', 'fix it', 'show me stuff', "what's wrong?", 'Hi there, please do something']) expect(namesNothing(vague), vague).toBe(true);
    for (const clear of ['show disk', 'nginx logs', 'check my server', 'what is wrong with nginx', 'help me find big files']) expect(namesNothing(clear), clear).toBe(false);
    const planned = hints();
    const { agent, executor } = agentWith(planned);
    const events = await collect(agent.generate('srv', 'fix it'));
    expect(events.at(-1)).toEqual({ type: 'question', question: VAGUE_QUESTION });
    expect(executor.execute).not.toHaveBeenCalled();
    // a follow-up's subject is the open view
    const followed = await collect(agentWith(planned).agent.generate('srv', 'make it better', { followUp: { prompt: 'show disk', view: VIEW } }));
    expect(followed.some((e) => e.type === 'question')).toBe(false);
  });

  it('starts a follow-up from the open view', async () => {
    const seen: ToolContext[] = [];
    const executor = { execute: vi.fn(async function* (_h: PlannerHints, ctx: ToolContext) { seen.push(ctx); }), executeWithFixes: vi.fn() };
    const { agent } = agentWith(hints(), executor);
    await collect(agent.generate('srv', 'add a memory chart', { followUp: { prompt: 'show disk usage', view: VIEW } }));
    expect(seen[0]!.followUp).toEqual({ prompt: 'show disk usage' });
    expect(seen[0]!.workingView!.getSnapshot().title).toBe('Disk');
  });
});

describe('the executor on a follow-up (EX10.9)', () => {
  const step = (name: string, args: unknown): ChatWithToolsResult => ({
    message: { role: 'assistant', content: null, tool_calls: [{ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
    tokensUsed: { input: 0, output: 1 }, latencyMs: 1, model: 'm', finishReason: 'tool_calls',
  });
  const run = async (script: Array<ChatWithToolsResult | Error>) => {
    const registry = new ToolRegistry();
    registry.registerAll(LOCAL_AGENT_TOOLS);
    const seen: ChatMessage[][] = [];
    const chat = vi.fn(async (input: { messages: ChatMessage[] }) => {
      seen.push(structuredClone(input.messages));
      const next = script.shift();
      if (next instanceof Error) throw next;
      return next ?? step('finish', {});
    });
    const context = { serverId: 's', previousOutputs: new Map(), actionResults: [], workingView: new WorkingView(VIEW), followUp: { prompt: 'show disk usage' } } as unknown as ToolContext;
    const events: AgentEvent[] = [];
    for await (const e of new ReactiveExecutor({ chat, toolProvider: null } as never, registry).execute(hints(), context)) events.push(e);
    return { events, seen };
  };

  it('says it is refining, lists the widgets with their positions, and changes them in place', async () => {
    const { events, seen } = await run([
      step('remove_widget', { section: 'disk', index: 1 }),
      step('add_widget', { section: 'disk', widget: { type: 'alert', message: 'Memory: 12% used', variant: 'default' } }),
      step('finish', {}),
    ]);
    const opening = seen[0]!.find((m) => m.role === 'user')!.content!;
    expect(opening).toMatch(/^The owner is refining the view that is open now \(their earlier request: "show disk usage"\)\./);
    expect(opening).toContain(`[0] table 'Filesystems', [1] stat-card 'Root'`);
    expect(opening).toContain('start_view would start over');
    const done = events.at(-1) as { type: string; view: DynamicView };
    expect(done.type).toBe('generation_complete');
    const children = (done.view.sections.disk as unknown as { children: Array<{ type: string }> }).children;
    expect(children.map((c) => c.type)).toEqual(['table', 'alert']);
  });

  it('keeps the open view when the run stops early', async () => {
    const { events } = await run([new Error('Ollama answered 503: busy (5 retries)')]);
    expect(events.at(-1)).toMatchObject({ type: 'generation_incomplete', view: { title: 'Disk' }, reason: 'the model call failed (Ollama answered 503: busy (5 retries))' });
  });
});
