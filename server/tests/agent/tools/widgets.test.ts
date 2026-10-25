// EX10.10: widgets filled by the server from action results (ADR-026)
// @see docs/phases/phase-ex10.md §9b

import { describe, it, expect, vi } from 'vitest';
import { fillWidget, findResult, resolvePath } from '../../../src/agent/tools/widget-source.js';
import { addWidgetTool, finishTool, removeWidgetTool, replaceWidgetTool, startViewTool } from '../../../src/agent/tools/widget-tools.js';
import { updateViewTool } from '../../../src/agent/tools/update-view.js';
import { generateSchemaTool } from '../../../src/agent/tools/generate-schema.js';
import { ToolRegistry } from '../../../src/agent/tools/tool-registry.js';
import { LOCAL_AGENT_TOOLS } from '../../../src/agent/tools/index.js';
import { ReactiveExecutor, type AgentEvent } from '../../../src/agent/executor.js';
import { ActionRunner } from '../../../src/agent/actions/runner.js';
import { actionTool } from '../../../src/agent/actions/tools.js';
import { getDefaultCatalog } from '../../../src/agent/actions/catalog/index.js';
import type { ActionResultRecord, ToolContext } from '../../../src/agent/tools/types.js';
import type { ChatWithToolsResult } from '../../../src/llm/provider.js';
import type { PlannerHints } from '../../../src/agent/planner.js';

const disk = [
  { filesystem: 'overlay', type: 'overlay', size: '1007G', used: '49G', available: '908G', usePercent: 6, mountPoint: '/' },
  { filesystem: '/dev/sdd', type: 'ext4', size: '1007G', used: '49G', available: '908G', usePercent: 6, mountPoint: '/etc/hosts' },
];
const results: ActionResultRecord[] = [
  { action: 'disk_usage', params: {}, ok: true, data: disk, stdout: '' },
  { action: 'cpu_usage', params: {}, ok: true, data: { overallPercent: 12.345, cores: [{ id: 0, percent: 20 }, { id: 1, percent: 4 }], basis: '1 s' }, stdout: '' },
  { action: 'memory_usage', params: {}, ok: true, data: { totalMb: 15515, usedMb: 1873, usedPercent: 12.1 }, stdout: '' },
  { action: 'file_tail', params: { path: '/var/log/dpkg.log', lines: 100 }, ok: true, stdout: Array.from({ length: 100 }, (_, i) => `2026-10-19 status installed pkg-${i}`).join('\n') + '\nE: failed to fetch\nwarning: low space' },
  { action: 'file_tail', params: { path: '/var/log/alternatives.log' }, ok: true, stdout: 'update-alternatives: link pager' },
  { action: 'process_list', params: { sortBy: 'cpu' }, ok: true, data: [{ pid: 1, command: 'mysqld --password=hunter2 --port 3306' }], stdout: '' },
];

describe('binding a widget to a result (EX10.10)', () => {
  it('finds the latest result of an action, the matching call when params are given', () => {
    expect(findResult(results, { action: 'file_tail', params: { path: '/var/log/alternatives.log' } })).toMatchObject({ stdout: 'update-alternatives: link pager' });
    expect(findResult(results, { action: 'uptime' })).toBe('No result of uptime in this run yet: call uptime first.');
    expect(findResult(results, { action: 'file_tail', params: { path: '/var/log/syslog' } })).toMatch(/^No file_tail call with \{"path":"\/var\/log\/syslog"\}; its calls this run: /);
  });

  it('follows paths, maps lists with *, and says what is there when a field is wrong', () => {
    const cpu = results[1]!.data;
    expect(resolvePath(cpu, 'overallPercent', 'cpu_usage')).toEqual({ ok: true, value: 12.345 });
    expect(resolvePath(cpu, 'cores.*.percent', 'cpu_usage')).toEqual({ ok: true, value: [20, 4] });
    expect(resolvePath(cpu, 'cores.1.percent', 'cpu_usage')).toEqual({ ok: true, value: 4 });
    expect(resolvePath(cpu, 'overall', 'cpu_usage')).toEqual({ ok: false, error: "cpu_usage has no field 'overall'; it is overallPercent, cores, basis." });
    expect(resolvePath(disk, 'use', 'disk_usage')).toMatchObject({ ok: false, error: expect.stringContaining('a list of 2; each has filesystem, type, size, used, available, usePercent, mountPoint') });
    expect(resolvePath(cpu, 'cores.5', 'cpu_usage')).toEqual({ ok: false, error: 'cores has 2 items; there is no item 5.' });
  });
});

