// M1.5: Terminal WebSocket Bridge
// @see docs/phases/phase-1.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { ClientChannel } from 'ssh2';

export async function terminalRoutes(
  fastify: FastifyInstance,
  opts: { connectionManager: ConnectionManager },
): Promise<void> {
  const { connectionManager } = opts;

  fastify.get('/ws/terminal/:serverId', { websocket: true }, (socket, req) => {
    const { serverId } = req.params as { serverId: string };
    let shell: ClientChannel | null = null;

    const setup = async () => {
      try {
        shell = await connectionManager.getShell(serverId, {
          rows: 24,
          cols: 80,
          term: 'xterm-256color',
        });

        // SSH → Browser
        shell.on('data', (data: Buffer) => {
          if (socket.readyState === 1) { // OPEN
            socket.send(data);
          }
        });

        shell.on('close', () => {
          socket.close();
        });

        shell.stderr.on('data', (data: Buffer) => {
          if (socket.readyState === 1) {
            socket.send(data);
          }
        });

        // Browser → SSH
        socket.on('message', (data: Buffer | string) => {
          if (!shell) return;

          // Handle resize messages
          if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x01)) {
            try {
              const str = typeof data === 'string' ? data : data.toString();
              const msg = JSON.parse(str) as { type: string; rows?: number; cols?: number };
              if (msg.type === 'resize' && msg.rows && msg.cols) {
                shell.setWindow(msg.rows, msg.cols, 0, 0);
                return;
              }
            } catch {
              // Not JSON — treat as terminal input
            }
          }

          shell.write(data);
        });

        socket.on('close', () => {
          if (shell) {
            shell.end();
            shell = null;
          }
        });

        socket.on('error', () => {
          if (shell) {
            shell.end();
            shell = null;
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open terminal';
        socket.send(JSON.stringify({ type: 'error', message }));
        socket.close();
      }
    };

    setup();
  });
}
