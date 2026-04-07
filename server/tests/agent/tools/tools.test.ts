// EX2.2: Agent Tool Implementations Tests
// @see docs/phases/phase-ex2.md — EX2.2

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../src/agent/tools/types.js';
import { execCommandTool } from '../../../src/agent/tools/exec-command.js';
import { execWriteCommandTool } from '../../../src/agent/tools/exec-write.js';
import { sftpReadTool } from '../../../src/agent/tools/sftp-read.js';
import { sftpWriteTool } from '../../../src/agent/tools/sftp-write.js';
import { searchTemplatesTool } from '../../../src/agent/tools/search-templates.js';
import { validateSchemaTool } from '../../../src/agent/tools/validate-schema.js';
import { generateSchemaTool } from '../../../src/agent/tools/generate-schema.js';
import { grepOutputTool } from '../../../src/agent/tools/grep-output.js';
import { getServerContextTool, clearServerContextCache } from '../../../src/agent/tools/get-server-context.js';
import { ALL_AGENT_TOOLS } from '../../../src/agent/tools/index.js';

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
  it('exports exactly 9 tools', () => {
    expect(ALL_AGENT_TOOLS).toHaveLength(9);
  });

  it('all tools have unique names', () => {
    const names = ALL_AGENT_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(9);
  });

  it('all tools have required properties', () => {
    for (const tool of ALL_AGENT_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(['read', 'write', 'local']).toContain(tool.securityTier);
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('has expected tool names', () => {
    const names = ALL_AGENT_TOOLS.map(t => t.name).sort();
    expect(names).toEqual([
      'exec_command',
      'exec_write_command',
      'generate_schema',
      'get_server_context',
      'grep_output',
      'search_templates',
      'sftp_read',
      'sftp_write',
      'validate_schema',
    ]);
  });

  it('has correct security tiers', () => {
    const tierMap = Object.fromEntries(ALL_AGENT_TOOLS.map(t => [t.name, t.securityTier]));
    expect(tierMap['exec_command']).toBe('read');
    expect(tierMap['exec_write_command']).toBe('write');
    expect(tierMap['sftp_read']).toBe('read');
    expect(tierMap['sftp_write']).toBe('write');
    expect(tierMap['search_templates']).toBe('local');
    expect(tierMap['validate_schema']).toBe('local');
    expect(tierMap['generate_schema']).toBe('local');
    expect(tierMap['grep_output']).toBe('local');
    expect(tierMap['get_server_context']).toBe('read');
  });
});

// ── exec_command ────────────────────────────────────────

describe('exec_command', () => {
  it('executes allowed read-only command', async () => {
    const ctx = createMockContext();
    const result = await execCommandTool.execute({ command: 'hostname' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toBe('mock output');
    expect(ctx.ssh.exec).toHaveBeenCalledWith('test-server', 'hostname', 15_000);
  });

  it('caches output in previousOutputs', async () => {
    const ctx = createMockContext();
    await execCommandTool.execute({ command: 'hostname' }, ctx);
    expect(ctx.previousOutputs.get('hostname')).toBe('mock output');
  });

  it('rejects non-allowlisted commands', async () => {
    const ctx = createMockContext();
    const result = await execCommandTool.execute({ command: 'echo hello' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in read-only allowlist');
    expect(ctx.ssh.exec).not.toHaveBeenCalled();
  });

  it('returns error when SSH exec fails', async () => {
    const ctx = createMockContext();
    (ctx.ssh.exec as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('SSH disconnected'));

    const result = await execCommandTool.execute({ command: 'hostname' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSH disconnected');
  });

  it('handles non-zero exit codes', async () => {
    const ctx = createMockContext();
    (ctx.ssh.exec as ReturnType<typeof vi.fn>).mockResolvedValue({
      stdout: '',
      stderr: 'command not found',
      exitCode: 127,
      durationMs: 10,
    });

    const result = await execCommandTool.execute({ command: 'hostname' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('command not found');
  });

  it('uses custom timeout', async () => {
    const ctx = createMockContext();
    await execCommandTool.execute({ command: 'hostname', timeout: 5000 }, ctx);
    expect(ctx.ssh.exec).toHaveBeenCalledWith('test-server', 'hostname', 5000);
  });

  it('rejects invalid params', async () => {
    const ctx = createMockContext();
    const result = await execCommandTool.execute({}, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('exec_command failed');
  });
});

// ── exec_write_command ──────────────────────────────────

describe('exec_write_command', () => {
  it('executes allowed write command', async () => {
    const ctx = createMockContext();
    const result = await execWriteCommandTool.execute(
      { command: 'docker restart mycontainer' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(ctx.ssh.exec).toHaveBeenCalledWith('test-server', 'docker restart mycontainer', 30_000);
  });

  it('rejects non-allowlisted write commands', async () => {
    const ctx = createMockContext();
    const result = await execWriteCommandTool.execute(
      { command: 'rm -rf /tmp' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in write allowlist');
  });

  it('rejects read-only commands', async () => {
    const ctx = createMockContext();
    const result = await execWriteCommandTool.execute(
      { command: 'docker ps' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in write allowlist');
  });
});

// ── sftp_read ───────────────────────────────────────────

describe('sftp_read', () => {
  it('rejects relative paths', async () => {
    const ctx = createMockContext();
    const result = await sftpReadTool.execute({ path: 'relative/path' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('must be absolute');
  });

  it('rejects path traversal', async () => {
    const ctx = createMockContext();
    const result = await sftpReadTool.execute({ path: '/home/user/../../../etc/passwd' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('traversal');
  });

  it('reads file via SFTP stream', async () => {
    const chunks = [Buffer.from('hello '), Buffer.from('world')];
    const mockStream = {
      on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
        if (event === 'data') {
          for (const chunk of chunks) cb(chunk);
        }
        if (event === 'end') {
          setTimeout(() => cb(), 0);
        }
        return mockStream;
      }),
    };

    const mockSftp = {
      createReadStream: vi.fn().mockReturnValue(mockStream),
    };

    const ctx = createMockContext();
    (ctx.ssh.getSftp as ReturnType<typeof vi.fn>).mockResolvedValue(mockSftp);

    const result = await sftpReadTool.execute({ path: '/etc/os-release' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toBe('hello world');
    expect(mockSftp.createReadStream).toHaveBeenCalledWith('/etc/os-release', { start: 0, end: 65535 });
  });

  it('handles SFTP errors', async () => {
    const ctx = createMockContext();
    (ctx.ssh.getSftp as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('SFTP not available'));

    const result = await sftpReadTool.execute({ path: '/etc/hosts' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SFTP not available');
  });
});

// ── sftp_write ──────────────────────────────────────────

describe('sftp_write', () => {
  it('rejects relative paths', async () => {
    const ctx = createMockContext();
    const result = await sftpWriteTool.execute(
      { path: 'relative/file.txt', content: 'data' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('must be absolute');
  });

  it('rejects path traversal', async () => {
    const ctx = createMockContext();
    const result = await sftpWriteTool.execute(
      { path: '/home/user/../../etc/passwd', content: 'bad' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('traversal');
  });

  it('rejects non-allowed paths', async () => {
    const ctx = createMockContext();
    const result = await sftpWriteTool.execute(
      { path: '/etc/passwd', content: 'bad' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in write-allowed directories');
  });

  it('writes file via SFTP stream', async () => {
    const mockStream = {
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'close') {
          setTimeout(() => cb(), 0);
        }
        return mockStream;
      }),
      end: vi.fn(),
    };

    const mockSftp = {
      createWriteStream: vi.fn().mockReturnValue(mockStream),
    };

    const ctx = createMockContext();
    (ctx.ssh.getSftp as ReturnType<typeof vi.fn>).mockResolvedValue(mockSftp);

    const result = await sftpWriteTool.execute(
      { path: '/home/testuser/config.yml', content: 'key: value' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('/home/testuser/config.yml');
    expect(mockSftp.createWriteStream).toHaveBeenCalledWith('/home/testuser/config.yml', { flags: 'w' });
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
    root: {
      layout: 'stack',
      direction: 'vertical',
      widgets: [],
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
    root: {
      layout: 'stack',
      direction: 'vertical',
      widgets: [],
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
      { schema: JSON.stringify({ title: 'No root' }) },
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
    // Should have called exec multiple times for context commands
    expect(ctx.ssh.exec).toHaveBeenCalled();
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
