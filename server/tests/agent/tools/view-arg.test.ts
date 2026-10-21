// EX10.5: view tools take an object (or a string), repair what they can, say where it broke
// @see docs/phases/phase-ex10.md §6

import { describe, it, expect, vi } from 'vitest';
import { jsonErrorAt, readViewArg, viewCounts } from '../../../src/agent/tools/view-arg.js';
import { updateViewTool } from '../../../src/agent/tools/update-view.js';
import { generateSchemaTool } from '../../../src/agent/tools/generate-schema.js';
import { validateSchemaTool } from '../../../src/agent/tools/validate-schema.js';
import { ReactiveExecutor } from '../../../src/agent/executor.js';
import { ToolRegistry } from '../../../src/agent/tools/tool-registry.js';
import type { ToolContext } from '../../../src/agent/tools/types.js';
import type { ChatMessage } from '../../../src/llm/provider.js';
import { toolsToOpenAIFunctions } from '../../../src/agent/tools/tool-converter.js';

const ctx = { serverId: 's', previousOutputs: new Map() } as unknown as ToolContext;
const VIEW = {
  title: 'Docker',
  sidebarItems: [{ id: 'c', label: 'Containers' }, { id: 'i', label: 'Images' }],
  sections: {
    c: { layout: 'stack', children: [{ type: 'stat-card', title: 'Running', value: '4' }, { layout: 'grid', columns: 2, children: [{ type: 'alert', message: 'ok' }] }] },
    i: { layout: 'tabs', tabs: [{ id: 't', label: 'All', children: [{ type: 'table', columns: [{ key: 'n', label: 'Name' }], rows: [] }] }] },
  },
};

describe('readViewArg', () => {
  it('takes an object as it is, and a JSON string parsed', () => {
    expect(readViewArg(VIEW, 'view')).toEqual({ ok: true, value: VIEW, repaired: false });
    expect(readViewArg(JSON.stringify(VIEW), 'view')).toEqual({ ok: true, value: VIEW, repaired: false });
  });

  it('repairs a string a model broke (a trailing comma, a missing closing brace)', () => {
    for (const broken of [
      JSON.stringify(VIEW).replace('"value":"4"}', '"value":"4",}'),
      JSON.stringify(VIEW).slice(0, -1),
    ]) {
      const r = readViewArg(broken, 'view');
      expect(r, broken.slice(-40)).toMatchObject({ ok: true, repaired: true });
      expect((r as { value: unknown }).value).toEqual(VIEW);
    }
  });

  it('says where an unrepairable string broke', () => {
    const text = '{"title": "x", "sections": {"a": {"layout": "stack" "children": []}}}';
    const r = readViewArg(text, 'view');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/^Invalid JSON in view at character \d+ \(….*"stack" "children".*…\)\. Fix that spot and send the view again as a JSON object, not a string\.$/);
    }
    expect(readViewArg(42, 'schema')).toEqual({ ok: false, error: 'schema: expected a JSON object, you sent number.' });
  });

  it('jsonErrorAt falls back to the parser message without a position', () => {
    expect(jsonErrorAt('x', new Error('Unexpected end'), 'view')).toBe('Invalid JSON in view: Unexpected end. Fix it and send the view again as a JSON object, not a string.');
  });
});

describe('viewCounts', () => {
  it('counts sections and widgets, through grids and tabs', () => {
    expect(viewCounts(VIEW)).toEqual({ sections: 2, widgets: 3 });
    expect(viewCounts({ title: 'x' })).toEqual({ sections: 0, widgets: 0 });
  });
});

describe('the view tools', () => {
  it('update_view takes an object and answers briefly', async () => {
    const r = await updateViewTool.execute({ view: VIEW }, ctx);
    expect(r).toMatchObject({ success: true, output: 'View updated: 2 sections, 3 widgets. Gather the next section, or call generate_schema when every section is filled.' });
    expect(r.metadata?.partialView).toEqual(VIEW);
  });

  it('update_view says when it repaired the JSON', async () => {
    const r = await updateViewTool.execute({ view: `${JSON.stringify(VIEW).slice(0, -1)}` }, ctx);
    expect(r.success).toBe(true);
    expect(r.output).toContain('Its JSON was broken and has been repaired');
  });

  it('generate_schema and validate_schema take objects too', async () => {
    const valid = { title: 'T', sidebarItems: [{ id: 'm', label: 'M' }], sections: { m: { layout: 'stack', children: [] } } };
    expect(await generateSchemaTool.execute({ schema: valid }, ctx)).toMatchObject({ success: true, output: 'Schema accepted: 1 section, 0 widgets.' });
    expect(await validateSchemaTool.execute({ schema: valid }, ctx)).toMatchObject({ success: true });
    const bad = await generateSchemaTool.execute({ schema: '{"title": "T" "x": 1}' }, ctx);
    expect(bad.error).toMatch(/^Invalid JSON in schema at character/);
  });
});

