// EX10.5: the view argument of update_view / generate_schema / validate_schema
// EX10.12: keys pushed into `sections` are moved back; a string still wrong once its
// brackets close gets told what is wrong, not only where the JSON broke
// @see docs/phases/phase-ex10.md §6, §8c
//
// Models send the view as a JSON object (preferred) or as a JSON string. A string that
// does not parse is repaired when it can be (EX9.3 repairJson); otherwise the error says
// where it broke, so the model can fix that spot instead of resending the same string.

import { z } from 'zod';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import { repairJson, repairNearError } from '../loop/tool-input.js';

/** Zod for the argument at runtime: an object, or a string we parse or repair */
export const viewArgSchema = (description: string) =>
  z.union([z.record(z.string(), z.unknown()), z.string()]).describe(description);

/**
 * EX10.5 follow-up: what the model is shown — an object only. Offered "object or string",
 * a small model wrote strings, and its strings had mismatched brackets.
 */
export function viewInputSchema(key: 'view' | 'schema', description: string): Record<string, unknown> {
  return {
    type: 'object',
    properties: { [key]: { type: 'object', description, additionalProperties: true } },
    required: [key],
    additionalProperties: false,
  };
}

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
    // EX10.5 follow-up: a repair is used only when the result is a valid view — a guessed
    // structure must not reach the owner's window. The syntax ladder first, then moving one
    // bracket near the error; otherwise the model gets the position and sends it again.
    const valid = (v: unknown) => DynamicViewSchema.safeParse(v).success;
    const ladder = repairJson(value);
    const hoisted = hoistTopLevel(ladder);
    const repaired = [ladder, hoisted].find((v) => v && valid(v)) ?? repairNearError(value, valid);
    if (repaired && valid(repaired)) return { ok: true, value: repaired, repaired: true };
    // EX10.12: the brackets close, but that is not a view yet — say what is missing
    const closed = hoisted ?? ladder;
    const still = closed && typeof closed === 'object' ? viewProblems(closed) : '';
    return { ok: false, error: jsonErrorAt(value, err, name) + (still ? ` With the brackets fixed, the ${name} still has: ${still}.` : '') };
  }
}

/** EX10.12: the view's own keys, and what each must look like to be one */
const TOP_LEVEL: Record<string, (v: unknown) => boolean> = {
  title: (v) => typeof v === 'string',
  description: (v) => typeof v === 'string',
  icon: (v) => typeof v === 'string',
  sidebarItems: (v) => Array.isArray(v),
  meta: (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !('layout' in v),
};

/**
 * EX10.12: a container closed too early leaves the view's own keys inside `sections`
 * (a section is a layout object, never a string or an array). They move back to the
 * top; null when nothing moved.
 */
export function hoistTopLevel(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const view = value as Record<string, unknown>;
  if (!view.sections || typeof view.sections !== 'object' || Array.isArray(view.sections)) return null;
  const sections = { ...(view.sections as Record<string, unknown>) };
  const out: Record<string, unknown> = { ...view, sections };
  let moved = false;
  for (const [key, fits] of Object.entries(TOP_LEVEL)) {
    if (key in sections && !(key in view) && fits(sections[key])) {
      out[key] = sections[key];
      delete sections[key];
      moved = true;
    }
  }
  return moved ? out : null;
}

/** EX10.12: "sections.logs.layout: missing or wrong, expected one of stack, grid, tabs" — at most three */
export function viewProblems(value: unknown, max = 3): string {
  const parsed = DynamicViewSchema.safeParse(value);
  return parsed.success ? '' : describeIssues(parsed.error.issues, max);
}

/** Zod issues in plain words, at most `max` (EX10.10: widgets too) */
export function describeIssues(issues: readonly z.ZodIssue[], max = 3, whole = 'the view'): string {
  return issues.slice(0, max).map((issue) => {
    const where = issue.path.join('.') || whole;
    // M14.2: zod 4 reports a bad discriminator as invalid_union with its options, and a missing field only in words
    if (issue.code === 'invalid_union' && 'options' in issue && Array.isArray(issue.options)) return `${where}: missing or wrong, expected one of ${issue.options.map(String).join(', ')}`;
    if (issue.code === 'invalid_type' && /received undefined$/.test(issue.message)) return `${where}: missing (${issue.expected})`;
    return `${where}: ${issue.message}`;
  }).join('; ');
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
