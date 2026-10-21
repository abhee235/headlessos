// M12.8: Tests for TerminalService domain layer
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { ServiceContainer } from '../../../src/services/container.js';
import { TerminalService, containerShellCommand } from '../../../src/services/domain/terminal-service.js';
import { BaseService } from '../../../src/services/base-service.js';

// ── Mocks ──────────────────────────────────────────────────────────

/** Minimal mock of a ClientChannel (ssh2) */
function makeMockShell() {
  const ee = new EventEmitter() as NodeJS.EventEmitter & {
    stderr: NodeJS.EventEmitter;
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    setWindow: ReturnType<typeof vi.fn>;
  };
  (ee as unknown as { stderr: NodeJS.EventEmitter }).stderr = new EventEmitter();
  (ee as unknown as { write: ReturnType<typeof vi.fn> }).write = vi.fn();
  (ee as unknown as { end: ReturnType<typeof vi.fn> }).end = vi.fn();
  (ee as unknown as { close: ReturnType<typeof vi.fn> }).close = vi.fn();
  (ee as unknown as { setWindow: ReturnType<typeof vi.fn> }).setWindow = vi.fn();
  return ee as typeof ee & { stderr: NodeJS.EventEmitter; write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; setWindow: ReturnType<typeof vi.fn> };
}

class MockConnectionManager extends BaseService {
  getShell = vi.fn();
  getState = vi.fn(() => ({ status: 'connected' }));
  exec = vi.fn();
  getSftp = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
}

async function boot(): Promise<{ svc: TerminalService; ssh: MockConnectionManager }> {
  const container = new ServiceContainer();
  const ssh = new MockConnectionManager('ssh');
  const svc = new TerminalService('terminal');
  container.register('ssh', ssh);
  container.register('terminal', svc);
  await container.boot();
  return { svc, ssh };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('TerminalService', () => {
  let svc: TerminalService;
  let ssh: MockConnectionManager;

  beforeEach(async () => {
    ({ svc, ssh } = await boot());
  });

  describe('openSession', () => {
    it('calls getShell with the provided options', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);

      await svc.openSession(
        's1',
        { rows: 30, cols: 120 },
        { onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn() },
      );

      expect(ssh.getShell).toHaveBeenCalledWith('s1', { rows: 30, cols: 120, term: 'xterm-256color' });
    });

    it('uses default 24×80 when no options given', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);

      await svc.openSession('s1', {}, { onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn() });

      expect(ssh.getShell).toHaveBeenCalledWith('s1', { rows: 24, cols: 80, term: 'xterm-256color' });
    });

    it('runs docker exec as the pty command for a container shell (EX8.6)', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);

      await svc.openSession(
        's1',
        { containerId: 'd9b820d8f084' },
        { onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn() },
      );

      expect(ssh.getShell).toHaveBeenCalledWith('s1', {
        rows: 24, cols: 80, term: 'xterm-256color',
        command: containerShellCommand('d9b820d8f084'),
      });
      expect(containerShellCommand('d9b820d8f084')).toMatch(/^docker exec -it d9b820d8f084 sh -c /);
      // Nothing is typed into a login shell
      expect(shell.write).not.toHaveBeenCalled();
    });

    it('propagates error when getShell rejects', async () => {
      ssh.getShell.mockRejectedValue(new Error('not connected'));
      await expect(
        svc.openSession('s1', {}, { onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn() }),
      ).rejects.toThrow('not connected');
    });

    it('fires onData when shell emits data', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);
      const onData = vi.fn();

      await svc.openSession('s1', {}, { onData, onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn() });

      const chunk = Buffer.from('hello');
      shell.emit('data', chunk);

      expect(onData).toHaveBeenCalledWith(chunk);
    });

    it('fires onData when shell.stderr emits data', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);
      const onData = vi.fn();

      await svc.openSession('s1', {}, { onData, onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn() });

      const chunk = Buffer.from('error output');
      shell.stderr.emit('data', chunk);

      expect(onData).toHaveBeenCalledWith(chunk);
    });

    it('fires onClose when shell closes', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);
      const onClose = vi.fn();

      await svc.openSession('s1', {}, { onData: vi.fn(), onHint: vi.fn(), onClose, onError: vi.fn() });

      shell.emit('close');

      expect(onClose).toHaveBeenCalled();
    });

    it('fires onError when shell emits error', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);
      const onError = vi.fn();

      await svc.openSession('s1', {}, { onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError });

      shell.emit('error', new Error('SSH channel died'));

      expect(onError).toHaveBeenCalledWith('SSH channel died');
    });
  });

  describe('TerminalSession (returned handle)', () => {
    it('write() forwards data to shell', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);

      const session = await svc.openSession('s1', {}, {
        onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn(),
      });

      session.write(Buffer.from('ls -la\r'));
      expect(shell.write).toHaveBeenCalledWith(Buffer.from('ls -la\r'));
    });

    it('resize() calls shell.setWindow', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);

      const session = await svc.openSession('s1', {}, {
        onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn(),
      });

      session.resize(40, 160);
      expect(shell.setWindow).toHaveBeenCalledWith(40, 160, 0, 0);
    });

    it('close() ends the shell', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);

      const session = await svc.openSession('s1', {}, {
        onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn(),
      });

      session.close();
      expect(shell.end).toHaveBeenCalled();
      // Regression: EOF alone left the pty shell alive and leaked the SSH channel
      expect(shell.close).toHaveBeenCalled();
    });

    it('close() is idempotent — shell.end not called twice', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);

      const session = await svc.openSession('s1', {}, {
        onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn(),
      });

      session.close();
      session.close();
      expect(shell.end).toHaveBeenCalledTimes(1);
      expect(shell.close).toHaveBeenCalledTimes(1);
    });

    it('write() is a no-op after close()', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);

      const session = await svc.openSession('s1', {}, {
        onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn(),
      });

      session.close();
      session.write('still typing');
      expect(shell.write).not.toHaveBeenCalled();
    });

    it('getBufferSnapshot returns empty snapshot before any output', async () => {
      const shell = makeMockShell();
      ssh.getShell.mockResolvedValue(shell);

      const session = await svc.openSession('s1', {}, {
        onData: vi.fn(), onHint: vi.fn(), onClose: vi.fn(), onError: vi.fn(),
      });

      const snap = session.getBufferSnapshot(50);
      expect(snap).toBeDefined();
      expect(snap.lines).toBeInstanceOf(Array);
    });
  });
});