describe('filling each widget type (EX10.10)', () => {
  const fill = (w: Record<string, unknown>) => fillWidget(w, results);

  it('stat-card: one value, at most one decimal; a list needs a path or a reduce', () => {
    expect(fill({ type: 'stat-card', title: 'CPU', unit: '%', source: { action: 'cpu_usage', path: 'overallPercent' } }))
      .toEqual({ ok: true, widget: expect.objectContaining({ type: 'stat-card', title: 'CPU', value: '12.3', unit: '%' }), summary: 'from cpu_usage: 12.3' });
    expect(fill({ type: 'stat-card', title: 'Busiest core', source: { action: 'cpu_usage', path: 'cores.*.percent', reduce: 'max' } })).toMatchObject({ widget: { value: '20' } });
    expect(fill({ type: 'stat-card', title: 'Filesystems', source: { action: 'disk_usage', reduce: 'count' } })).toMatchObject({ widget: { value: '2' } });
    expect(fill({ type: 'stat-card', title: 'CPU', source: { action: 'cpu_usage', path: 'cores' } }))
      .toEqual({ ok: false, error: 'cores is a list of 2: give a path to one value (cores.0.id) or a reduce (count, sum, avg, max, min).' });
  });

  it('progress-bar and gauge take a number; the bar is clamped to 0–100', () => {
    expect(fill({ type: 'progress-bar', title: 'Memory', source: { action: 'memory_usage', path: 'usedPercent' } })).toMatchObject({ ok: true, widget: { value: 12.1 } });
    expect(fill({ type: 'gauge', label: 'Memory MB', max: 20000, source: { action: 'memory_usage', path: 'usedMb' } })).toMatchObject({ ok: true, widget: { value: 1873 } });
    expect(fill({ type: 'progress-bar', source: { action: 'disk_usage', path: '0.mountPoint' } })).toMatchObject({ ok: false, error: expect.stringContaining('not a number') });
  });

  it('table: rows from the list, columns from the first row when none are given', () => {
    const t = fill({ type: 'table', title: 'Filesystems', source: { action: 'disk_usage' } });
    expect(t).toMatchObject({ ok: true, summary: '2 rows from disk_usage' });
    const w = (t as { widget: { columns: Array<{ key: string; label: string; type: string }>; rows: unknown[] } }).widget;
    expect(w.rows).toHaveLength(2);
    expect(w.columns.find((c) => c.key === 'usePercent')).toMatchObject({ label: 'Use percent', type: 'percent' });
    const chosen = fill({ type: 'table', columns: [{ key: 'mountPoint', label: 'Mount' }], source: { action: 'disk_usage', limit: 1 } });
    expect(chosen).toMatchObject({ ok: true, widget: { columns: [{ key: 'mountPoint', label: 'Mount' }] }, summary: '1 rows from disk_usage (of 2)' });
  });

  it('key-value from an object; chart needs its keys', () => {
    expect(fill({ type: 'key-value', title: 'Memory', source: { action: 'memory_usage' } })).toMatchObject({
      ok: true, widget: { pairs: [{ key: 'Total mb', value: '15515' }, { key: 'Used mb', value: '1873' }, { key: 'Used percent', value: '12.1' }] },
    });
    expect(fill({ type: 'chart', chartType: 'bar', source: { action: 'disk_usage' } })).toMatchObject({ ok: false, error: expect.stringContaining('a chart needs xKey and yKeys') });
    expect(fill({ type: 'chart', chartType: 'bar', xKey: 'mountPoint', yKeys: [{ key: 'usePercent' }], source: { action: 'disk_usage' } })).toMatchObject({ ok: true });
  });

  it('log-viewer: the last lines of the output, with levels; never the model copying them', () => {
    const w = fill({ type: 'log-viewer', title: 'dpkg.log', source: { action: 'file_tail', params: { path: '/var/log/dpkg.log' } } });
    expect(w).toMatchObject({ ok: true, summary: 'last 30 lines from file_tail' });
    const lines = (w as { widget: { lines: Array<{ message: string; level: string }> } }).widget.lines;
    expect(lines).toHaveLength(30);
    expect(lines.at(-2)).toEqual({ message: 'E: failed to fetch', level: 'error' });
    expect(lines.at(-1)).toEqual({ message: 'warning: low space', level: 'warn' });
    expect(fill({ type: 'log-viewer', source: { action: 'file_tail', params: { path: '/var/log/dpkg.log' }, limit: 500 } })).toMatchObject({ summary: 'last 100 lines from file_tail' });
  });

  it('code-block: the first lines of the output', () => {
    expect(fill({ type: 'code-block', title: 'pager', source: { action: 'file_tail', params: { path: '/var/log/alternatives.log' } } }))
      .toMatchObject({ ok: true, widget: { code: 'update-alternatives: link pager', language: 'text' } });
  });

  it('redacts secrets it fills in, and drops the source from the widget', () => {
    const t = fill({ type: 'table', source: { action: 'process_list' } });
    const row = (t as { widget: { rows: Array<{ command: string }> } }).widget.rows[0]!;
    expect(row.command).not.toContain('hunter2');
    expect(JSON.stringify((t as { widget: unknown }).widget)).not.toContain('source');
  });

  it('steers: text-only results, unboundable widgets, bad sources, invalid widgets', () => {
    expect(fill({ type: 'table', source: { action: 'file_tail' } })).toEqual({ ok: false, error: 'file_tail returned text, not data: bind it to a log-viewer or code-block, or write the values yourself.' });
    expect(fill({ type: 'alert', message: 'x', source: { action: 'disk_usage' } })).toEqual({ ok: false, error: 'a alert takes no source; write its content yourself.' });
    expect(fill({ type: 'stat-card', source: { path: 'x' } })).toMatchObject({ ok: false, error: expect.stringMatching(/^source: action: missing/) });
    expect(fill({ type: 'stat-card', value: '3' })).toMatchObject({ ok: false, error: expect.stringMatching(/^stat-card: title: missing/) });
    expect(fill({ type: 'alert', message: 'No journal on this server', variant: 'warning' })).toMatchObject({ ok: true, summary: '' });
  });
});

