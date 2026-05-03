// M1.5 + EX1.11 + M12.8: Terminal WebSocket Bridge — thin route, delegates to TerminalService
// @see docs/phases/phase-1.md, docs/phases/phase-ex1.md, docs/phases/phase-12.md

import type { FastifyInstance } from 'fastify';
import type { TerminalService, TerminalSession } from '../services/domain/terminal-service.js';

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

    const setup = async () => {
      let session: TerminalSession;

      try {
        session = await terminalService.openSession(
          serverId,
          { rows: 24, cols: 80 },
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

      // Browser → SSH
      socket.on('message', (data: Buffer | string) => {
        // JSON control messages have a 0x01 sentinel byte or are plain strings
        if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x01)) {
          try {
            const str = typeof data === 'string' ? data : data.toString();
            const msg = JSON.parse(str) as { type: string; rows?: number; cols?: number; lastN?: number };

            if (msg.type === 'resize' && msg.rows && msg.cols) {
              session.resize(msg.rows, msg.cols);
              return;
            }

            if (msg.type === 'get-buffer') {
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
          } catch {
            // Not JSON — fall through to write as raw terminal input
          }
        }

        session.write(data);
      });

      socket.on('close', () => session.close());
      socket.on('error', () => session.close());
    };

    setup();
  });
}

