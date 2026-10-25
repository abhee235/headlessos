// EX10.10: build the view widget by widget; the server fills bound widgets (ADR-026)
// @see docs/phases/phase-ex10.md §9b, docs/DECISIONS.md (ADR-026)
//
// start_view → (actions → add_widget …) per section → finish. Each answer is one line and
// the client gets a partial_view snapshot after every change. update_view also seeds the
// working view, so a model can mix the two.

import { z } from 'zod';
import { DynamicViewSchema, type DynamicView, type Widget } from 'headlessos-shared/schemas/dynamic-view';
import { WorkingView, createSkeleton } from '../../dynamic-ui/working-view.js';
import { repairJson } from '../loop/tool-input.js';
import { fillWidget, sourceFor } from './widget-source.js';
import { describeCounts, viewCounts, viewProblems } from './view-arg.js';
import type { ActionResultRecord, AgentTool, ToolContext, ToolResult } from './types.js';

const MAX_SECTIONS = 8;
/** a finish that met empty sections; the next finish in a row leaves them out */
const finishWarned = new WeakSet<WorkingView>();

const fail = (error: string): ToolResult => ({ success: false, output: '', error });

function snapshot(view: WorkingView, output: string): ToolResult {
  return { success: true, output, metadata: { partialView: view.getSnapshot(), isProgressiveUpdate: true } };
}

function stateLine(view: WorkingView, section: string): string {
  const n = view.countWidgets(section);
  const empty = view.emptySectionIds();
  const counts = `${section}: ${n} widget${n === 1 ? '' : 's'}; still empty: ${empty.length ? empty.join(', ') : 'none'}.`;
  // §9b: live, a model that was done resent the whole view through generate_schema
  return empty.length ? counts : `${counts} Call finish() when the view is done: the view is not resent.`;
}

/** an object, or a JSON string of one (repaired when broken) */
function readObject(value: unknown, name: string): Record<string, unknown> | string {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = repairJson(value);
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return `${name}: expected a JSON object.`;
}

/** a log-viewer or code-block with this many lines is checked for copied output (§9b) */
const COPIED_LINES: Record<string, number> = { 'log-viewer': 3, 'code-block': 10 };

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * EX10.10: lines the model copied from an action's output. The widget is bound to that
 * result instead, so it shows the real lines (live, the model copied 20 dpkg lines despite
 * the prompt). Lines that match no output are the model's own text and are left alone.
 */
function bindCopied(raw: Record<string, unknown>, results: readonly ActionResultRecord[]): { raw: Record<string, unknown>; note: string } {
  const type = typeof raw.type === 'string' ? raw.type : '';
  const limit = COPIED_LINES[type];
  if (raw.source !== undefined || !limit) return { raw, note: '' };
  const copied = type === 'log-viewer'
    ? (Array.isArray(raw.lines) ? raw.lines.map((l) => (l && typeof l === 'object' ? String((l as { message?: unknown }).message ?? '') : String(l))) : [])
    : typeof raw.code === 'string' ? raw.code.split('\n') : [];
  const probes = copied.map(squash).filter((l) => l.length >= 8);
  if (copied.length < limit || probes.length === 0) return { raw, note: '' };
  // most of the lines, not all: live, the model also altered some it copied (10:28 UTC)
  const sample = probes.slice(0, 10);
  const matched = (r: ActionResultRecord) => sample.filter((line) => squash(r.stdout).includes(line)).length;
  const from = [...results].reverse().find((r) => r.ok && r.stdout && matched(r) >= Math.max(3, Math.ceil(sample.length / 2)));
  if (!from) return { raw, note: '' };
  const source = sourceFor(from.action, from.params);
  const { lines: _lines, code: _code, ...rest } = raw;
  const which = `${from.action}${typeof source.params?.path === 'string' ? ` ${source.params.path}` : ''}`;
  return {
    raw: { ...rest, source },
    note: `the lines you wrote were replaced by the real ones from ${which}; next time send only the source`,
  };
}

const slug = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