describe('the widget tools (EX10.10)', () => {
  const context = () => ({ serverId: 's', previousOutputs: new Map(), actionResults: [...results] }) as unknown as ToolContext;
  const start = (ctx: ToolContext) => startViewTool.execute({ title: 'Overview', sections: [{ id: 'disk', label: 'Disk', icon: 'HardDrive' }, { id: 'Net Work', label: 'Network' }] }, ctx);

  it('start_view opens the view and sends a snapshot', async () => {
    const ctx = context();
    const r = await start(ctx);
    expect(r).toMatchObject({ success: true, output: 'View started: 2 sections (disk, net-work). For each section call its actions, then add_widget with a source; finish when every section has widgets.' });
    expect((r.metadata!.partialView as { sidebarItems: unknown[] }).sidebarItems).toHaveLength(2);
    expect(await startViewTool.execute({ title: 'x', sections: [{ id: 'a', label: 'A' }, { id: 'A', label: 'B' }] }, ctx)).toMatchObject({ success: false });
  });

  it('add, replace and remove widgets, one line each', async () => {
    const ctx = context();
    await start(ctx);
    expect(await addWidgetTool.execute({ section: 'disk', widget: { type: 'table', title: 'Filesystems', source: { action: 'disk_usage' } } }, ctx))
      .toMatchObject({ success: true, output: "Added table 'Filesystems' in disk (2 rows from disk_usage). disk: 1 widget; still empty: net-work." });
    expect(await addWidgetTool.execute({ section: 'gpu', widget: { type: 'alert', message: 'x' } }, ctx)).toEqual({ success: false, output: '', error: 'No section "gpu"; the sections are disk, net-work.' });
    // a widget sent as a JSON string still works
    expect(await addWidgetTool.execute({ section: 'disk', widget: '{"type":"stat-card","title":"Filesystems","source":{"action":"disk_usage","reduce":"count"}}' }, ctx)).toMatchObject({ success: true });
    expect(await replaceWidgetTool.execute({ section: 'disk', index: 1, widget: { type: 'alert', message: 'Two filesystems' } }, ctx)).toMatchObject({ success: true, output: expect.stringMatching(/^Replaced alert in disk\. disk: 2 widgets/) });
    expect(await removeWidgetTool.execute({ section: 'disk', index: 5 }, ctx)).toMatchObject({ success: false, error: 'disk has 2 widgets; there is no widget 5.' });
    expect(await removeWidgetTool.execute({ section: 'disk', index: 1 }, ctx)).toMatchObject({ success: true });
    expect(ctx.workingView!.countWidgets('disk')).toBe(1);
  });

  it('binds log lines the model copied to the output they came from (live 10:19: 20 dpkg lines copied)', async () => {
    const ctx = context();
    await start(ctx);
    const copied = { type: 'log-viewer', title: 'dpkg', lines: [5, 6, 7].map((i) => ({ level: 'info', message: `2026-10-19 status   installed pkg-${i}` })) };
    const r = await addWidgetTool.execute({ section: 'disk', widget: copied }, ctx);
    expect(r).toMatchObject({ success: true, output: "Added log-viewer 'dpkg' in disk (last 30 lines from file_tail; the lines you wrote were replaced by the real ones from file_tail /var/log/dpkg.log; next time send only the source). disk: 1 widget; still empty: net-work." });
    const lines = (ctx.workingView!.getView().sections.disk as unknown as { children: Array<{ lines: Array<{ message: string }> }> }).children[0]!.lines;
    expect(lines).toHaveLength(30);
    expect(lines.at(-1)!.message).toBe('warning: low space');
    // mostly copied, partly altered (live: "libunistring2:1.0-1" for the real line) is still bound
    const altered = { type: 'log-viewer', title: 'dpkg2', lines: [5, 6, 7, 8].map((i) => ({ message: i === 6 ? 'status installed pkg-6:1.0' : `2026-10-19 status installed pkg-${i}` })) };
    expect(await addWidgetTool.execute({ section: 'disk', widget: altered }, ctx)).toMatchObject({ success: true, output: expect.stringContaining('replaced by the real ones from file_tail /var/log/dpkg.log') });
    // lines that are the model's own words stay as written
    const own = { type: 'log-viewer', title: 'summary', lines: [{ message: 'Journal is empty on this host' }, { message: 'No syslog file exists' }, { message: 'Only dpkg and apt logs are present' }] };
    expect(await addWidgetTool.execute({ section: 'disk', widget: own }, ctx)).toMatchObject({ success: true, output: expect.stringMatching(/^Added log-viewer 'summary' in disk\. /) });
  });

  it('finish: warns once about empty sections, then leaves them out; ends with the schema', async () => {
    const ctx = context();
    expect(await finishTool.execute({}, ctx)).toMatchObject({ success: false, error: 'No view yet: call start_view first.' });
    await start(ctx);
    expect(await finishTool.execute({}, ctx)).toMatchObject({ success: false, error: 'Every section is still empty: add widgets first.' });
    await addWidgetTool.execute({ section: 'disk', widget: { type: 'table', title: 'Filesystems', source: { action: 'disk_usage' } } }, ctx);
    expect(await finishTool.execute({}, ctx)).toMatchObject({ success: false, error: 'Still empty: net-work. Add widgets, or call finish again to leave it out.' });
    const done = await finishTool.execute({}, ctx);
    expect(done).toMatchObject({ success: true, output: 'View finished: 1 section, 1 widget (left out: net-work).', metadata: { isTerminalTool: true } });
    expect((done.metadata!.schema as { sidebarItems: Array<{ id: string }> }).sidebarItems.map((s) => s.id)).toEqual(['disk']);
  });

  it('an update_view seeds the working view, so widgets and finish carry on from it', async () => {
    const ctx = context();
    await updateViewTool.execute({ view: { title: 'Disk', sidebarItems: [{ id: 'd', label: 'Disk' }], sections: { d: { layout: 'stack', children: [] } } } }, ctx);
    await addWidgetTool.execute({ section: 'd', widget: { type: 'stat-card', title: 'Root', unit: '%', source: { action: 'disk_usage', path: '0.usePercent' } } }, ctx);
    expect(await finishTool.execute({}, ctx)).toMatchObject({ success: true });
  });

  it('are local tools the UI Agent registers', () => {
    for (const name of ['start_view', 'add_widget', 'replace_widget', 'remove_widget', 'finish']) {
      expect(LOCAL_AGENT_TOOLS.find((t) => t.name === name), name).toMatchObject({ securityTier: 'local' });
    }
  });
});

