// M14.2: OpenAI parsing under zod 4 — strict when the helper allows, a plain JSON schema otherwise
// @see docs/phases/phase-14.md

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type OpenAI from 'openai';
import { OpenAIProvider, textFormatFor } from '../../src/llm/providers/openai.js';

function fakeClient(reply: { output_parsed?: unknown; output_text?: string }) {
  const usage = { input_tokens: 12, output_tokens: 3 };
  const parse = vi.fn().mockResolvedValue({ output_parsed: reply.output_parsed ?? null, usage });
  const create = vi.fn().mockResolvedValue({ output_text: reply.output_text ?? '', usage });
  return { client: { responses: { parse, create } } as unknown as OpenAI, parse, create };
}

describe('textFormatFor (M14.2)', () => {
  it('keeps strict structured output for a schema strict mode can express', () => {
    expect(textFormatFor(z.object({ used: z.number(), mount: z.string() })).kind).toBe('strict');
  });

  it('sends a plain JSON schema for optional fields and maps, and plain text for a string', () => {
    const optional = textFormatFor(z.object({ used: z.number(), note: z.string().optional() }));
    expect(optional).toMatchObject({ kind: 'json', format: { type: 'json_schema', strict: false, schema: { type: 'object' } } });
    expect(textFormatFor(z.object({ rows: z.array(z.record(z.string(), z.unknown())) })).kind).toBe('json');
    expect(textFormatFor(z.string()).kind).toBe('text');
  });
});

describe('OpenAIProvider.parseText (M14.2)', () => {
  it('parses strict output through responses.parse', async () => {
    const { client, parse, create } = fakeClient({ output_parsed: { used: 6 } });
    const res = await new OpenAIProvider('k', 'gpt-6-luna', client).parseText({ rawOutput: 'x', command: 'df', schema: z.object({ used: z.number() }) });
    expect(res).toMatchObject({ data: { used: 6 }, tokensUsed: { input: 12, output: 3 } });
    expect(parse).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('asks for a plain JSON schema and checks the reply with Zod when strict mode cannot express the schema', async () => {
    const schema = z.object({ used: z.number(), note: z.string().optional() });
    const { client, create } = fakeClient({ output_text: '```json\n{"used": 6}\n```' });
    const res = await new OpenAIProvider('k', 'gpt-6-luna', client).parseText({ rawOutput: 'x', command: 'df', schema });
    expect(res.data).toEqual({ used: 6 });
    expect(create.mock.calls[0]![0].text.format).toMatchObject({ type: 'json_schema', name: 'parsed_output', strict: false });
  });

  it('rejects a reply that does not match the schema', async () => {
    const { client } = fakeClient({ output_text: '{"used": "six"}' });
    await expect(new OpenAIProvider('k', 'gpt-6-luna', client).parseText({ rawOutput: 'x', command: 'df', schema: z.object({ used: z.number(), note: z.string().optional() }) })).rejects.toThrow();
  });

  it('returns plain text for a string schema (summaries), with no format sent', async () => {
    const { client, create } = fakeClient({ output_text: '  Disk is 6% used.  ' });
    const res = await new OpenAIProvider('k', 'gpt-6-luna', client).parseText({ rawOutput: 'x', command: 'summarize', schema: z.string() });
    expect(res.data).toBe('Disk is 6% used.');
    expect(create.mock.calls[0]![0]).not.toHaveProperty('text');
  });
});