const WIDGET_DESCRIPTION =
  'One widget as a JSON object, e.g. {"type":"stat-card","title":"CPU","unit":"%","source":{"action":"cpu_usage","path":"overallPercent"}}. ' +
  'With "source" the server fills its values from that action\'s result: never copy values or log lines yourself. ' +
  'source: action (required, already called), params (which call), path (into its JSON; "cores.*.percent" maps a list), reduce (count|sum|avg|max|min), limit (rows or lines).';

const widgetArg = z.union([z.record(z.string(), z.unknown()), z.string()]).describe(WIDGET_DESCRIPTION);
const widgetInput = { type: 'object', description: WIDGET_DESCRIPTION, additionalProperties: true };

// ── start_view ──

const StartViewParams = z.object({
  title: z.string().min(1).max(80),
  icon: z.string().max(40).optional().describe('Lucide icon, e.g. Cpu, HardDrive, Network'),
  description: z.string().max(200).optional(),
  sections: z.array(z.object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(40),
    icon: z.string().max(40).optional(),
    layout: z.enum(['stack', 'grid']).optional().describe('grid puts widgets side by side'),
  })).min(1).max(MAX_SECTIONS),
});

export const startViewTool: AgentTool = {
  name: 'start_view',
  description: 'Open the view: its title and sections (each becomes a sidebar item). Call once, before add_widget.',
  parameters: StartViewParams,
  securityTier: 'local',
  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = StartViewParams.safeParse(rawArgs);
    if (!parsed.success) return fail(`start_view: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).slice(0, 3).join('; ')}`);
    const args = parsed.data;
    const items = args.sections.map((s) => ({ id: slug(s.id) || slug(s.label), label: s.label, ...(s.icon ? { icon: s.icon } : {}) }));
    const dup = items.find((s, i) => !s.id || items.findIndex((o) => o.id === s.id) !== i);
    if (dup) return fail(`start_view: section ids must be different and not empty ("${dup.id}").`);
    const layouts = Object.fromEntries(args.sections.map((s, i) => [items[i]!.id, s.layout ?? 'stack'])) as Record<string, 'stack' | 'grid'>;
    const view = new WorkingView(createSkeleton({ title: args.title, ...(args.icon ? { icon: args.icon } : {}), ...(args.description ? { description: args.description } : {}), sidebarItems: items, sectionLayouts: layouts }));
    context.workingView = view;
    return snapshot(view, `View started: ${items.length} section${items.length === 1 ? '' : 's'} (${items.map((s) => s.id).join(', ')}). For each section call its actions, then add_widget with a source; finish when every section has widgets.`);
  },
};

// ── add_widget / replace_widget / remove_widget ──

const AddWidgetParams = z.object({
  section: z.string().min(1),
  widget: widgetArg,
  tab: z.string().optional().describe('tab id, for a section with tabs'),
});

function placeWidget(context: ToolContext, sectionId: string, rawWidget: unknown, place: (children: unknown[], widget: Widget) => void, verb: string, tab?: string): ToolResult {
  const view = context.workingView;
  if (!view) return fail('No view yet: call start_view first.');
  const raw = readObject(rawWidget, 'widget');
  if (typeof raw === 'string') return fail(raw);
  const bound = bindCopied(raw, context.actionResults ?? []);
  let children: unknown[];
  try {
    children = view.childrenOf(sectionId, tab);
  } catch (err) {
    return fail((err as Error).message);
  }
  const filled = fillWidget(bound.raw, context.actionResults ?? []);
  if (!filled.ok) return fail(filled.error);
  try {
    place(children, filled.widget);
  } catch (err) {
    return fail((err as Error).message);
  }
  finishWarned.delete(view);
  const title = typeof (filled.widget as { title?: unknown }).title === 'string' ? ` '${(filled.widget as { title: string }).title}'` : '';
  const said = [filled.summary, bound.note].filter(Boolean).join('; ');
  return snapshot(view, `${verb} ${filled.widget.type}${title} in ${sectionId}${said ? ` (${said})` : ''}. ${stateLine(view, sectionId)}`);
}

