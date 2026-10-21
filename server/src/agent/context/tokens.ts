// EX10.2: Token estimates — chars / 4, corrected by the provider's real count (manager.ts)
// @see docs/phases/phase-ex10.md §1, §3

import type { ChatCompletionTool, ChatMessage } from '../../llm/provider.js';

export function estimateText(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Content plus tool-call names and arguments, chars / 4 */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += (m.content ?? '').length;
    for (const tc of m.tool_calls ?? []) chars += tc.function.name.length + tc.function.arguments.length;
  }
  return Math.ceil(chars / 4);
}

/** The tool list's share of every request, plus a little for the chat template */
export function estimateToolsTokens(tools: ChatCompletionTool[]): number {
  return tools.length ? Math.ceil(JSON.stringify(tools).length / 4) + 256 : 256;
}
