// M12.8: Tests for FilesService domain layer
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { FilesService } from '../../../src/services/domain/files-service.js';
import { BaseService } from '../../../src/services/base-service.js';
import type { ExecResult } from '../../../src/ssh/connection-manager.js';
import { EventEmitter } from 'events';

// ── Minimal SFTP mock ──────────────────────────────────────

class MockSftp {
  readdir = vi.fn();
  stat = vi.fn();
  mkdir = vi.fn();
  rename = vi.fn();
  unlink = vi.fn();
  rmdir = vi.fn();
  readlink = vi.fn();
  createReadStream = vi.fn(() => new EventEmitter());
  createWriteStream = vi.fn(() => {
    const ee = new EventEmitter() as EventEmitter & { end: (buf: Buffer) => void };
    ee.end = vi.fn((buf: Buffer) => setImmediate(() => ee.emit('close')));
    return ee;
  });
}

class MockConnection extends BaseService {
  exec = vi.fn<(serverId: string, command: string, timeout?: number) => Promise<ExecResult>>();
  getState = vi.fn<(id: string) => { status: string }>(() => ({ status: 'connected' }));
  _sftp = new MockSftp();
  getSftp = vi.fn(async () => this._sftp);
  connect = vi.fn();
  disconnect = vi.fn();
}

class StubOrchestrator extends BaseService { execute = vi.fn(); }
class StubPipeline extends BaseService { parse = vi.fn(); }

function execOk(stdout = '', exitCode = 0, stderr = ''): ExecResult {
  return { stdout, stderr, exitCode, durationMs: 0 };
}

async function boot(): Promise<{ svc: FilesService; ssh: MockConnection }> {
  const container = new ServiceContainer();
  const ssh = new MockConnection('ssh');
  const orch = new StubOrchestrator('orchestrator');
  const pipe = new StubPipeline('parser');
  const svc = new FilesService('files');
  container.register('ssh', ssh);
  container.register('orchestrator', orch);
  container.register('parser', pipe);
  container.register('files', svc);
  await container.boot();
  return { svc, ssh };
}

// Minimal stat attrs for directory
function dirAttrs(extra = {}) {
  return {
    isDirectory: () => true,
    isFile: () => false,
    isSymbolicLink: () => false,
    uid: 1000, gid: 1000, size: 4096, mtime: 1700000000, atime: 1700000000,
    mode: 0o40755,
    ...extra,
  };
}

// Minimal stat attrs for file
function fileAttrs(size = 100) {
  return {
    isDirectory: () => false,
    isFile: () => true,
    isSymbolicLink: () => false,
    uid: 1000, gid: 1000, size, mtime: 1700000000, atime: 1700000000,
    mode: 0o100644,
  };
}

