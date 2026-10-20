// M1.1: SSH Connection Manager
// @see docs/phases/phase-1.md

import { Client, type ClientChannel, type SFTPWrapper } from 'ssh2';
import { EventEmitter } from 'events';
import { BaseService } from '../services/base-service.js';
import type { CommandPolicy } from '../services/policy/command-policy.js';
import type { ServerConfig, ConnectionState, ConnectionStatus } from 'headlessos-shared';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ShellOptions {
  rows?: number;
  cols?: number;
  term?: string;
}

interface ServerConnection {
  config: ServerConfig;
  client: Client;
  state: ConnectionState;
  sftp: SFTPWrapper | null;
}

const DEFAULT_EXEC_TIMEOUT = 30_000;

// EX8.6: sshd allows MaxSessions (10 by default) channels per connection, and
// terminals + SFTP hold some of them. Parallel command plans (dashboard, task
// manager, admin pages) could open more at once and fail with "Channel open
// failure", which surfaced as blank metrics. Commands now wait for one of a
// few exec slots per connection, and retry once if the server still refuses.
const MAX_EXEC_CHANNELS = Math.max(1, Number(process.env.HEADLESS_MAX_EXEC_CHANNELS) || 4);
const CHANNEL_RETRY_DELAY_MS = 250;

interface ExecGate { active: number; waiters: Array<() => void> }
const execGates = new WeakMap<object, ExecGate>();

async function acquireExecSlot(key: object): Promise<() => void> {
  let gate = execGates.get(key);
  if (!gate) { gate = { active: 0, waiters: [] }; execGates.set(key, gate); }
  const g = gate;
  if (g.active < MAX_EXEC_CHANNELS) g.active++;
  else await new Promise<void>((resolve) => g.waiters.push(resolve)); // slot handed over on release
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = g.waiters.shift();
    if (next) next(); else g.active--;
  };
}

function isChannelOpenFailure(err: unknown): boolean {
  return err instanceof Error && /channel open failure/i.test(err.message);
}
const RETRY_DELAYS = [1000, 2000, 4000];

export class ConnectionManager extends BaseService {
  private connections = new Map<string, ServerConnection>();
  private emitter = new EventEmitter();
  private policy: CommandPolicy | null = null;

  protected async _construct(): Promise<void> {
    // Nothing to construct internally
  }

  protected async _init(): Promise<void> {
    // M12.1: Wire CommandPolicy if registered. Optional so existing tests that
    // bypass the container (mocking exec) continue to work.
    try {
      this.policy = this.services.get<CommandPolicy>('command-policy');
    } catch {
      this.policy = null;
    }
  }

  /**
   * M12.1: Manually attach a policy. Used by tests that don't go through
   * ServiceContainer.boot() but still want enforcement.
   */
  setCommandPolicy(policy: CommandPolicy | null): void {
    this.policy = policy;
  }

  protected async _destroy(): Promise<void> {
    // Disconnect all on shutdown
    const ids = [...this.connections.keys()];
    for (const id of ids) {
      await this.disconnect(id);
    }
  }

  // ── Connection lifecycle ──────────────────────────────

