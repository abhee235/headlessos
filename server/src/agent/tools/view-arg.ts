// EX10.5: the view argument of update_view / generate_schema / validate_schema
// @see docs/phases/phase-ex10.md §6
//
// Models send the view as a JSON object (preferred) or as a JSON string. A string that
// does not parse is repaired when it can be (EX9.3 repairJson); otherwise the error says
// where it broke, so the model can fix that spot instead of resending the same string.

import { z } from 'zod';
import { repairJson } from '../loop/tool-input.js';

/** Zod for the argument: an object first (what we ask for), a string still accepted */
export const viewArgSchema = (description: string) =>
  z.union([z.record(z.string(), z.unknown()), z.string()]).describe(description);

export type ViewArg =
  | { ok: true; value: unknown; repaired: boolean }
  | { ok: false; error: string };

export function readViewArg(value: unknown, name: 'view' | 'schema'): ViewArg {
  if (value !== null && typeof value === 'object') return { ok: true, value, repaired: false };
  if (typeof value !== 'string') {
    return { ok: false, error: `${name}: expected a JSON object, you sent ${value === null ? 'null' : typeof value}.` };
  }
  try {
    return { ok: true, value: JSON.parse(value), repaired: false };
  } catch (err) {
    const repaired = repairJson(value);
    if (repaired !== undefined) return { ok: true, value: repaired, repaired: true };
    return { ok: false, error: jsonErrorAt(value, err, name) };
  }
}

/** "Invalid JSON in view at character 3121 (… "value": 12,} …)" — where it broke, and what is there */
export function jsonErrorAt(text: string, err: unknown, name: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const pos = Number(/position (\d+)/.exec(message)?.[1]);
  const fix = `send the ${name} again as a JSON object, not a string`;
  if (!Number.isFinite(pos)) return `Invalid JSON in ${name}: ${message}. Fix it and ${fix}.`;
  const excerpt = text.slice(Math.max(0, pos - 30), pos + 30).replace(/\s+/g, ' ');
  return `Invalid JSON in ${name} at character ${pos} (…${excerpt}…). Fix that spot and ${fix}.`;
}

/** Sections and widgets in a (partial) view, for short tool outputs */
export function viewCounts(view: unknown): { sections: number; widgets: number } {
  const sections = (view as { sections?: Record<string, unknown> })?.sections;
  let widgets = 0;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (typeof n.type === 'string' && !('layout' in n)) widgets++;
    if (Array.isArray(n.children)) walk(n.children);
    if (Array.isArray(n.tabs)) walk(n.tabs);
  };
  if (sections && typeof sections === 'object') Object.values(sections).forEach(walk);
  return { sections: sections && typeof sections === 'object' ? Object.keys(sections).length : 0, widgets };
}

export function describeCounts(c: { sections: number; widgets: number }): string {
  return `${c.sections} section${c.sections === 1 ? '' : 's'}, ${c.widgets} widget${c.widgets === 1 ? '' : 's'}`;
}
