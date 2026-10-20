// M12.8: TerminalService — domain layer for interactive SSH terminal sessions
// @see docs/phases/phase-12.md
//
// Owns: shell lifecycle, buffer management, visualize-hint detection, cleanup.
// Routes (routes/terminal.ts) only bridge WebSocket events ↔ TerminalSession.

import { BaseService } from '../base-service.js';
import type { ConnectionManager } from '../../ssh/connection-manager.js';
import type { ClientChannel } from 'ssh2';
import { TerminalBuffer, type ParseableHint, type BufferSnapshot } from '../../terminal/buffer.js';

// ── Types ──────────────────────────────────────────────────────────

export interface ShellOptions {
  rows?: number;
  cols?: number;
  term?: string;
  /** EX7: if set (validated hex container id), exec into this container. */
  containerId?: string;
}

export interface TerminalSessionCallbacks {
  /** Raw SSH output bytes — pipe straight to xterm.js */
  onData(data: Buffer): void;
  /** Fired when the buffer detects parseable output */
  onHint(hint: ParseableHint, snapshot: BufferSnapshot | null): void;
  /** SSH shell closed */
  onClose(): void;
  /** Session failed to open */
  onError(message: string): void;
}

/** Handle returned by openSession — routes use this to drive the session */
export interface TerminalSession {
  /** Forward raw keystrokes / paste data to the SSH shell */
  write(data: Buffer | string): void;
  /** Resize the pty */
  resize(rows: number, cols: number): void;
  /** Get buffer snapshot for the "Visualize" feature */
  getBufferSnapshot(lastN?: number): BufferSnapshot;
  /** Tear down the SSH shell and clear the buffer */
  close(): void;
}

// ── Service ────────────────────────────────────────────────────────

export class TerminalService extends BaseService {
  private connectionManager!: ConnectionManager;

  protected async _construct(): Promise<void> {}

  protected async _init(): Promise<void> {
    this.connectionManager = this.services.get<ConnectionManager>('ssh');
  }

  protected async _destroy(): Promise<void> {}

  /**
   * Open an interactive shell session for `serverId`.
   * Wire the returned `TerminalSession` to a WebSocket in the route.
   *
   * Throws if the server is not connected — caller (route) catches and sends
   * a WebSocket error frame before closing.
   */
  async openSession(
    serverId: string,
    opts: ShellOptions,
    callbacks: TerminalSessionCallbacks,
  ): Promise<TerminalSession> {
    const shell = await this.connectionManager.getShell(serverId, {
      rows: opts.rows ?? 24,
      cols: opts.cols ?? 80,
      term: opts.term ?? 'xterm-256color',
    });

    // EX7: exec into a container if requested. containerId is a validated hex id
    // (see routes/terminal.ts); `exec` replaces the shell so exiting the container
    // shell ends the SSH session cleanly.
    if (opts.containerId) {
      shell.write(`exec docker exec -it ${opts.containerId} sh\n`);
    }

    const buffer = new TerminalBuffer();

    // SSH → browser
    shell.on('data', (data: Buffer) => {
      callbacks.onData(data);

      const hint = buffer.append(data);
      if (hint) {
        const snapshot = buffer.getLastCommandOutput();
        callbacks.onHint(hint, snapshot);
      }
    
    });

    shell.stderr.on('data', (data: Buffer) => {
      callbacks.onData(data);
    });

    shell.on('close', () => {
      buffer.clear();
      callbacks.onClose();
    });

    shell.on('error', (err: Error) => {
      buffer.clear();
      callbacks.onError(err.message ?? 'Shell error');
    });

    return createSession(shell, buffer);
  }
}

// ── Session factory (pure, no class needed) ───────────────────────

function createSession(shell: ClientChannel, buffer: TerminalBuffer): TerminalSession {
  let closed = false;

  return {
    write(data: Buffer | string): void {
      if (!closed) shell.write(data);
    },

    resize(rows: number, cols: number): void {
      if (!closed) shell.setWindow(rows, cols, 0, 0);
    },

    getBufferSnapshot(lastN?: number): BufferSnapshot {
      return buffer.getLastCommandOutput() ?? buffer.getSnapshot(lastN);
    },

    close(): void {
      if (closed) return;
      closed = true;
      shell.end();
      buffer.clear();
    },
  };
}
