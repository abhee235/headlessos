// EX10.11: notes to the model ride on the last tool result
// @see docs/phases/phase-ex10.md §8c

import { describe, it, expect } from 'vitest';
import { NOTE_END, appendNote, asNote } from '../../../src/agent/loop/notes.js';
import type { ChatMessage } from '../../../src/llm/provider.js';

const base = (): ChatMessage[] => [
  { role: 'system', content: 's' },
  { role: 'user', content: 'u' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'uptime', arguments: '{}' } }] },
];

describe('notes', () => {
  it('ends every note with the closing line, once', () => {
    expect(asNote('3 steps left.')).toBe(`3 steps left. ${NOTE_END}`);
    expect(asNote(`3 steps left. ${NOTE_END}`)).toBe(`3 steps left. ${NOTE_END}`);
  });

  it('adds a `note` field to a JSON tool result, and appends to one already there', () => {
    const messages = [...base(), { role: 'tool' as const, tool_call_id: 'c1', content: JSON.stringify({ success: false, output: '', error: 'No such file' }) }];
    appendNote(messages, 'First.');
    appendNote(messages, 'Second.');
    expect(messages).toHaveLength(4);
    expect(JSON.parse(messages[3]!.content!)).toEqual({
      success: false, output: '', error: 'No such file', note: `First. ${NOTE_END}\nSecond. ${NOTE_END}`,
    });
  });

  it('appends a paragraph to a text tool result, after any server_output marker', () => {
    const messages = [...base(), { role: 'tool' as const, tool_call_id: 'c1', content: '<server_output action="uptime">\nup 3 days\n</server_output>' }];
    appendNote(messages, 'You have called uptime 3 times.');
    expect(messages[3]!.content).toBe(`<server_output action="uptime">\nup 3 days\n</server_output>\n\nNote: You have called uptime 3 times. ${NOTE_END}`);
  });

  it('is a user message when the last message is not a tool result', () => {
    const messages: ChatMessage[] = [{ role: 'system', content: 's' }, { role: 'assistant', content: 'Let me check.' }];
    appendNote(messages, 'Make the call.');
    expect(messages.at(-1)).toEqual({ role: 'user', content: `Make the call. ${NOTE_END}` });
  });

  it('treats a JSON array result as text', () => {
    const messages = [...base(), { role: 'tool' as const, tool_call_id: 'c1', content: '[1,2]' }];
    appendNote(messages, 'x');
    expect(messages[3]!.content).toBe(`[1,2]\n\nNote: x ${NOTE_END}`);
  });
});
