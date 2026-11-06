// M15.13: output that falls through to the LLM has its secrets removed first
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ParsingPipeline } from '../../src/parsers/pipeline.js';
import type { LLMProvider } from '../../src/llm/provider.js';

describe('the LLM fallback', () => {
  it('never sends a secret from server output', async () => {
    const sent: string[] = [];
    const provider = {
      parseText: async ({ rawOutput }: { rawOutput: string }) => {
        sent.push(rawOutput);
        return { data: { ok: true }, tokensUsed: 0, model: 'test' };
      },
    } as unknown as LLMProvider;

    const pipeline = new ParsingPipeline('pipeline-test');
    pipeline.setLLMProvider(provider);

    await pipeline.parse(
      'some-unknown-command',
      'DB_PASSWORD=hunter2-secret\nkey sk-ant-api03-hunter2secret000000000000\nstatus ok\n',
      z.object({ ok: z.boolean() }),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain('hunter2');
    expect(sent[0]).toContain('status ok');
  });
});