  async connect(config: ServerConfig): Promise<void> {
    if (this.connections.has(config.id)) {
      const existing = this.connections.get(config.id)!;
      if (existing.state.status === 'connected') return;
    }

    this.setState(config.id, 'connecting');

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const client = await this.createConnection(config);
        const tools = await this.detectToolsInternal(client);

        this.connections.set(config.id, {
          config,
          client,
          state: {
            serverId: config.id,
            status: 'connected',
            connectedAt: new Date().toISOString(),
            detectedTools: tools,
          },
          sftp: null,
        });

        this.emitState(config.id);

        // Handle unexpected disconnect
        client.on('close', () => {
          if (this.connections.has(config.id)) {
            this.setState(config.id, 'disconnected');
          }
        });

        client.on('error', (err) => {
          console.error(`[SSH ${config.id}] Connection error:`, err.message);
          this.setState(config.id, 'error', err.message);
        });

        return; // Success
      } catch (err) {
        lastError = err as Error;

        // Don't retry auth failures
        if ((err as Error).message?.includes('Authentication')) {
          break;
        }

        if (attempt < RETRY_DELAYS.length) {
          await this.delay(RETRY_DELAYS[attempt]!);
        }
      }
    }

    this.setState(config.id, 'error', lastError?.message ?? 'Connection failed');
    throw lastError ?? new Error('Connection failed');
  }

  async disconnect(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId);
    if (!conn) return;

    conn.client.end();
    this.connections.delete(serverId);
    this.setState(serverId, 'disconnected');
  }

  /**
   * EX6-A.10: List the IDs of all currently connected servers.
   * Used by graceful shutdown to mark active sessions as hibernated.
   */
  getConnectedServerIds(): string[] {
    return [...this.connections.keys()];
  }

  getState(serverId: string): ConnectionState {
    const conn = this.connections.get(serverId);
    return conn?.state ?? {
      serverId,
      status: 'disconnected' as ConnectionStatus,
    };
  }

  // ── Command execution ─────────────────────────────────

  async exec(serverId: string, command: string, timeout = DEFAULT_EXEC_TIMEOUT): Promise<ExecResult> {
    // M12.1: Central policy chokepoint — every command crossing SSH passes here.
    // Throws SecurityError if the command is blocked or (in enforce mode) not
    // in the allowlist. No-op when no policy is wired (test mocks, etc.).
    if (this.policy) {
      this.policy.assertAllowed(command, serverId);
    }

    const conn = this.requireConnection(serverId);
    const release = await acquireExecSlot(conn.client);
    try {
      try {
        return await this.execOnce(conn.client, command, timeout);
      } catch (err) {
        if (!isChannelOpenFailure(err)) throw err;
        await new Promise((r) => setTimeout(r, CHANNEL_RETRY_DELAY_MS));
        return await this.execOnce(conn.client, command, timeout);
      }
    } finally {
      release();
    }
  }

  private execOnce(client: Client, command: string, timeout: number): Promise<ExecResult> {
    const start = Date.now();

    return new Promise<ExecResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
      }, timeout);

      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on('close', (code: number) => {
          clearTimeout(timer);
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 0,
            durationMs: Date.now() - start,
          });
        });

        stream.on('error', (streamErr: Error) => {
          clearTimeout(timer);
          reject(streamErr);
        });
      });
    });
  }

  async getShell(serverId: string, options?: ShellOptions): Promise<ClientChannel> {
    const conn = this.requireConnection(serverId);
    const { rows = 24, cols = 80, term = 'xterm-256color' } = options ?? {};

    return new Promise<ClientChannel>((resolve, reject) => {
      conn.client.shell({ rows, cols, term }, (err, stream) => {
        if (err) return reject(err);
        resolve(stream);
      });
    });
  }

  async getSftp(serverId: string): Promise<SFTPWrapper> {
    const conn = this.requireConnection(serverId);

    // Reuse cached SFTP session
    if (conn.sftp) return conn.sftp;

    return new Promise<SFTPWrapper>((resolve, reject) => {
      conn.client.sftp((err, sftp) => {
        if (err) return reject(err);
        conn.sftp = sftp;
        resolve(sftp);
      });
    });
  }

  async detectTools(serverId: string): Promise<string[]> {
    const conn = this.requireConnection(serverId);
    return this.detectToolsInternal(conn.client);
  }

  // ── Events ────────────────────────────────────────────

  on(event: 'stateChange', listener: (state: ConnectionState) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  off(event: 'stateChange', listener: (state: ConnectionState) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  // ── Private helpers ───────────────────────────────────

  private requireConnection(serverId: string): ServerConnection {
    const conn = this.connections.get(serverId);
    if (!conn || conn.state.status !== 'connected') {
      throw new Error(`Not connected to server "${serverId}"`);
    }
    return conn;
  }

  private createConnection(config: ServerConfig): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();

      const connConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10_000,
      };

      if (config.authMethod === 'password') {
        connConfig.password = config.password;
      } else if (config.authMethod === 'privateKey') {
        // privateKeyPath will be read by the caller — for now we expect the key content
        connConfig.privateKey = config.privateKeyPath;
        if (config.passphrase) connConfig.passphrase = config.passphrase;
      } else if (config.authMethod === 'agent') {
        connConfig.agent = process.env.SSH_AUTH_SOCK;
      }

      client
        .on('ready', () => resolve(client))
        .on('error', (err) => reject(err))
        .connect(connConfig as Parameters<Client['connect']>[0]);
    });
  }

  private async detectToolsInternal(client: Client): Promise<string[]> {
    const toolNames = ['docker', 'git', 'python3', 'node', 'systemctl', 'nginx', 'pm2', 'ufw'];
    const command = toolNames.map(t => `which ${t}`).join('; ');

    return new Promise((resolve) => {
      client.exec(`${command} 2>/dev/null || true`, (err, stream) => {
        if (err) {
          resolve([]);
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => { output += data.toString(); });
        stream.on('close', () => {
          const detected = output
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => {
              const parts = line.trim().split('/');
              return parts[parts.length - 1] ?? '';
            })
            .filter(Boolean);
          resolve(detected);
        });
      });
    });
  }

  private setState(serverId: string, status: ConnectionStatus, error?: string): void {
    const conn = this.connections.get(serverId);
    if (conn) {
      conn.state = { ...conn.state, status, error };
    }
    this.emitState(serverId);
  }

  private emitState(serverId: string): void {
    this.emitter.emit('stateChange', this.getState(serverId));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
