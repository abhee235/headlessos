// EX10.10: a widget bound to an action result — the server fills its values (ADR-026)
// @see docs/phases/phase-ex10.md §9b, docs/DECISIONS.md (ADR-026)
//
// The model writes the structure ({"type":"table","title":"Filesystems","source":
// {"action":"disk_usage"}}); this fills rows, values, pairs, chart data or log lines from
// the run's action results. `source` is consumed here and never reaches the view.

import { z } from 'zod';
import { WidgetSchema, type Widget } from 'headlessos-shared/schemas/dynamic-view';
import { redactSecrets } from '../actions/redact.js';
import { describeIssues } from './view-arg.js';
import type { ActionResultRecord } from './types.js';

export const REDUCERS = ['count', 'sum', 'avg', 'max', 'min'] as const;

export const WidgetSourceSchema = z.object({
  action: z.string().min(1).describe('id of an action already called this run'),
  params: z.record(z.string(), z.unknown()).optional().describe('which call, when there were several (e.g. {"path":"/var/log/dpkg.log"})'),
  path: z.string().optional().describe('dot path into its JSON; "cores.*.percent" maps a list'),
  reduce: z.enum(REDUCERS).optional().describe('total over a list'),
  limit: z.number().int().positive().optional().describe('rows or lines'),
}).strict();

export type WidgetSource = z.infer<typeof WidgetSourceSchema>;

export const DEFAULT_ROWS = 20;
export const MAX_ROWS = 50;
export const DEFAULT_LINES = 30;
export const MAX_LINES = 100;
const MAX_PAIRS = 20;
const MAX_COLUMNS = 8;
const MAX_LINE_CHARS = 500;

type Filled = { ok: true; widget: Widget; summary: string } | { ok: false; error: string };

/** params that say which call it was; the rest (lines, maxBytes) only clutter a source */
const IDENTIFYING = ['path', 'unit', 'name', 'container', 'program', 'host', 'url', 'sortBy'];

/** EX10.10: the source that shows a result — the action plus the params that name the call */
export function sourceFor(action: string, params: Record<string, unknown>): { action: string; params?: Record<string, unknown> } {
  const named = Object.fromEntries(Object.entries(params).filter(([k, v]) => IDENTIFYING.includes(k) && v !== undefined && v !== null));
  return { action, ...(Object.keys(named).length ? { params: named } : {}) };
}
type Resolved = { ok: true; value: unknown } | { ok: false; error: string };

/** The latest successful result of `source.action` whose params include `source.params`. */
export function findResult(results: readonly ActionResultRecord[], source: WidgetSource): ActionResultRecord | string {
  const ofAction = results.filter((r) => r.action === source.action && r.ok);
  if (ofAction.length === 0) return `No result of ${source.action} in this run yet: call ${source.action} first.`;
  const wanted = Object.entries(source.params ?? {});
  const match = [...ofAction].reverse().find((r) => wanted.every(([k, v]) => String(r.params[k]) === String(v)));
  if (match) return match;
  const calls = ofAction.map((r) => JSON.stringify(r.params)).slice(-5).join(', ');
  return `No ${source.action} call with ${JSON.stringify(source.params)}; its calls this run: ${calls}.`;
}

function fieldsOf(value: unknown): string {
  if (Array.isArray(value)) {
    const first = value.find((v) => v && typeof v === 'object');
    return first ? `a list of ${value.length}; each has ${Object.keys(first).slice(0, 12).join(', ')}` : `a list of ${value.length}`;
  }
  if (value && typeof value === 'object') return Object.keys(value).slice(0, 12).join(', ');
  return `a ${typeof value}`;
}

