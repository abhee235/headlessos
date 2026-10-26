// M14.2: JSON Schema from a Zod schema — zod 4's own converter (zod-to-json-schema is zod 3 only)
// @see docs/phases/phase-14.md
//
// Input mode: a field with a default stays optional, as a caller (a model) may leave it out.
// Types JSON Schema cannot express (dates, transforms) become {} instead of throwing.
// Every object says `additionalProperties: false`, as zod-to-json-schema did, so models are
// told not to add keys; maps (z.record) keep their value schema there.

import { z } from 'zod';
import { repairJson } from '../agent/loop/tool-input.js';

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'input',
    unrepresentable: 'any',
    override: (ctx) => {
      const out = ctx.jsonSchema as Record<string, unknown>;
      if ((ctx.zodSchema as { _zod: { def: { type: string } } })._zod.def.type === 'object' && out.additionalProperties === undefined) out.additionalProperties = false;
    },
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** A reply's JSON value: code fences stripped, broken JSON repaired (EX9.3's ladder). `who` names the model in the error. */
export function jsonFromReply(text: string, who: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch { /* repaired below */ }
  const repaired = repairJson(t);
  if (repaired !== undefined) return repaired;
  throw new Error(`${who} returned text that is not JSON: ${t.slice(0, 120)}`);
}
