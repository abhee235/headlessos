// M1.5 + EX1.11: Terminal WebSocket Bridge with Output Buffer
// @see docs/phases/phase-1.md, docs/phases/phase-ex1.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { ClientChannel } from 'ssh2';
import { TerminalBuffer } from '../terminal/buffer.js';
import { validateContainerId } from '../security/validators.js';

export async function terminalRoutes(
  fastify: FastifyInstance,
  opts: { connectionManager: ConnectionManager },
): Promise<void> {
  const { connectionManager } = opts;

  fastify.get('/ws/terminal/:serverId', { websocket: true }, (socket, req) => {
    const { serverId } = req.params as { serverId: string };
    // EX7: optional ?container=<hex id> drops the session straight into that
    // container via `docker exec -it`. Validated as hex to prevent injection.
    const containerParam = (req.query as { container?: string } | undefined)?.container;
    const containerId = containerParam && validateContainerId(containerParam) ? containerParam : null;
    let shell: ClientChannel | null = null;
    const buffer = new TerminalBuffer();

    const setup = async () => {
      try {
        shell = await connectionManager.getShell(serverId, {
          rows: 24,
          cols: 80,
          term: 'xterm-256color',
        });

        // EX7: if a container was requested, exec into it so the whole session
        // lives inside the container (and exiting it ends the session cleanly).
        if (containerId) {
          shell.write(`exec docker exec -it ${containerId} sh\n`);
        }

        // SSH → Browser (with buffer capture)
        shell.on('data', (data: Buffer) => {
          if (socket.readyState === 1) { // OPEN
            socket.send(data);
          }

          // EX1.11: Capture output and detect patterns
          const hint = buffer.append(data);
          if (hint && socket.readyState === 1) {
            // Send a hint to the client as a JSON control message
            const snapshot = buffer.getLastCommandOutput();
            socket.send(
              JSON.stringify({
                type: 'visualize-hint',
                hint,
                rawOutput: snapshot?.text ?? '',
                lineCount: snapshot?.lineCount ?? 0,
              }),
            );
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

          // Handle JSON control messages
          if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x01)) {
            try {
              const str = typeof data === 'string' ? data : data.toString();
              const msg = JSON.parse(str) as { type: string; rows?: number; cols?: number; lastN?: number };
              if (msg.type === 'resize' && msg.rows && msg.cols) {
                shell.setWindow(msg.rows, msg.cols, 0, 0);
                return;
              }
              // EX1.11: Client requests the buffer snapshot
              if (msg.type === 'get-buffer') {
                const snapshot = buffer.getLastCommandOutput() ?? buffer.getSnapshot(msg.lastN ?? 100);
                if (socket.readyState === 1) {
                  socket.send(
                    JSON.stringify({
                      type: 'buffer-snapshot',
                      text: snapshot.text,
                      lineCount: snapshot.lineCount,
                    }),
                  );
                }
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
          buffer.clear();
        });

        socket.on('error', () => {
          if (shell) {
            shell.end();
            shell = null;
          }
          buffer.clear();
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
