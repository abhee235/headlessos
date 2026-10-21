// EX10.6: tool input for every tool — plain JSON Schema, nulls dropped, one-line errors
// @see docs/phases/phase-ex10.md §7

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { checkToolArgs, describeZodIssues, dropNullArgs, zodSignature } from '../../../src/agent/loop/tool-input.js';
import { toolsToOpenAIFunctions } from '../../../src/agent/tools/tool-converter.js';
import { searchTemplatesTool } from '../../../src/agent/tools/search-templates.js';
import { executeToolCall } from '../../../src/agent/loop/run-loop.js';
import { ReactiveExecutor } from '../../../src/agent/executor.js';
import { ToolRegistry } from '../../../src/agent/tools/tool-registry.js';
import type { AgentTool, ToolContext } from '../../../src/agent/tools/types.js';
import type { ChatMessage } from '../../../src/llm/provider.js';

const registry = { listAll: vi.fn().mockReturnValue([]), search: vi.fn().mockReturnValue([]), searchByTag: vi.fn().mockReturnValue([]), matchCommand: vi.fn().mockReturnValue([]) };
const ctx = { serverId: 's', previousOutputs: new Map(), templateRegistry: registry } as unknown as ToolContext;

describe('every tool gets plain JSON Schema', () => {
  it('keeps optional fields optional and not nullable (search_templates)', () => {
    const [fn] = toolsToOpenAIFunctions([searchTemplatesTool]);
    const params = fn!.function.parameters as { required?: string[]; properties: Record<string, { type?: unknown; anyOf?: unknown }> };
    expect(params.required ?? []).toEqual([]);
    expect(params.properties.tag).toMatchObject({ type: 'string' });
    expect(JSON.stringify(params)).not.toContain('"null"');
  });
});

describe('argument helpers', () => {
  it('dropNullArgs removes top-level nulls only', () => {
    expect(dropNullArgs({ query: 'x', tag: null, view: { description: null } })).toEqual({ query: 'x', view: { description: null } });
    expect(dropNullArgs(null)).toEqual({});
    expect(dropNullArgs('text')).toBe('text');
  });

  it('describes problems in one line each, with the signature', () => {
    const tool = { name: 'grep_output', parameters: z.object({ pattern: z.string(), tool: z.string().optional(), limit: z.number().optional() }) };
    expect(checkToolArgs(tool, { pattern: 'err' })).toEqual({ ok: true });
    expect(checkToolArgs(tool, { limit: 'ten' })).toEqual({
      ok: false,
      error: 'grep_output: pattern: required (string); limit: expected number, you sent "ten". Parameters: grep_output(pattern, tool?, limit?)',
    });
    const parsed = z.object({ a: z.string() }).strict().safeParse({ a: 'x', b: 1 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(describeZodIssues(parsed.error, { a: 'x', b: 1 })).toEqual(['unknown parameter(s) b']);
    expect(zodSignature('f', 'not a schema')).toBe('f(…)');
  });
});

describe('the failing call from the 2026-10-22 trace', () => {
  it('search_templates with null optionals runs in the shared loop', async () => {
    const tools = new Map<string, AgentTool>([['search_templates', searchTemplatesTool]]);
    const out = await executeToolCall('search_templates', '{"query":"planner","tag":null,"command":null}', tools, ctx);
    expect(out.ok).toBe(true);
    expect(out.input).toEqual({ query: 'planner' });
    expect(registry.search).toHaveBeenCalledWith('planner');
  });

  it('and in the UI Agent executor; a bad argument gets one line, not a Zod dump', async () => {
    const reg = new ToolRegistry();
    reg.register(searchTemplatesTool);
    const reply = (args: string) => ({ message: { role: 'assistant', content: null, tool_calls: [{ id: `c${args.length}`, type: 'function', function: { name: 'search_templates', arguments: args } }] }, tokensUsed: { input: 0, output: 1 }, latencyMs: 1, model: 'm', finishReason: 'tool_calls' });
    const chat = vi.fn()
      .mockResolvedValueOnce(reply('{"query":"planner","tag":null,"command":null}'))
      .mockResolvedValueOnce(reply('{"query":42}'))
      .mockRejectedValueOnce(new Error('stop'));
    const executor = new ReactiveExecutor({ chat, toolProvider: null } as never, reg);
    await (async () => { for await (const _ of executor.execute({ intent: 'x', interactivityLevel: 'display-only', expectedWidgets: [], dataSourceHints: [], securityRequirements: { needsWrite: false, needsSFTP: false, sensitiveData: false }, estimatedComplexity: 'simple' } as never, ctx)) { /* drain */ } })().catch(() => undefined);
    const toolMessages = (chat.mock.calls[2]![0].messages as ChatMessage[]).filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content!));
    expect(toolMessages[0]).toMatchObject({ success: true });
    expect(toolMessages[1]).toEqual({ success: false, error: 'search_templates: query: expected string, you sent 42. Parameters: search_templates(query?, tag?, command?)' });
  });
});
