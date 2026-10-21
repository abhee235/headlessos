// EX9.4: Context trimming — keep a run inside the model's window
// @see docs/phases/phase-ex9.md §9
//
// Tokens are estimated as chars / 4. Over budget: older tool results become a
// one-line stub (the latest few stay whole); still over: the oldest call/result
// groups are dropped. The system prompt and the first user message always stay,
// and a tool result is never left without the call that asked for it.

import type { ChatMessage } from '../../llm/provider.js';

export const KEEP_RECENT_RESULTS = 4;
/** OpenAI models without a declared window: generous, the trimming rarely matters */
export const DEFAULT_WINDOW = 128_000;

export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += (m.content ?? '').length;
    for (const tc of m.tool_calls ?? []) chars += tc.function.name.length + tc.function.arguments.length;
  }
  return Math.ceil(chars / 4);
}

/** Tokens left for history: the window, less a reserve for the reply and the tool list. */
export function historyBudget(contextWindow: number | undefined, toolTokens: number): number {
  const window = contextWindow ?? DEFAULT_WINDOW;
  const reserve = Math.min(4096, Math.floor(window * 0.25));
  return Math.max(512, window - reserve - toolTokens);
}

/** Returns a (possibly) shorter copy of the history that fits `budget` tokens. */
export function trimHistory(messages: ChatMessage[], budget: number, keepRecent = KEEP_RECENT_RESULTS): ChatMessage[] {
  if (estimateTokens(messages) <= budget) return messages;
  const nameOf = new Map<string, string>();
  for (const m of messages) for (const tc of m.tool_calls ?? []) nameOf.set(tc.id, tc.function.name);

  // 1. stub older tool results
  const toolIdx = messages.flatMap((m, i) => (m.role === 'tool' ? [i] : []));
  const stubbable = new Set(toolIdx.slice(0, Math.max(0, toolIdx.length - keepRecent)));
  let out = messages.map((m, i) => {
    if (!stubbable.has(i) || (m.content ?? '').startsWith('[output trimmed')) return m;
    const name = (m.tool_call_id && nameOf.get(m.tool_call_id)) || 'tool';
    return { ...m, content: `[output trimmed — ${name}, ${(m.content ?? '').length} chars; run it again if you need it]` };
  });
  if (estimateTokens(out) <= budget) return out;

  // 2. drop the oldest assistant-call groups (with their results), after the first user message
  const firstUser = out.findIndex((m) => m.role === 'user');
  const head = out.slice(0, firstUser + 1);
  let rest = out.slice(firstUser + 1).filter((m) => m.content !== REMOVED_NOTE);
  let dropped = false;
  while (estimateTokens([...head, ...rest]) > budget) {
    const start = rest.findIndex((m) => m.role === 'assistant');
    const latest = rest.map((m) => m.role).lastIndexOf('assistant');
    if (start < 0 || start >= latest) break; // keep the latest turn whatever it costs
    let end = start + 1;
    while (end < rest.length && rest[end]!.role === 'tool') end++;
    rest = [...rest.slice(0, start), ...rest.slice(end)];
    dropped = true;
  }
  const hadNote = out.some((m) => m.content === REMOVED_NOTE);
  return dropped || hadNote ? [...head, { role: 'user', content: REMOVED_NOTE }, ...rest] : [...head, ...rest];
}

const REMOVED_NOTE = '[Earlier steps were removed to fit the context window. Ask again for anything you still need.]';