/** Follow a dot path; `*` maps a list, a number indexes one. */
export function resolvePath(root: unknown, path: string | undefined, action: string): Resolved {
  const parts = (path ?? '').split('.').map((p) => p.trim()).filter(Boolean);
  let cur: unknown = root;
  const at: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const where = at.length ? at.join('.') : action;
    if (part === '*') {
      if (!Array.isArray(cur)) return { ok: false, error: `${where} is not a list, so "*" does not apply; it is ${fieldsOf(cur)}.` };
      const rest = parts.slice(i + 1).join('.');
      const mapped = cur.map((item) => resolvePath(item, rest, `${where}.*`));
      const bad = mapped.find((m) => !m.ok);
      if (bad) return bad;
      return { ok: true, value: mapped.map((m) => (m as { value: unknown }).value) };
    }
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      if (Number(part) >= cur.length) return { ok: false, error: `${where} has ${cur.length} items; there is no item ${part}.` };
      cur = cur[Number(part)];
    } else if (cur && typeof cur === 'object' && !Array.isArray(cur) && part in cur) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return { ok: false, error: `${action} has no field '${part}'${at.length ? ` (at ${at.join('.')})` : ''}; ${at.length ? 'there it is' : 'it is'} ${fieldsOf(cur)}.` };
    }
    at.push(part);
  }
  return { ok: true, value: cur };
}

function reduceList(list: unknown, how: (typeof REDUCERS)[number], where: string): Resolved {
  if (!Array.isArray(list)) return { ok: false, error: `${where} is not a list, so it cannot be reduced (${how}).` };
  if (how === 'count') return { ok: true, value: list.length };
  const nums = list.map((v) => (typeof v === 'number' ? v : Number(v)));
  if (nums.some((n) => !Number.isFinite(n))) return { ok: false, error: `${where} holds values that are not numbers; ${how} needs numbers (give a path to a number field, e.g. ${where}.*.<field>).` };
  if (nums.length === 0) return { ok: true, value: 0 };
  const total = nums.reduce((a, b) => a + b, 0);
  const value = how === 'sum' ? total : how === 'avg' ? total / nums.length : how === 'max' ? Math.max(...nums) : Math.min(...nums);
  return { ok: true, value };
}