describe('the executor never echoes a view back to the model', () => {
  it('sends success/output/error only in the tool message', async () => {
    const registry = new ToolRegistry();
    registry.register(updateViewTool);
    const reply = (msg: Partial<ChatMessage>) => ({ message: { role: 'assistant', content: null, ...msg }, tokensUsed: { input: 0, output: 1 }, latencyMs: 1, model: 'm', finishReason: 'tool_calls' });
    const chat = vi.fn()
      .mockResolvedValueOnce(reply({ tool_calls: [{ id: 'u1', type: 'function', function: { name: 'update_view', arguments: JSON.stringify({ view: VIEW }) } }] }))
      .mockRejectedValueOnce(new Error('stop'));
    const executor = new ReactiveExecutor({ chat, toolProvider: null } as never, registry);
    await (async () => { for await (const _ of executor.execute({ intent: 'x', interactivityLevel: 'display-only', expectedWidgets: [], dataSourceHints: [], securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false }, estimatedComplexity: 'simple' } as never, ctx)) { /* drain */ } })().catch(() => undefined);
    const toolMessage = (chat.mock.calls[1]![0].messages as ChatMessage[]).find((m) => m.role === 'tool')!;
    expect(Object.keys(JSON.parse(toolMessage.content!))).toEqual(['success', 'output']);
    expect(toolMessage.content).not.toContain('Running');
  });
});

// EX10.5 follow-up: the bracket faults seen in the 2026-10-22 runs, on small views
describe('misplaced brackets (2026-10-22 runs)', () => {
  const NESTED = '{"title":"T","sidebarItems":[{"id":"s","label":"S"}],"sections":{"s":{"layout":"stack","children":[{"layout":"stack","children":[{"type":"alert","message":"x"}],"gap":"sm"}],"gap":"sm"}}}';
  const FLAT = '{"title":"T","sections":{"s":{"layout":"stack","children":[{"type":"alert","message":"x"}],"gap":"sm"}},"sidebarItems":[{"id":"s","label":"S"}]}';

  it.each([
    ['a } where a ] belongs, after an inner stack', NESTED.replace('"gap":"sm"}],"gap":"sm"}}}', '"gap":"sm"}}],"gap":"sm"}}}'), NESTED],
    ['an object closed too early, then its last key', FLAT.replace('"x"}],"gap":"sm"}}', '"x"}]},"gap":"sm"}}'), FLAT],
    ['an inner array left open', NESTED.replace('"x"}],"gap":"sm"}],', '"x"},"gap":"sm"}],'), NESTED],
  ])('repairs %s into the intended view', (_label, broken, intended) => {
    expect(() => JSON.parse(broken)).toThrow();
    expect(readViewArg(broken, 'view')).toEqual({ ok: true, value: JSON.parse(intended), repaired: true });
  });

  it('refuses a repair that is not a valid view, and says where it broke', () => {
    // a duplicate "type" key turns the widget into a layout name: no bracket edit makes this valid
    const broken = '{"title":"T","sidebarItems":[{"id":"s","label":"S"}],"sections":{"s":{"layout":"stack","children":[{"type":"alert","message":"x"},"type":"stack","gap":"sm"}]}}}';
    const r = readViewArg(broken, 'view');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Invalid JSON in view at character \d+/);
  });

  it('the view tools show the model an object only, and still accept a string', async () => {
    const shown = toolsToOpenAIFunctions([updateViewTool, generateSchemaTool, validateSchemaTool]).map((t) => t.function.parameters as { properties: Record<string, { type: string }> });
    expect(shown.map((p) => Object.values(p.properties)[0]!.type)).toEqual(['object', 'object', 'object']);
    expect(JSON.stringify(shown)).not.toContain('"string"');
    expect(await updateViewTool.execute({ view: JSON.stringify(VIEW) }, ctx)).toMatchObject({ success: true });
  });
});
