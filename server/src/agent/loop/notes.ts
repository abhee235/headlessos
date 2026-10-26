// EX10.11: Notes to the model — reminders ride on the last tool result
// @see docs/phases/phase-ex10.md §8c
//
// A reminder sent as a user message reads like the owner speaking, and small models
// answer it ("Understood, I will…") instead of acting. Attached to the tool result the
// model is about to read, it stays part of the step. JSON results get a `note` field;
// text results a trailing paragraph. With no tool result to carry it, a user message.

import type { ChatMessage } from '../../llm/provider.js';

export const NOTE_END = 'Do not reply to this note.';

/** The text with the closing line, once. */
export function asNote(text: string): string {
  const t = text.trim();
  return t.endsWith(NOTE_END) ? t : `${t} ${NOTE_END}`;
}

export function appendNote(messages: ChatMessage[], text: string): void {
  const note = asNote(text);
  const last = messages[messages.length - 1];
  if (last?.role !== 'tool') {
    messages.push({ role: 'user', content: note });
    return;
  }
  const content = last.content ?? '';
  const obj = parseObject(content);
  if (obj) {
    obj.note = typeof obj.note === 'string' && obj.note ? `${obj.note}\n${note}` : note;
    last.content = JSON.stringify(obj);
  } else {
    last.content = `${content}\n\nNote: ${note}`;
  }
}

function parseObject(text: string): Record<string, unknown> | null {
  if (!text.trimStart().startsWith('{')) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