const clean = (text: string) => redactSecrets(text).text;
const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());
function asText(v: unknown): string {
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return clean(v);
  if (Array.isArray(v)) return clean(v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', '));
  if (v && typeof v === 'object') return clean(JSON.stringify(v));
  return v === null || v === undefined ? '' : String(v);
}
/** "usedPercent" → "Used percent", "rx_bytes" → "Rx bytes" */
function humanize(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
function oneValue(value: unknown, source: WidgetSource): Resolved {
  const where = source.path || source.action;
  if (Array.isArray(value)) return { ok: false, error: `${where} is a list of ${value.length}: give a path to one value (${where}.0${value[0] && typeof value[0] === 'object' ? `.${Object.keys(value[0])[0]}` : ''}) or a reduce (count, sum, avg, max, min).` };
  if (value && typeof value === 'object') return { ok: false, error: `${where} is an object with ${fieldsOf(value)}: give a path to one of them.` };
  return { ok: true, value };
}
const lines = (text: string) => text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
function level(line: string): 'error' | 'warn' | 'info' {
  if (/\b(error|err|fail(ed|ure)?|fatal|crit(ical)?|panic)\b/i.test(line)) return 'error';
  if (/\bwarn(ing)?\b/i.test(line)) return 'warn';
  return 'info';
}

/**
 * Fill a widget from its `source` (if any) and check it. The model's own fields win
 * except the data fields the source fills.
 */
export function fillWidget(raw: Record<string, unknown>, results: readonly ActionResultRecord[]): Filled {
  const { source: rawSource, ...widget } = raw;
  const type = typeof widget.type === 'string' ? widget.type : '';
  let summary = '';
  if (rawSource !== undefined) {
    const parsed = WidgetSourceSchema.safeParse(rawSource);
    if (!parsed.success) return { ok: false, error: `source: ${describeIssues(parsed.error.issues)}.` };
    const source = parsed.data;
    const found = findResult(results, source);
    if (typeof found === 'string') return { ok: false, error: found };
    const textual = type === 'log-viewer' || type === 'code-block';
    let value: unknown;
    if (textual && !source.path) {
      value = lines(found.stdout);
    } else {
      if (found.data === undefined && !textual) return { ok: false, error: `${source.action} returned text, not data: bind it to a log-viewer or code-block, or write the values yourself.` };
      const r = resolvePath(found.data, source.path, source.action);
      if (!r.ok) return r;
      value = r.value;
    }
    if (source.reduce) {
      const r = reduceList(value, source.reduce, source.path || source.action);
      if (!r.ok) return r;
      value = r.value;
    }
    const from = `from ${source.action}`;
    switch (type) {
      case 'stat-card':
      case 'sparkline-stat': {
        const one = oneValue(value, source);
        if (!one.ok) return one;
        widget.value = asText(one.value);
        summary = `${from}: ${widget.value}`;
        break;
      }
      case 'progress-bar':
      case 'gauge': {
        const one = oneValue(value, source);
        if (!one.ok) return one;
        const n = typeof one.value === 'number' ? one.value : Number(String(one.value).replace('%', ''));
        if (!Number.isFinite(n)) return { ok: false, error: `${source.path || source.action} is ${JSON.stringify(one.value)}, not a number; a ${type} needs one.` };
        widget.value = type === 'progress-bar' ? Math.min(100, Math.max(0, n)) : n;
        summary = `${from}: ${formatNumber(n)}`;
        break;
      }
      case 'key-value': {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: `a key-value needs an object; ${source.path || source.action} is ${fieldsOf(value)}.` };
        widget.pairs = Object.entries(value).slice(0, MAX_PAIRS).map(([k, v]) => ({ key: humanize(k), value: asText(v) }));
        summary = `${(widget.pairs as unknown[]).length} pairs ${from}`;
        break;
      }
      case 'table':
      case 'chart': {
        if (!Array.isArray(value)) return { ok: false, error: `a ${type} needs a list; ${source.path || source.action} is ${fieldsOf(value)}.` };
        const limit = Math.min(source.limit ?? DEFAULT_ROWS, MAX_ROWS);
        const items = value.slice(0, limit).filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>;
        if (type === 'table') {
          if (!Array.isArray(widget.columns) || widget.columns.length === 0) {
            const keys = Object.keys(items[0] ?? {}).slice(0, MAX_COLUMNS);
            widget.columns = keys.map((key) => ({
              key, label: humanize(key),
              type: /percent/i.test(key) ? 'percent' : typeof items[0]?.[key] === 'number' ? 'number' : 'text',
            }));
          }
          widget.rows = items.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'number' || typeof v === 'boolean' ? v : asText(v)])));
        } else {
          if (typeof widget.xKey !== 'string' || !Array.isArray(widget.yKeys)) return { ok: false, error: `a chart needs xKey and yKeys; the items have ${fieldsOf(value)}.` };
          widget.data = items;
        }
        summary = `${items.length} ${type === 'table' ? 'rows' : 'points'} ${from}${value.length > items.length ? ` (of ${value.length})` : ''}`;
        break;
      }
      case 'log-viewer':
      case 'code-block': {
        const text = Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))) : lines(asText(value));
        const limit = Math.min(source.limit ?? DEFAULT_LINES, MAX_LINES);
        if (type === 'log-viewer') {
          const last = text.slice(-limit).map((l) => clean(l.slice(0, MAX_LINE_CHARS)));
          widget.lines = last.map((message) => ({ message, level: level(message) }));
          summary = `last ${last.length} lines ${from}`;
        } else {
          const first = text.slice(0, limit).map((l) => clean(l));
          widget.code = first.join('\n');
          if (typeof widget.language !== 'string') widget.language = 'text';
          summary = `${first.length} lines ${from}`;
        }
        break;
      }
      default:
        return { ok: false, error: `a ${type || 'widget without a type'} takes no source; write its content yourself.` };
    }
  }
  const checked = WidgetSchema.safeParse(widget);
  if (!checked.success) return { ok: false, error: `${type || 'widget'}: ${describeIssues(checked.error.issues)}.` };
  return { ok: true, widget: checked.data, summary };
}
