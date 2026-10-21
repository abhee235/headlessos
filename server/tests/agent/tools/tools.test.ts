// EX2.2: Agent Tool Implementations Tests
// @see docs/phases/phase-ex2.md — EX2.2

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../src/agent/tools/types.js';
import { searchTemplatesTool } from '../../../src/agent/tools/search-templates.js';
import { validateSchemaTool } from '../../../src/agent/tools/validate-schema.js';
import { generateSchemaTool } from '../../../src/agent/tools/generate-schema.js';
import { grepOutputTool } from '../../../src/agent/tools/grep-output.js';
import { getServerContextTool, clearServerContextCache } from '../../../src/agent/tools/get-server-context.js';
import { ALL_AGENT_TOOLS, LOCAL_AGENT_TOOLS } from '../../../src/agent/tools/index.js';
import { getDefaultCatalog } from '../../../src/agent/actions/index.js';

const READ_ACTION_IDS = getDefaultCatalog().list({ risk: 'read' }).map(a => a.id);

// ── Mock Context ────────────────────────────────────────

function createMockContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    serverId: 'test-server',
    ssh: {
      exec: vi.fn().mockResolvedValue({
        stdout: 'mock output',
        stderr: '',
        exitCode: 0,
        durationMs: 50,
      }),
      getSftp: vi.fn().mockResolvedValue({
        createReadStream: vi.fn(),
        createWriteStream: vi.fn(),
      }),
    } as unknown as ToolContext['ssh'],
    templateRegistry: {
      search: vi.fn().mockReturnValue([]),
      searchByTag: vi.fn().mockReturnValue([]),
      matchCommand: vi.fn().mockReturnValue([]),
      getById: vi.fn(),
      listAll: vi.fn().mockReturnValue([]),
    } as unknown as ToolContext['templateRegistry'],
    previousOutputs: new Map(),
    ...overrides,
  };
}

// ── ALL_AGENT_TOOLS ─────────────────────────────────────

