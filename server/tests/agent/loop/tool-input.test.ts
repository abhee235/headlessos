// EX9.3: weak-model input handling
// @see docs/phases/phase-ex9.md §8

import { describe, it, expect } from 'vitest';
import {
  parseToolArgs, repairJson, extractProseToolCalls, normalizeKeys, malformedArgsMessage,
} from '../../../src/agent/loop/tool-input.js';
import { ActionRunner } from '../../../src/agent/actions/runner.js';

describe('parseToolArgs', () => {
  it('passes objects through and parses valid JSON', () => {
    expect(parseToolArgs({ unit: 'nginx' })).toEqual({ input: { unit: 'nginx' }, via: 'exact' });
    expect(parseToolArgs('{"unit":"nginx"}')).toEqual({ input: { unit: 'nginx' }, via: 'exact' });
    expect(parseToolArgs('')).toEqual({ input: {}, via: 'exact' });
    expect(parseToolArgs(null)).toEqual({ input: {}, via: 'exact' });
  });

  it.each([
    ['trailing comma', '{"unit": "nginx",}', { unit: 'nginx' }],
    ['bare keys', '{unit: "nginx", lines: 5}', { unit: 'nginx', lines: 5 }],
    ['single quotes', "{'unit': 'nginx'}", { unit: 'nginx' }],
    ['prose around it', 'Sure! Here you go: {"unit":"nginx"} hope that helps', { unit: 'nginx' }],
    ['truncated string', '{"unit": "ngi', { unit: 'ngi' }],
    ['truncated after a key', '{"unit": "nginx", "lines":', { unit: 'nginx' }],
    ['truncated nested', '{"program": "restic", "subcommands": ["backup"', { program: 'restic', subcommands: ['backup'] }],
  ])('repairs %s', (_label, text, expected) => {
    expect(parseToolArgs(text)).toEqual({ input: expected, via: 'repaired' });
  });

  it('gives up on text with no object, keeping what was sent', () => {
    expect(parseToolArgs('restart nginx please')).toEqual({ input: {}, via: 'raw', raw: 'restart nginx please' });
    expect(repairJson('[1,2]')).toBeUndefined();
  });

  it('phrases the give-up for the model', () => {
    expect(malformedArgsMessage('service_status', 'unit=nginx', ['unit', 'lines']))
      .toBe('service_status was called with arguments that are not valid JSON and could not be repaired. You sent: unit=nginx. Call service_status again with one JSON object using these keys: unit, lines.');
  });
});

describe('extractProseToolCalls', () => {
  const tools = ['disk_usage', 'service_status'];

  it('finds a call in a ```json fence', () => {
    const text = 'I will check.\n```json\n{"name": "service_status", "arguments": {"unit": "nginx"}}\n```';
    expect(extractProseToolCalls(text, tools)).toEqual([{ name: 'service_status', input: { unit: 'nginx' } }]);
  });

  it('finds a <tool_call> block with string arguments, case-insensitively', () => {
    const text = '<tool_call>{"name":"Disk_Usage","arguments":"{}"}</tool_call>';
    expect(extractProseToolCalls(text, tools)).toEqual([{ name: 'disk_usage', input: {} }]);
  });

  it('reads OpenAI-shaped and array forms', () => {
    const text = '[{"function":{"name":"service_status","arguments":"{\\"unit\\":\\"ssh\\"}"}}, {"tool":"disk_usage","parameters":{}}]';
    expect(extractProseToolCalls(text, tools)).toEqual([
      { name: 'service_status', input: { unit: 'ssh' } },
      { name: 'disk_usage', input: {} },
    ]);
  });

  it('ignores tools that were not offered and plain text', () => {
    expect(extractProseToolCalls('{"name": "rm_rf", "arguments": {}}', tools)).toEqual([]);
    expect(extractProseToolCalls('The disk is 90% full.', tools)).toEqual([]);
  });
});

describe('normalizeKeys', () => {
  it('folds case and dashes onto schema keys', () => {
    expect(normalizeKeys({ Unit: 'nginx', 'max-lines': 3 }, ['unit', 'max_lines'])).toEqual({ unit: 'nginx', max_lines: 3 });
  });

  it('maps aliases only onto missing keys and never from a real schema key', () => {
    expect(normalizeKeys({ service: 'nginx', n: 5 }, ['unit', 'lines'])).toEqual({ unit: 'nginx', lines: 5 });
    expect(normalizeKeys({ unit: 'a', service: 'b' }, ['unit'])).toBeNull();
    expect(normalizeKeys({ name: 'nginx' }, ['name', 'unit'])).toBeNull();
  });

  it('uses per-action aliases first', () => {
    expect(normalizeKeys({ daemon: 'nginx' }, ['unit'], { unit: ['daemon'] })).toEqual({ unit: 'nginx' });
  });
});

describe('ActionRunner with weak-model input', () => {
  const runner = new ActionRunner({ ssh: {} as never });

  it('accepts misnamed parameters after one retry', () => {
    expect(runner.validate('service_status', { service: 'nginx', n: '5' })).toMatchObject({ ok: true, params: { unit: 'nginx', lines: 5 } });
    expect(runner.validate('docker_logs', { container_name: 'web', tail: 50 })).toMatchObject({ ok: true, params: { container: 'web', lines: 50 } });
    expect(runner.validate('file_read', { file_path: '/etc/hosts' })).toMatchObject({ ok: true, params: { path: '/etc/hosts' } });
  });

  it('reads lists written as text', () => {
    expect(runner.validate('cli_help', { program: 'restic', subcommands: 'backup' })).toMatchObject({ ok: true, params: { subcommands: ['backup'] } });
    expect(runner.validate('cli_help', { program: 'restic', subcommands: '["snapshots"]' })).toMatchObject({ ok: true, params: { subcommands: ['snapshots'] } });
    expect(runner.validate('cli_help', { tool: 'docker', subcommand: 'compose up' })).toMatchObject({ ok: true, params: { program: 'docker', subcommands: ['compose', 'up'] } });
  });

  it('still reports what is wrong after renaming', () => {
    const v = runner.validate('service_status', { service: 'bad name!' });
    expect(v.ok).toBe(false);
    expect((v as { error: string }).error).toContain('unit: expected a systemd unit name like nginx or nginx.service, you sent "bad name!"');
  });
});
