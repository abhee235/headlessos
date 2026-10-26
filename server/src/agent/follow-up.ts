// EX10.9: follow-up requests refine the open view; unclear requests get a question
// @see docs/phases/phase-ex10.md §9c
//
// The client sends the earlier request and the view as it is now. The planner gets an
// outline of it; the executor starts from it (ToolContext.workingView).

import { DynamicViewSchema, type DynamicView } from 'headlessos-shared/schemas/dynamic-view';

export interface FollowUp {
  /** the request that built the open view */
  prompt: string;
  view: DynamicView;
}

export const MAX_FOLLOW_UP_PROMPT = 2_000;
export const MAX_FOLLOW_UP_VIEW_BYTES = 256 * 1024;
/** widgets listed in an outline; the rest are counted */
const OUTLINE_WIDGETS = 40;

/** A follow-up from the client, or null when it is missing, too big or not a valid view (a new request then). */
export function readFollowUp(raw: unknown): FollowUp | null {
  if (!raw || typeof raw !== 'object') return null;
  const { prompt, view } = raw as { prompt?: unknown; view?: unknown };
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_FOLLOW_UP_PROMPT) return null;
  let size: number;
  try {
    size = JSON.stringify(view ?? null).length;
  } catch {
    return null;
  }
  if (size > MAX_FOLLOW_UP_VIEW_BYTES) return null;
  const parsed = DynamicViewSchema.safeParse(view);
  return parsed.success ? { prompt: prompt.trim(), view: parsed.data } : null;
}

type Node = { type?: string; title?: string; label?: string; layout?: string; children?: Node[]; tabs?: Array<{ id: string; label: string; children?: Node[] }> };

/**
 * The open view in a few lines: its title, then per section its label and widgets as
 * `type 'title'`; with `positions`, each widget's 0-based index in its section (or tab).
 */
export function outlineView(view: DynamicView, positions = false): string {
  const lines = [`"${view.title}"`];
  let listed = 0;
  let more = 0;
  const describe = (nodes: Node[] | undefined) => (nodes ?? []).map((w, i) => {
    if (listed >= OUTLINE_WIDGETS) {
      more++;
      return null;
    }
    listed++;
    const name = w.layout ? `${w.layout} layout` : `${w.type ?? 'widget'}${w.title ? ` '${w.title}'` : w.label ? ` '${w.label}'` : ''}`;
    return positions ? `[${i}] ${name}` : name;
  }).filter(Boolean).join(', ');
  for (const item of view.sidebarItems) {
    const section = view.sections[item.id] as unknown as Node | undefined;
    if (Array.isArray(section?.tabs)) {
      const tabs = section.tabs.map((t) => `tab ${t.id} "${t.label}": ${describe(t.children) || 'empty'}`).join('; ');
      lines.push(`- ${item.id} "${item.label}": ${tabs || 'no tabs'}`);
    } else {
      lines.push(`- ${item.id} "${item.label}": ${describe(section?.children) || 'empty'}`);
    }
  }
  if (more) lines.push(`(and ${more} more widgets)`);
  return lines.join('\n');
}

/** EX10.9: what to ask when a request names nothing to show */
export const VAGUE_QUESTION = 'What would you like to see? For example: system health, logs, Docker containers, services, disk or network.';

/** words that name nothing on a server ("help", "fix it", "show me stuff", "what's wrong") */
const NAMES_NOTHING = new Set([
  'a', 'an', 'the', 'it', 'its', 'this', 'that', 'these', 'those', 'me', 'my', 'i', 'you', 'we', 'us', 'for', 'to', 'of', 'on', 'in', 'up', 'there', 'here',
  'help', 'fix', 'fixed', 'repair', 'stuff', 'thing', 'things', 'something', 'anything', 'everything', 'please', 'pls', 'do', 'make', 'show', 'see', 'look',
  'check', 'tell', 'give', 'get', 'hi', 'hello', 'hey', 'ok', 'okay', 'thanks', 'thank', 'what', 'whats', 's', 'is', 'are', 'wrong', 'going', 'happening',
  'can', 'could', 'would', 'will', 'should', 'now', 'just', 'some', 'any', 'all', 'again', 'start', 'go',
]);

/**
 * EX10.9: true when no word of the request names anything: the planner, asked to build
 * something from "help" or "fix it", guesses (live: a view called "Planner Output").
 */
export function namesNothing(request: string): boolean {
  const words = request.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean);
  return words.length > 0 && words.length <= 8 && words.every((w) => NAMES_NOTHING.has(w));
}