describe('ALL_AGENT_TOOLS', () => {
  it('is the local tools plus one tool per read action', () => {
    expect(ALL_AGENT_TOOLS).toHaveLength(LOCAL_AGENT_TOOLS.length + READ_ACTION_IDS.length);
  });

  it('all tools have unique names', () => {
    const names = ALL_AGENT_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // EX9.0: nothing registered by default may change a server
  it('registers no write-tier tool', () => {
    expect(ALL_AGENT_TOOLS.filter(t => t.securityTier === 'write')).toEqual([]);
    const names = ALL_AGENT_TOOLS.map(t => t.name);
    expect(names).not.toContain('exec_write_command');
    expect(names).not.toContain('sftp_write');
  });

  // EX9.1: no tool takes a free-form command any more
  it('registers none of the retired free-form tools', () => {
    const names = ALL_AGENT_TOOLS.map(t => t.name);
    for (const retired of ['exec_command', 'sftp_read', 'sandbox_exec']) {
      expect(names).not.toContain(retired);
    }
  });

  it('all tools have required properties', () => {
    for (const tool of ALL_AGENT_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(['read', 'local', 'action']).toContain(tool.securityTier);
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('has the expected local tools', () => {
    expect(LOCAL_AGENT_TOOLS.map(t => t.name).sort()).toEqual([
      'generate_schema',
      'get_server_context',
      'grep_output',
      'search_templates',
      'update_view',
      'validate_schema',
    ]);
  });

  it('has correct security tiers', () => {
    const tierMap = Object.fromEntries(ALL_AGENT_TOOLS.map(t => [t.name, t.securityTier]));
    expect(tierMap['search_templates']).toBe('local');
    expect(tierMap['validate_schema']).toBe('local');
    expect(tierMap['generate_schema']).toBe('local');
    expect(tierMap['grep_output']).toBe('local');
    expect(tierMap['get_server_context']).toBe('read');
    expect(tierMap['update_view']).toBe('local');
    for (const id of READ_ACTION_IDS) expect(tierMap[id]).toBe('action');
  });
});

// ── search_templates ────────────────────────────────────

describe('search_templates', () => {
  it('requires at least one search parameter', async () => {
    const ctx = createMockContext();
    const result = await searchTemplatesTool.execute({}, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('At least one of');
  });

  it('searches by tag', async () => {
    const mockTemplates = [
      { id: 'docker-ps', name: 'Docker PS', description: 'Docker containers', tags: ['docker'] },
    ];
    const ctx = createMockContext();
    (ctx.templateRegistry.searchByTag as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplates);

    const result = await searchTemplatesTool.execute({ tag: 'docker' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('docker-ps');
    expect(result.output).toContain('Docker PS');
    expect(result.metadata?.count).toBe(1);
  });

  it('searches by query', async () => {
    const mockTemplates = [
      { id: 'sys-info', name: 'System Info', description: 'System overview', tags: ['system'] },
    ];
    const ctx = createMockContext();
    (ctx.templateRegistry.search as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplates);

    const result = await searchTemplatesTool.execute({ query: 'system' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('sys-info');
  });

  it('returns empty message when no matches', async () => {
    const ctx = createMockContext();
    const result = await searchTemplatesTool.execute({ query: 'nonexistent' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('No matching templates');
  });
});

// ── validate_schema ─────────────────────────────────────

describe('validate_schema', () => {
  const validSchema = JSON.stringify({
    title: 'Test View',
    sidebarItems: [{ id: 'main', label: 'Test' }],
    sections: {
      main: {
        layout: 'stack',
        children: [],
      },
    },
  });

  it('validates a correct schema', async () => {
    const ctx = createMockContext();
    const result = await validateSchemaTool.execute({ schema: validSchema }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('valid');
  });

  it('reports errors for invalid schema', async () => {
    const ctx = createMockContext();
    const result = await validateSchemaTool.execute(
      { schema: JSON.stringify({ title: 123 }) },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.output).toContain('validation failed');
    expect(result.metadata?.errorCount).toBeGreaterThan(0);
  });

  it('handles invalid JSON', async () => {
    const ctx = createMockContext();
    const result = await validateSchemaTool.execute(
      { schema: '{not valid json}' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  it('rejects missing schema param', async () => {
    const ctx = createMockContext();
    const result = await validateSchemaTool.execute({}, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('validate_schema failed');
  });
});

// ── generate_schema ─────────────────────────────────────

describe('generate_schema', () => {
  const validSchema = JSON.stringify({
    title: 'Generated View',
    sidebarItems: [{ id: 'main', label: 'Generated' }],
    sections: {
      main: {
        layout: 'stack',
        children: [],
      },
    },
  });

  it('generates valid schema and marks as terminal', async () => {
    const ctx = createMockContext();
    const result = await generateSchemaTool.execute({ schema: validSchema }, ctx);

    expect(result.success).toBe(true);
    expect(result.metadata?.isTerminalTool).toBe(true);
    // Output is the validated schema JSON
    const parsed = JSON.parse(result.output);
    expect(parsed.title).toBe('Generated View');
  });

  it('rejects invalid schema', async () => {
    const ctx = createMockContext();
    const result = await generateSchemaTool.execute(
      { schema: JSON.stringify({ title: 'No sections' }) },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Schema validation failed');
  });

  it('handles invalid JSON', async () => {
    const ctx = createMockContext();
    const result = await generateSchemaTool.execute(
      { schema: 'not json' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });
});

// ── grep_output ─────────────────────────────────────────

describe('grep_output', () => {
  it('searches within specific command output', async () => {
    const ctx = createMockContext();
    ctx.previousOutputs.set('ps aux', 'root     1  0.0  0.0 /sbin/init\nnginx  500  0.1  0.2 nginx: worker');

    const result = await grepOutputTool.execute(
      { pattern: 'nginx', command: 'ps aux' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('nginx');
    expect(result.metadata?.matchCount).toBe(1);
  });

  // EX9.1: action outputs are cached as "<action>:<params>"; the action name finds them
  it('finds cached action outputs by action name', async () => {
    const ctx = createMockContext();
    ctx.previousOutputs.set('process_list:{"sortBy":"cpu"}', 'nginx  500  0.1');
    ctx.previousOutputs.set('docker_containers:{}', 'nginx-container  Up');

    const result = await grepOutputTool.execute({ pattern: 'nginx', command: 'process_list' }, ctx);

    expect(result.success).toBe(true);
    expect(result.metadata?.matchCount).toBe(1);
    expect(result.output).not.toContain('nginx-container');
  });

  it('searches across all cached outputs', async () => {
    const ctx = createMockContext();
    ctx.previousOutputs.set('ps aux', 'nginx  500  0.1');
    ctx.previousOutputs.set('docker ps', 'nginx-container  Up');

    const result = await grepOutputTool.execute({ pattern: 'nginx' }, ctx);

    expect(result.success).toBe(true);
    expect(result.metadata?.matchCount).toBe(2);
  });

  it('returns no matches message', async () => {
    const ctx = createMockContext();
    ctx.previousOutputs.set('ps aux', 'root  1  0.0');

    const result = await grepOutputTool.execute(
      { pattern: 'nonexistent', command: 'ps aux' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('No matches found');
  });

  it('errors when no cached outputs exist', async () => {
    const ctx = createMockContext();
    const result = await grepOutputTool.execute({ pattern: 'test' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No cached command outputs');
  });

  it('errors with specific command not found', async () => {
    const ctx = createMockContext();
    ctx.previousOutputs.set('ps aux', 'data');

    const result = await grepOutputTool.execute(
      { pattern: 'test', command: 'cat /etc/os-release' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No cached output for command');
  });

  it('handles invalid regex pattern', async () => {
    const ctx = createMockContext();
    ctx.previousOutputs.set('ps aux', 'data');

    const result = await grepOutputTool.execute(
      { pattern: '[invalid', command: 'ps aux' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid regex');
  });
});

// ── get_server_context ──────────────────────────────────

describe('get_server_context', () => {
  beforeEach(() => {
    clearServerContextCache();
  });

  it('gathers server context', async () => {
    const ctx = createMockContext();
    const result = await getServerContextTool.execute({}, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('Server Context:');
    // EX9.1: it runs catalog actions, so SSH sees exactly the commands they build
    const commands = (ctx.ssh.exec as ReturnType<typeof vi.fn>).mock.calls.map(c => c[1]).sort();
    expect(commands).toEqual([
      'cat /etc/os-release', 'df -hT', 'free -m', 'uname -a', 'uptime', 'which docker', 'which nginx',
    ]);
  });

  it('uses cached context on second call', async () => {
    const ctx = createMockContext();
    await getServerContextTool.execute({}, ctx);
    const callCount = (ctx.ssh.exec as ReturnType<typeof vi.fn>).mock.calls.length;

    await getServerContextTool.execute({}, ctx);
    // Should not have made additional SSH calls
    expect((ctx.ssh.exec as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
  });

  it('refreshes when refresh=true', async () => {
    const ctx = createMockContext();
    await getServerContextTool.execute({}, ctx);
    const callCount = (ctx.ssh.exec as ReturnType<typeof vi.fn>).mock.calls.length;

    await getServerContextTool.execute({ refresh: true }, ctx);
    expect((ctx.ssh.exec as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callCount);
  });

  it('handles SSH failures gracefully', async () => {
    const ctx = createMockContext();
    (ctx.ssh.exec as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection lost'));

    const result = await getServerContextTool.execute({}, ctx);
    // Should still succeed — individual command failures are caught
    expect(result.success).toBe(true);
    expect(result.output).toContain('unavailable');
  });
});
