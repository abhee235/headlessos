// M1.5 + EX1.11 + M12.8 + EX7 + EX8: Terminal WebSocket Bridge — thin route, delegates to TerminalService
// @see docs/phases/phase-1.md, docs/phases/phase-ex1.md, docs/phases/phase-12.md, docs/phases/phase-ex7.md

import type { FastifyInstance } from 'fastify';
import type { TerminalService, TerminalSession } from '../services/domain/terminal-service.js';
import { validateContainerId } from '../security/validators.js';
import { parseTerminalControl } from '../terminal/control.js';

interface TerminalRouteOpts {
  terminalService: TerminalService;
}

export async function terminalRoutes(
  fastify: FastifyInstance,
  opts: TerminalRouteOpts,
): Promise<void> {
  const { terminalService } = opts;

  fastify.get('/ws/terminal/:serverId', { websocket: true }, (socket, req) => {
    const { serverId } = req.params as { serverId: string };
    // EX7: optional ?container=<hex id> drops the session straight into that
    // container via `docker exec -it`. Validated as hex to prevent injection.
    const containerParam = (req.query as { container?: string } | undefined)?.container;
    const containerId = containerParam && validateContainerId(containerParam) ? containerParam : undefined;

    const setup = async () => {
      let session: TerminalSession;

      try {
        session = await terminalService.openSession(
          serverId,
          { rows: 24, cols: 80, containerId },
          {
            onData: (data) => {
              if (socket.readyState === 1) socket.send(data);
            },
            onHint: (hint, snapshot) => {
              if (socket.readyState !== 1) return;
              socket.send(
                JSON.stringify({
                  type: 'visualize-hint',
                  hint,
                  rawOutput: snapshot?.text ?? '',
                  lineCount: snapshot?.lineCount ?? 0,
                }),
              );
            },
            onClose: () => socket.close(),
            onError: (message) => {
              if (socket.readyState === 1) {
                socket.send(JSON.stringify({ type: 'error', message }));
              }
              socket.close();
            },
          },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open terminal';
        socket.send(JSON.stringify({ type: 'error', message }));
        socket.close();
        return;
      }

      // Browser → SSH. Keystrokes and JSON control messages share the socket
      // and both arrive as Buffers, so parseTerminalControl decides which is which.
      socket.on('message', (data: Buffer | string) => {
        const msg = parseTerminalControl(data);

        if (msg?.type === 'resize') {
          session.resize(msg.rows, msg.cols);
          return;
        }

        if (msg?.type === 'get-buffer') {
          const snapshot = session.getBufferSnapshot(msg.lastN ?? 100);
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

        session.write(data);
      });

      socket.on('close', () => session.close());
      socket.on('error', () => session.close());
    };

    setup();
  });
}
