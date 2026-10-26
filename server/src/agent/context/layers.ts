// EX10.2: Compaction layers — pure transforms of a message history, cheapest first
// @see docs/phases/phase-ex10.md §3
//
// Positions: the "head" is the system prompt and the owner's request, never touched.
// After it come groups: an assistant message with its tool results, or a lone message.
// The latest groups (the shield) stay whole. Results are never left without their call.

import type { ChatMessage } from '../../llm/provider.js';

/** View tools and the argument that carries the whole view */
export const VIEW_TOOLS: Record<string, string> = { update_view: 'view', generate_schema: 'schema', validate_schema: 'schema' };
export const REMOVED_NOTE = '[Earlier steps were removed to fit the context window. Ask again for anything you still need.]';
export const SUMMARY_PREFIX = '[Earlier steps, summarized to save room]';
/** results this short are left alone: a stub would not be smaller */
const MIN_STUB_CHARS = 240;

export interface Group {
  start: number;
  /** exclusive */
  end: number;
}

/** Index just after the first user message (the request) */
export function headLength(messages: ChatMessage[]): number {
  const firstUser = messages.findIndex((m) => m.role === 'user');
  return firstUser < 0 ? Math.min(1, messages.length) : firstUser + 1;
}

export function groupsOf(messages: ChatMessage[], from: number): Group[] {
  const groups: Group[] = [];
  let i = from;
  while (i < messages.length) {
    let end = i + 1;
    if (messages[i]!.role === 'assistant') while (end < messages.length && messages[end]!.role === 'tool') end++;
    groups.push({ start: i, end });
    i = end;
  }
  return groups;
}

/** Start of the last `keep` groups that called tools (and everything after them) */
export function shieldFrom(messages: ChatMessage[], head: number, keep: number): number {
  const calls = groupsOf(messages, head).filter((g) => messages[g.start]!.tool_calls?.length);
  if (keep <= 0 || calls.length === 0) return messages.length;
  return calls.length <= keep ? calls[0]!.start : calls[calls.length - keep]!.start;
}

/**
 * EX10.2 follow-up: start of the protected tail, after an earlier agent project — the
 * messages that fit in `keepTokens` from the end, and the last `keepResults` tool results
 * (never fewer than one) wherever they sit. Results from here on are never trimmed.
 * Four whole turns of 5–7 log reads each were more than the plan compacts down to.
 */
export function protectedFrom(messages: ChatMessage[], head: number, keepResults: number, keepTokens: number, estimate: (m: ChatMessage[]) => number): number {
  let byTokens = messages.length;
  let tokens = 0;
  for (let i = messages.length - 1; i >= head; i--) {
    tokens += estimate([messages[i]!]);
    if (tokens > keepTokens) break;
    byTokens = i;
  }
  const results: number[] = [];
  for (let i = head; i < messages.length; i++) if (messages[i]!.role === 'tool') results.push(i);
  const byCount = results.length ? results[Math.max(0, results.length - Math.max(1, keepResults))]! : messages.length;
  return Math.max(head, Math.min(byTokens, byCount));
}

/** The start of the turn holding `index`: a cut there never parts a result from its call. */
export function groupStart(messages: ChatMessage[], head: number, index: number): number {
  for (const g of groupsOf(messages, head)) if (index >= g.start && index < g.end) return g.start;
  return index;
}

/** Start of the recent region kept verbatim by summarizing and dropping: the protected tail, from its turn's start. */
export function recentFrom(messages: ChatMessage[], head: number, keepResults: number, keepTokens: number, estimate: (m: ChatMessage[]) => number): number {
  return groupStart(messages, head, protectedFrom(messages, head, keepResults, keepTokens, estimate));
}

export function toolNames(messages: ChatMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const m of messages) for (const tc of m.tool_calls ?? []) names.set(tc.id, tc.function.name);
  return names;
}

