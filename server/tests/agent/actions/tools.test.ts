// EX9.1: actions as native tools, per-run selection, model-facing output
// @see docs/phases/phase-ex9.md §6

import { describe, it, expect, vi } from 'vitest';
import { actionTool, formatForModel, selectActions, CORE_ACTIONS, MODEL_OUTPUT_CHARS } from '../../../src/agent/actions/tools.js';
import { getDefaultCatalog } from '../../../src/agent/actions/catalog/index.js';
import { toolsToOpenAIFunctions } from '../../../src/agent/tools/tool-converter.js';
import type { ToolContext } from '../../../src/agent/tools/types.js';
import type { ActionRunResult } from '../../../src/agent/actions/types.js';

const catalog = getDefaultCatalog();

function context(stdout = 'ok', exitCode = 0): ToolContext {
  return {
    serverId: 'srv',
    ssh: { exec: vi.fn().mockResolvedValue({ stdout, stderr: '', exitCode, durationMs: 2 }), getSftp: vi.fn() } as unknown as ToolContext['ssh'],
    templateRegistry: {} as ToolContext['templateRegistry'],
    previousOutputs: new Map(),
  };
}

const result = (over: Partial<ActionRunResult>): ActionRunResult => ({
  ok: true, actionId: 'x', command: 'x', exitCode: 0, stdout: '', stderr: '', truncated: false, durationMs: 1, ...over,
});

describe('actionTool', () => {
  it('names the tool after the action and describes it in one line', () => {
    const tool = actionTool(catalog.get('service_status')!);
    expect(tool.name).toBe('service_status');
    expect(tool.securityTier).toBe('action');
    expect(tool.description).toMatch(/^Service status\. Status of one systemd unit/);
  });

  it('turns into a valid OpenAI function with typed parameters', () => {
    const [fn] = toolsToOpenAIFunctions([actionTool(catalog.get('service_logs')!)]);
    expect(fn!.function.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    const params = fn!.function.parameters as { properties: Record<string, { type?: string; enum?: string[] }>; required?: string[] };
    expect(params.properties.unit!.type).toBe('string');
    expect(params.properties.lines!.type).toBe('integer');
    expect(params.properties.since!.enum).toEqual(['15m', '1h', '6h', '24h', '7d']);
    expect(params.required).toEqual(['unit']);
  });

  it('runs through the runner and returns the built command as metadata', async () => {
    const ctx = context('Filesystem Size Used');
    const out = await actionTool(catalog.get('disk_usage')!).execute({}, ctx);
    expect(out).toMatchObject({ success: true, output: 'Filesystem Size Used', metadata: { actionId: 'disk_usage', command: 'df -hT', exitCode: 0 } });
    expect(ctx.ssh.exec).toHaveBeenCalledWith('srv', 'df -hT', 15_000);
  });

  it('returns the validation error to the model without touching SSH', async () => {
    const ctx = context();
    const out = await actionTool(catalog.get('service_status')!).execute({ unit: 'x y' }, ctx);
    expect(out.success).toBe(false);
    expect(out.output).toMatch(/^error: service_status: unit: expected a systemd unit name/);
    expect(ctx.ssh.exec).not.toHaveBeenCalled();
  });

  it('uses the runner from the context when there is one', async () => {
    const run = vi.fn().mockResolvedValue(result({ actionId: 'uptime', command: 'uptime', stdout: 'up' }));
    const ctx = { ...context(), actions: { run } as never, runId: 'r1' };
    await actionTool(catalog.get('uptime')!).execute({}, ctx);
    expect(run).toHaveBeenCalledWith('srv', 'uptime', {}, { runId: 'r1' });
  });
});

describe('formatForModel', () => {
  it('prefers parsed data, as compact JSON', () => {
    expect(formatForModel(result({ stdout: 'raw', data: [{ a: 1 }] }))).toBe('[{"a":1}]');
  });

  it('marks failures, empty output, stderr and truncation', () => {
    const text = formatForModel(result({ ok: false, error: 'exit code 1', stdout: '', stderr: 'boom', truncated: true }));
    expect(text.split('\n')).toEqual(['failed: exit code 1', '(no output)', '[output cut — ask for less, e.g. fewer lines or a narrower path]', 'stderr: boom']);
  });

  it('caps what the model sees, keeping the tail for logs', () => {
    const long = Array.from({ length: 4000 }, (_, i) => `row ${i}`).join('\n');
    const head = formatForModel(result({ stdout: long }));
    const tail = formatForModel(result({ stdout: long }), 'tail');
    expect(head.length).toBeLessThan(MODEL_OUTPUT_CHARS + 200);
    expect(head.startsWith('row 0')).toBe(true);
    expect(tail).toContain('row 3999');
    expect(tail).toContain('[earlier output cut]');
  });

  it('shows only the error when nothing was built', () => {
    expect(formatForModel(result({ ok: false, command: '', error: 'No such action: x' }))).toBe('error: No such action: x');
  });
});

describe('selectActions', () => {
  it('returns everything when the catalog fits', () => {
    expect(selectActions('anything', { max: 200 })).toHaveLength(catalog.list({ risk: 'read' }).length);
  });

  it('always includes the core set, in catalog order, up to max', () => {
    const picked = selectActions('why is my website slow', { max: 20 });
    expect(picked).toHaveLength(20);
    const ids = picked.map((a) => a.id);
    for (const core of CORE_ACTIONS) expect(ids).toContain(core);
    const order = catalog.list().map((a) => a.id);
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it('picks the actions a request is about', () => {
    const docker = selectActions('my docker container keeps restarting', { max: 15 }).map((a) => a.id);
    expect(docker).toEqual(expect.arrayContaining(['docker_containers', 'docker_logs', 'docker_inspect']));
    const tls = selectActions('when does my ssl certificate expire?', { max: 15 }).map((a) => a.id);
    expect(tls).toContain('tls_certificates');
    const ports = selectActions('which ports are open', { max: 15 }).map((a) => a.id);
    expect(ports).toContain('listening_ports');
  });

  it('is stable for the same request', () => {
    expect(selectActions('disk full', { max: 12 })).toEqual(selectActions('disk full', { max: 12 }));
  });
});