describe('FilesService', () => {
  let svc: FilesService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await boot());
  });

  // ── listDirectory ────────────────────────────────────────

  describe('listDirectory', () => {
    it('returns fail(400) for invalid path', async () => {
      const r = await svc.listDirectory('s1', '../../etc/passwd');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns fail(400) for relative path', async () => {
      const r = await svc.listDirectory('s1', 'relative/path');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns sorted entries', async () => {
      ssh._sftp.readdir.mockImplementation((_path: string, cb: Function) => {
        cb(null, [
          { filename: 'file.txt', attrs: fileAttrs() },
          { filename: 'dir', attrs: dirAttrs() },
        ]);
      });
      const r = await svc.listDirectory('s1', '/home/user');
      expect(r.ok).toBe(true);
      expect(r.data![0]!.name).toBe('dir');   // directories first
      expect(r.data![1]!.name).toBe('file.txt');
    });

    it('returns fail(404) when directory not found', async () => {
      ssh._sftp.readdir.mockImplementation((_path: string, cb: Function) => {
        cb(new Error('No such file or directory'));
      });
      const r = await svc.listDirectory('s1', '/nonexistent');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(404);
    });
  });

  // ── readFile ──────────────────────────────────────────────

  describe('readFile', () => {
    it('returns fail(400) for invalid path', async () => {
      const r = await svc.readFile('s1', '../etc/shadow');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns fail(413) when file too large', async () => {
      ssh._sftp.stat.mockImplementation((_p: string, cb: Function) => {
        cb(null, fileAttrs(3 * 1024 * 1024)); // 3 MB
      });
      const r = await svc.readFile('s1', '/home/user/bigfile.bin');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(413);
    });

    it('reads file content', async () => {
      ssh._sftp.stat.mockImplementation((_p: string, cb: Function) => {
        cb(null, fileAttrs(13));
      });
      const fakeStream = new EventEmitter();
      ssh._sftp.createReadStream.mockReturnValue(fakeStream);
      setImmediate(() => {
        fakeStream.emit('data', Buffer.from('hello, world!'));
        fakeStream.emit('end');
      });
      const r = await svc.readFile('s1', '/home/user/hello.txt');
      expect(r.ok).toBe(true);
      expect(r.data!.content).toBe('hello, world!');
    });
  });

  // ── writeFile ─────────────────────────────────────────────

  describe('writeFile', () => {
    it('returns fail(400) for invalid path', async () => {
      const r = await svc.writeFile('s1', '../etc/cron.d/evil', 'bad');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('writes file and returns size', async () => {
      const ws = new EventEmitter() as EventEmitter & { end: MockedFunction<(buf: Buffer) => void> };
      ws.end = vi.fn((buf: Buffer) => setImmediate(() => ws.emit('close')));
      ssh._sftp.createWriteStream.mockReturnValue(ws);
      const r = await svc.writeFile('s1', '/home/user/test.txt', 'hello');
      expect(r.ok).toBe(true);
      expect(r.data!.size).toBe(5);
    });

    it('returns fail(403) on permission denied', async () => {
      const ws = new EventEmitter() as EventEmitter & { end: MockedFunction<(buf: Buffer) => void> };
      ws.end = vi.fn(() => setImmediate(() => ws.emit('error', new Error('Permission denied'))));
      ssh._sftp.createWriteStream.mockReturnValue(ws);
      const r = await svc.writeFile('s1', '/etc/cron.d/test', 'bad');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(403);
    });
  });

  // ── mkdir ─────────────────────────────────────────────────

  describe('mkdir', () => {
    it('returns fail(400) for invalid path', async () => {
      const r = await svc.mkdir('s1', '../bad');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('creates directory', async () => {
      ssh._sftp.mkdir.mockImplementation((_p: string, cb: Function) => cb(null));
      const r = await svc.mkdir('s1', '/home/user/newdir');
      expect(r.ok).toBe(true);
    });

    it('returns fail when mkdir fails', async () => {
      ssh._sftp.mkdir.mockImplementation((_p: string, cb: Function) => cb(new Error('Permission denied')));
      const r = await svc.mkdir('s1', '/root/baddir');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(403);
    });
  });

  // ── rename ────────────────────────────────────────────────

  describe('rename', () => {
    it('returns fail(400) for invalid old path', async () => {
      const r = await svc.rename('s1', '../etc', '/safe');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns fail(400) for invalid new path', async () => {
      const r = await svc.rename('s1', '/safe', '../etc');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('renames successfully', async () => {
      ssh._sftp.rename.mockImplementation((_a: string, _b: string, cb: Function) => cb(null));
      const r = await svc.rename('s1', '/home/user/old.txt', '/home/user/new.txt');
      expect(r.ok).toBe(true);
    });
  });

  // ── delete ────────────────────────────────────────────────

  describe('delete', () => {
    it('unlinks a file', async () => {
      ssh._sftp.stat.mockImplementation((_p: string, cb: Function) => cb(null, fileAttrs()));
      ssh._sftp.unlink.mockImplementation((_p: string, cb: Function) => cb(null));
      const r = await svc.delete('s1', '/home/user/file.txt');
      expect(r.ok).toBe(true);
      expect(ssh._sftp.unlink).toHaveBeenCalled();
    });

    it('rmdirs a directory', async () => {
      ssh._sftp.stat.mockImplementation((_p: string, cb: Function) => cb(null, dirAttrs()));
      ssh._sftp.rmdir.mockImplementation((_p: string, cb: Function) => cb(null));
      const r = await svc.delete('s1', '/home/user/emptydir');
      expect(r.ok).toBe(true);
      expect(ssh._sftp.rmdir).toHaveBeenCalled();
    });
  });

  // ── copy ──────────────────────────────────────────────────

  describe('copy', () => {
    it('rejects path traversal in source', async () => {
      const r = await svc.copy('s1', '../etc', '/safe');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('executes cp -r command', async () => {
      ssh.exec.mockResolvedValue(execOk('', 0));
      const r = await svc.copy('s1', '/home/user/src', '/home/user/dst');
      expect(r.ok).toBe(true);
      expect(ssh.exec).toHaveBeenCalledWith(
        's1',
        expect.stringContaining('cp -r'),
        expect.any(Number),
      );
    });

    it('returns fail on non-zero exit', async () => {
      ssh.exec.mockResolvedValue(execOk('', 1, 'cannot copy'));
      const r = await svc.copy('s1', '/home/user/src', '/home/user/dst');
      expect(r.ok).toBe(false);
    });
  });

  // ── search ────────────────────────────────────────────────

  describe('search', () => {
    it('returns fail(400) for empty query', async () => {
      const r = await svc.search('s1', '/home', '', '5');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('returns fail(400) for malicious query (shell injection)', async () => {
      const r = await svc.search('s1', '/home', '; rm -rf /', '5');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('runs find and returns results', async () => {
      ssh.exec.mockResolvedValue(execOk('/home/user/notes.txt\n'));
      const r = await svc.search('s1', '/home', 'notes', '5');
      expect(r.ok).toBe(true);
      expect(r.data!.results).toHaveLength(1);
      expect(r.data!.results[0]!.name).toBe('notes.txt');
      expect(r.data!.truncated).toBe(false);
    });
  });

  // ── moveToTrash ───────────────────────────────────────────

  describe('moveToTrash', () => {
    it('returns fail(400) for invalid path', async () => {
      const r = await svc.moveToTrash('s1', '../etc/passwd');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('moves file to trash dir', async () => {
      ssh._sftp.mkdir.mockImplementation((_p: string, cb: Function) => cb(null));
      ssh._sftp.rename.mockImplementation((_a: string, _b: string, cb: Function) => cb(null));
      const r = await svc.moveToTrash('s1', '/home/user/delete-me.txt');
      expect(r.ok).toBe(true);
      expect(r.data!.originalPath).toBe('/home/user/delete-me.txt');
      expect(r.data!.trashPath).toContain('/tmp/.headlessos-trash/');
    });
  });

  // ── restoreFromTrash ──────────────────────────────────────

  describe('restoreFromTrash', () => {
    it('rejects trash names with path separators', async () => {
      const r = await svc.restoreFromTrash('s1', '../other-dir', '/home/user/restored');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('restores file from trash', async () => {
      ssh._sftp.rename.mockImplementation((_a: string, _b: string, cb: Function) => cb(null));
      const r = await svc.restoreFromTrash('s1', '1700000000_file.txt', '/home/user/file.txt');
      expect(r.ok).toBe(true);
    });
  });

  // ── emptyTrash ────────────────────────────────────────────

  describe('emptyTrash', () => {
    it('rejects specific name with path traversal', async () => {
      const r = await svc.emptyTrash('s1', '../etc');
      expect(r.ok).toBe(false);
      expect(r.statusCode).toBe(400);
    });

    it('runs rm -rf to empty all trash', async () => {
      ssh.exec.mockResolvedValue(execOk('', 0));
      const r = await svc.emptyTrash('s1');
      expect(r.ok).toBe(true);
      expect(ssh.exec).toHaveBeenCalledWith(
        's1',
        expect.stringContaining('rm -rf'),
        expect.any(Number),
      );
    });
  });
});
