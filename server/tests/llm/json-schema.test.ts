// M14.2: zod 4's converter gives models the same JSON Schema zod-to-json-schema did
// @see docs/phases/phase-14.md

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { jsonFromReply, jsonSchemaOf } from '../../src/llm/json-schema.js';

describe('jsonSchemaOf (M14.2)', () => {
  it('matches the old output: no extra keys, defaults optional and shown, descriptions kept', () => {
    const tool = z.object({
      path: z.string().describe('Directory'),
      lines: z.number().int().min(1).max(500).default(100),
      level: z.enum(['info', 'warn']).optional(),
    }).strict();
    // captured from zod 3.25 + zod-to-json-schema 3.24 ($refStrategy none, jsonSchema7)
    expect(jsonSchemaOf(tool)).toEqual({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory' },
        lines: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
        level: { type: 'string', enum: ['info', 'warn'] },
      },
      required: ['path'],
      additionalProperties: false,
    });
  });

  it('closes plain objects too, but leaves a map open to its values', () => {
    const json = jsonSchemaOf(z.object({ rows: z.array(z.object({ a: z.string() })), byName: z.record(z.string(), z.number()) }));
    expect(json.additionalProperties).toBe(false);
    const props = json.properties as Record<string, Record<string, unknown>>;
    expect((props.rows!.items as Record<string, unknown>).additionalProperties).toBe(false);
    expect(props.byName!.additionalProperties).toEqual({ type: 'number' });
  });

  it('never carries $schema, and turns what JSON Schema cannot express into {}', () => {
    const json = jsonSchemaOf(z.object({ when: z.date() }));
    expect(json).not.toHaveProperty('$schema');
    expect((json.properties as Record<string, unknown>).when).toEqual({});
  });
});

describe('jsonFromReply (M14.2)', () => {
  it('reads fenced or broken JSON, and names the model when it cannot', () => {
    expect(jsonFromReply('```json\n{"a":1}\n```', 'OpenAI')).toEqual({ a: 1 });
    expect(jsonFromReply('{"a":1,}', 'OpenAI')).toEqual({ a: 1 });
    expect(() => jsonFromReply('nope', 'OpenAI')).toThrow('OpenAI returned text that is not JSON: nope');
  });
});