describe('a run built widget by widget (EX10.10)', () => {
  const DF = `Filesystem     Type     Size  Used Avail Use% Mounted on
overlay        overlay 1007G   49G  908G   6% /
/dev/sdd       ext4    1007G   49G  908G   6% /etc/hosts`;
  let n = 0;
  const step = (name: string, args: unknown): ChatWithToolsResult => ({
    message: { role: 'assistant', content: null, tool_calls: [{ id: `c${++n}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
    tokensUsed: { input: 0, output: 1 }, latencyMs: 1, model: 'm', finishReason: 'tool_calls',
  });
  const hints = { intent: 'disk', interactivityLevel: 'display-only', expectedWidgets: ['table'], templateHint: null, dataSourceHints: [], suggestedLayout: 'stack', suggestedSections: ['Disk'], securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false }, estimatedComplexity: 'simple', skipPostReflection: true } as unknown as PlannerHints;

  async function run(script: ChatWithToolsResult[], maxSteps = 30) {
    const registry = new ToolRegistry();
    registry.registerAll([...LOCAL_AGENT_TOOLS, actionTool(getDefaultCatalog().get('disk_usage')!)]);
    const ssh = { exec: vi.fn().mockResolvedValue({ stdout: DF, stderr: '', exitCode: 0, durationMs: 3 }), getSftp: vi.fn() };
    const context = { serverId: 's', ssh, previousOutputs: new Map(), actionResults: [], actions: new ActionRunner({ ssh: ssh as never }) } as unknown as ToolContext;
    const queue = [...script];
    const chat = vi.fn(async () => queue.shift() ?? step('finish', {}));
    const events: AgentEvent[] = [];
    for await (const e of new ReactiveExecutor({ chat, toolProvider: null } as never, registry, { maxSteps }).execute(hints, context)) events.push(e);
    return { events, chat };
  }

  it('start_view → the real disk_usage action → add_widget → finish: the table holds what df said', async () => {
    const { events } = await run([
      step('start_view', { title: 'Disk', sections: [{ id: 'disk', label: 'Disk' }] }),
      step('disk_usage', {}),
      step('add_widget', { section: 'disk', widget: { type: 'table', title: 'Filesystems', source: { action: 'disk_usage' } } }),
      step('finish', {}),
    ]);
    expect(events.filter((e) => e.type === 'partial_view')).toHaveLength(2); // start_view, add_widget
    const done = events.at(-1) as { type: string; view: { sections: Record<string, { children: Array<{ rows: Array<{ type: string; usePercent: number }> }> }> } };
    expect(done.type).toBe('generation_complete');
    expect(done.view.sections.disk!.children[0]!.rows).toEqual([
      expect.objectContaining({ filesystem: 'overlay', type: 'overlay', usePercent: 6, mountPoint: '/' }),
      expect.objectContaining({ filesystem: '/dev/sdd', type: 'ext4', mountPoint: '/etc/hosts' }),
    ]);
  });

  // §9b: live, the model never wrote a source until each result said how to show it
  it('each action result says how to show it, and add_widget points at finish once nothing is empty', async () => {
    const { events, chat } = await run([
      step('start_view', { title: 'Disk', sections: [{ id: 'disk', label: 'Disk' }] }),
      step('disk_usage', {}),
      step('add_widget', { section: 'disk', widget: { type: 'table', title: 'Filesystems', source: { action: 'disk_usage' } } }),
      step('finish', {}),
    ]);
    // the router got the executor's own (still growing) history: find each result by what it says
    const sent = (chat.mock.calls.at(-1)![0] as { messages: Array<{ role: string; content: string | null }> }).messages;
    const toolMessages = sent.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content!) as { output: string });
    expect(toolMessages.find((m) => m.output.includes('action="disk_usage"'))).toMatchObject({ success: true, widgetSource: { action: 'disk_usage' } });
    expect(toolMessages.find((m) => m.output.startsWith('View started'))).not.toHaveProperty('widgetSource'); // not an action
    const added = events.find((e) => e.type === 'tool_result' && e.tool === 'add_widget') as { outputPreview: string };
    expect(added.outputPreview).toContain('Call finish() when the view is done: the view is not resent.');
  });

  it('a bound widget before its action gets a steering error, and the model can recover', async () => {
    const { events } = await run([
      step('start_view', { title: 'Disk', sections: [{ id: 'disk', label: 'Disk' }] }),
      step('add_widget', { section: 'disk', widget: { type: 'table', title: 'Filesystems', source: { action: 'disk_usage' } } }),
      step('disk_usage', {}),
      step('add_widget', { section: 'disk', widget: { type: 'table', title: 'Filesystems', source: { action: 'disk_usage' } } }),
      step('finish', {}),
    ]);
    expect(events.filter((e) => e.type === 'tool_result' && e.tool === 'add_widget').map((e) => (e as { success: boolean }).success)).toEqual([false, true]);
    expect(events.at(-1)).toMatchObject({ type: 'generation_complete' });
  });

  it('out of steps with a working view: the wrap-up turn offers finish', async () => {
    const { events, chat } = await run([
      step('start_view', { title: 'Disk', sections: [{ id: 'disk', label: 'Disk' }, { id: 'more', label: 'More' }] }),
      step('disk_usage', {}),
      step('add_widget', { section: 'disk', widget: { type: 'stat-card', title: 'Root', unit: '%', source: { action: 'disk_usage', path: '0.usePercent' } } }),
      step('finish', {}),
    ], 3);
    const last = chat.mock.calls.at(-1)![0] as { tools: Array<{ function: { name: string } }> };
    expect(last.tools.map((t) => t.function.name)).toEqual(['finish', 'generate_schema']);
    // the wrap-up's finish meets the empty section, and leaves it out the second time
    const done = events.at(-1) as { type: string; view: { sidebarItems: Array<{ id: string }> } };
    expect(done.type).toBe('generation_complete');
    expect(done.view.sidebarItems.map((s) => s.id)).toEqual(['disk']);
  });
});