export const addWidgetTool: AgentTool = {
  name: 'add_widget',
  description: 'Add one widget to a section of the view. Point it at an action result with "source" and the server fills in the data.',
  parameters: AddWidgetParams,
  inputSchema: {
    type: 'object',
    properties: { section: { type: 'string', description: 'section id from start_view' }, widget: widgetInput, tab: { type: 'string', description: 'tab id, for a section with tabs' } },
    required: ['section', 'widget'],
    additionalProperties: false,
  },
  securityTier: 'local',
  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = AddWidgetParams.safeParse(rawArgs);
    if (!parsed.success) return fail('add_widget: needs {"section": "<id>", "widget": {...}}.');
    const { section, widget, tab } = parsed.data;
    return placeWidget(context, section, widget, (children, w) => children.push(w), 'Added', tab);
  },
};

const ReplaceWidgetParams = z.object({
  section: z.string().min(1),
  index: z.coerce.number().int().min(0).describe('0-based position in the section'),
  widget: widgetArg,
  tab: z.string().optional(),
});

export const replaceWidgetTool: AgentTool = {
  name: 'replace_widget',
  description: 'Replace the widget at a position (0-based) in a section; same widget format as add_widget.',
  parameters: ReplaceWidgetParams,
  inputSchema: {
    type: 'object',
    properties: { section: { type: 'string' }, index: { type: 'integer', minimum: 0 }, widget: widgetInput, tab: { type: 'string' } },
    required: ['section', 'index', 'widget'],
    additionalProperties: false,
  },
  securityTier: 'local',
  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = ReplaceWidgetParams.safeParse(rawArgs);
    if (!parsed.success) return fail('replace_widget: needs {"section": "<id>", "index": <n>, "widget": {...}}.');
    const { section, index, widget, tab } = parsed.data;
    return placeWidget(context, section, widget, (children, w) => {
      if (index >= children.length) throw new Error(`${section} has ${children.length} widget${children.length === 1 ? '' : 's'}; there is no widget ${index}.`);
      children[index] = w;
    }, 'Replaced', tab);
  },
};

const RemoveWidgetParams = z.object({
  section: z.string().min(1),
  index: z.coerce.number().int().min(0),
  tab: z.string().optional(),
});

export const removeWidgetTool: AgentTool = {
  name: 'remove_widget',
  description: 'Remove the widget at a position (0-based) in a section.',
  parameters: RemoveWidgetParams,
  securityTier: 'local',
  async execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = RemoveWidgetParams.safeParse(rawArgs);
    if (!parsed.success) return fail('remove_widget: needs {"section": "<id>", "index": <n>}.');
    const view = context.workingView;
    if (!view) return fail('No view yet: call start_view first.');
    try {
      view.removeWidget(parsed.data.section, parsed.data.index, parsed.data.tab);
    } catch (err) {
      return fail((err as Error).message);
    }
    finishWarned.delete(view);
    return snapshot(view, `Removed widget ${parsed.data.index} from ${parsed.data.section}. ${stateLine(view, parsed.data.section)}`);
  },
};

// ── finish ──

export const finishTool: AgentTool = {
  name: 'finish',
  description: 'End the run with the view as built. Call when every section has its widgets.',
  parameters: z.object({}).passthrough(),
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  securityTier: 'local',
  async execute(_rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    const view = context.workingView;
    if (!view) return fail('No view yet: call start_view first.');
    const empty = view.emptySectionIds();
    const all = view.getView().sidebarItems.length;
    if (empty.length && empty.length === all) return fail('Every section is still empty: add widgets first.');
    if (empty.length) {
      if (!finishWarned.has(view)) {
        finishWarned.add(view);
        return fail(`Still empty: ${empty.join(', ')}. Add widgets, or call finish again to leave ${empty.length === 1 ? 'it' : 'them'} out.`);
      }
      view.dropSections(empty);
    }
    const schema = view.getSnapshot();
    const checked = DynamicViewSchema.safeParse(schema);
    if (!checked.success) return fail(`The view is not valid yet: ${viewProblems(schema)}.`);
    const result: DynamicView = checked.data;
    return {
      success: true,
      output: `View finished: ${describeCounts(viewCounts(result))}${empty.length ? ` (left out: ${empty.join(', ')})` : ''}.`,
      metadata: { schema: result, isTerminalTool: true },
    };
  },
};

export const WIDGET_TOOLS: AgentTool[] = [startViewTool, addWidgetTool, replaceWidgetTool, removeWidgetTool, finishTool];