export function stubFor(name: string, chars: number): string {
  return `[output trimmed — ${name}, ${chars} chars; run it again if you need it]`;
}

const isStub = (content: string) => content.startsWith('[output trimmed') || content.startsWith('Not run');

/** 1. Every view-tool call but the latest loses its (superseded) view. */
export function collapseViews(messages: ChatMessage[]): ChatMessage[] {
  let latest = -1;
  messages.forEach((m, i) => { if (m.tool_calls?.some((tc) => tc.function.name in VIEW_TOOLS)) latest = i; });
  if (latest < 0) return messages;
  let changed = false;
  const out = messages.map((m, i) => {
    if (i === latest || !m.tool_calls?.some((tc) => tc.function.name in VIEW_TOOLS)) return m;
    const tool_calls = m.tool_calls.map((tc) => {
      const key = VIEW_TOOLS[tc.function.name];
      if (!key) return tc;
      const args = JSON.stringify({ [key]: '[replaced by a later update_view]' });
      if (tc.function.arguments === args) return tc;
      changed = true;
      return { ...tc, function: { ...tc.function, arguments: args } };
    });
    return { ...m, tool_calls };
  });
  return changed ? out : messages;
}

/** 2./3. Tool results before `until` become stubs when `pick(name, content)` says so. */
export function stubResults(
  messages: ChatMessage[],
  head: number,
  until: number,
  pick: (name: string, content: string) => boolean,
): ChatMessage[] {
  const names = toolNames(messages);
  let changed = false;
  const out = messages.map((m, i) => {
    if (i < head || i >= until || m.role !== 'tool') return m;
    const content = m.content ?? '';
    if (content.length < MIN_STUB_CHARS || isStub(content)) return m;
    const name = (m.tool_call_id && names.get(m.tool_call_id)) || 'tool';
    if (!pick(name, content)) return m;
    changed = true;
    return { ...m, content: stubFor(name, content.length) };
  });
  return changed ? out : messages;
}

/** 5. Drop the oldest groups after the head (never from `keepFrom` on) until `fits`. */
export function dropOldest(messages: ChatMessage[], head: number, keepFrom: number, fits: (m: ChatMessage[]) => boolean): ChatMessage[] {
  const before = messages.slice(0, head);
  let middle = messages.slice(head, keepFrom).filter((m) => m.content !== REMOVED_NOTE);
  const rest = messages.slice(keepFrom);
  // one note says what happened, however many rounds of dropping there were
  const assemble = () => [...before, { role: 'user' as const, content: REMOVED_NOTE }, ...middle, ...rest];
  let dropped = false;
  while (middle.length > 0 && !fits(assemble())) {
    const first = groupsOf(middle, 0)[0]!;
    middle = middle.slice(first.end);
    dropped = true;
  }
  return dropped ? assemble() : messages;
}

/** The older region as plain text for the summarizer, bounded to `maxChars` (60% head / 35% tail). */
export function transcriptOf(messages: ChatMessage[], maxChars: number): string {
  const names = toolNames(messages);
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      if (m.content?.trim()) lines.push(`Assistant: ${m.content.trim()}`);
      for (const tc of m.tool_calls ?? []) lines.push(`Called ${tc.function.name}(${tc.function.arguments.slice(0, 300)})`);
    } else if (m.role === 'tool') {
      const name = (m.tool_call_id && names.get(m.tool_call_id)) || 'tool';
      lines.push(`Result of ${name}: ${(m.content ?? '').slice(0, 2_000)}`);
    } else if (m.role === 'user') {
      lines.push(`Note: ${m.content ?? ''}`);
    }
  }
  const text = lines.join('\n');
  if (text.length <= maxChars) return text;
  const headChars = Math.floor(maxChars * 0.6);
  const tailChars = Math.floor(maxChars * 0.35);
  return `${text.slice(0, headChars)}\n[… ${text.length - headChars - tailChars} chars elided …]\n${text.slice(-tailChars)}`;
}
