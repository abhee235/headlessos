// M3.1 / M12.5: Docker Routes — thin HTTP wrappers around DockerService
// @see docs/phases/phase-3.md, docs/phases/phase-12.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { DockerService } from '../services/domain/docker-service.js';
import type { ClientChannel } from 'ssh2';
import { tryRoute } from '../services/domain/base.js';

interface DockerRouteOpts {
  connectionManager: ConnectionManager;
  dockerService: DockerService;
}

export async function dockerRoutes(
  fastify: FastifyInstance,
  opts: DockerRouteOpts,
): Promise<void> {
  const { connectionManager, dockerService } = opts;

  // ── GET containers ─────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/docker/containers',
    async (req, reply) => {
      const r = await dockerService.listContainers(req.params.id);
      if (!r.ok) {
        reply.code(r.statusCode ?? 500);
        return { success: false, error: r.error };
      }
      // Preserve legacy shape: data is the container array, dockerAvailable flat
      return {
        success: true,
        data: r.data!.containers,
        dockerAvailable: r.data!.dockerAvailable,
      };
    },
  );

  // ── GET images ─────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/docker/images',
    async (req, reply) => {
      const r = await dockerService.listImages(req.params.id);
      if (!r.ok) {
        reply.code(r.statusCode ?? 500);
        return { success: false, error: r.error };
      }
      return {
        success: true,
        data: r.data!.images,
        dockerAvailable: r.data!.dockerAvailable,
      };
    },
  );

  // ── POST container action (start/stop/restart/pause/unpause) ──
  fastify.post<{
    Params: { id: string; containerId: string; action: string };
  }>(
    '/api/servers/:id/docker/containers/:containerId/:action',
    async (req, reply) => {
      const { id, containerId, action } = req.params;
      const r = await dockerService.containerAction(id, containerId, action);
      if (!r.ok) {
        reply.code(r.statusCode ?? 500);
        return { success: false, error: r.error };
      }
      return { success: true };
    },
  );

  // ── POST docker run ────────────────────────────────────
  fastify.post<{
    Params: { id: string };
    Body: {
      image: string;
      name?: string;
      ports?: string[];
      env?: string[];
      volumes?: string[];
      detach?: boolean;
      command?: string;
    };
  }>('/api/servers/:id/docker/run', async (req, reply) => {
    const r = await dockerService.runContainer(req.params.id, req.body ?? {} as never);
    if (!r.ok) {
      reply.code(r.statusCode ?? 500);
      return { success: false, error: r.error };
    }
    return { success: true, containerId: r.data!.containerId };
  });

  // ── DELETE container ───────────────────────────────────
  fastify.delete<{
    Params: { id: string; containerId: string };
    Querystring: { force?: string };
  }>('/api/servers/:id/docker/containers/:containerId', async (req, reply) => {
    const force = req.query.force === 'true';
    const r = await dockerService.removeContainer(
      req.params.id,
      req.params.containerId,
      force,
    );
    if (!r.ok) {
      reply.code(r.statusCode ?? 500);
      return { success: false, error: r.error };
    }
    return { success: true };
  });

  // ── DELETE image ───────────────────────────────────────
  fastify.delete<{
    Params: { id: string; imageId: string };
    Querystring: { force?: string };
  }>('/api/servers/:id/docker/images/:imageId', async (req, reply) => {
    const force = req.query.force === 'true';
    const r = await dockerService.removeImage(
      req.params.id,
      req.params.imageId,
      force,
    );
    if (!r.ok) {
      reply.code(r.statusCode ?? 500);
      return { success: false, error: r.error };
    }
    return { success: true };
  });

  // ── GET container logs ─────────────────────────────────
  fastify.get<{
    Params: { id: string; containerId: string };
    Querystring: { tail?: string; since?: string };
  }>(
    '/api/servers/:id/docker/containers/:containerId/logs',
    async (req, reply) =>
      tryRoute(reply, () =>
        dockerService.getLogs(req.params.id, req.params.containerId, {
          tail: req.query.tail,
          since: req.query.since,
        }),
      ),
  );

  // ── GET container inspect ──────────────────────────────
  fastify.get<{ Params: { id: string; containerId: string } }>(
    '/api/servers/:id/docker/containers/:containerId/inspect',
    async (req, reply) =>
      tryRoute(reply, () =>
        dockerService.inspectContainer(req.params.id, req.params.containerId),
      ),
  );

  // ── WS docker install (interactive shell — stays here, not a service pattern) ──
  fastify.get(
    '/ws/docker-install/:serverId',
    { websocket: true },
    (socket, req) => {
      const { serverId } = req.params as { serverId: string };
      let shell: ClientChannel | null = null;

      const setup = async () => {
        try {
          const state = connectionManager.getState(serverId);
          if (state.status !== 'connected') {
            throw new Error(`Server "${serverId}" is not connected`);
          }

          shell = await connectionManager.getShell(serverId, {
            rows: 24,
            cols: 80,
            term: 'xterm-256color',
          });

          shell.on('data', (data: Buffer) => {
            if (socket.readyState === 1) socket.send(data);
          });

          shell.stderr.on('data', (data: Buffer) => {
            if (socket.readyState === 1) socket.send(data);
          });

          shell.on('close', () => {
            if (socket.readyState === 1) {
              socket.send(
                '\r\n\x1b[32m[Docker installation process finished]\x1b[0m\r\n',
              );
            }
            socket.close();
          });

          socket.on('message', (data: Buffer | string) => {
            if (!shell) return;
            try {
              const str = typeof data === 'string' ? data : data.toString();
              const msg = JSON.parse(str) as {
                type: string;
                rows?: number;
                cols?: number;
              };
              if (msg.type === 'resize' && msg.rows && msg.cols) {
                shell.setWindow(msg.rows, msg.cols, 0, 0);
                return;
              }
              if (msg.type === 'start-install') {
                shell.write(DOCKER_INSTALL_SCRIPT);
                return;
              }
            } catch {
              /* not JSON — treat as terminal input */
            }
            shell.write(data);
          });

          socket.on('close', () => {
            if (shell) {
              // close(), not just end(): see TerminalService — EOF alone leaks the pty channel
              shell.end();
              shell.close();
              shell = null;
            }
          });

          socket.on('error', () => {
            if (shell) {
              // close(), not just end(): see TerminalService — EOF alone leaks the pty channel
              shell.end();
              shell.close();
              shell = null;
            }
          });
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Failed to open install terminal';
          if (socket.readyState === 1) {
            socket.send(`\r\n\x1b[31m[Error: ${message}]\x1b[0m\r\n`);
          }
          socket.close();
        }
      };

      setup();
    },
  );
}

// Docker install script using get.docker.com — runs in interactive shell.
// `set +H` disables bash history expansion so `!` in echo strings is safe.
const DOCKER_INSTALL_SCRIPT = `set +H
echo "\\033[1;36m══════════════════════════════════════════════════════════════\\033[0m"
echo "\\033[1;36m  Docker Installation — HeadlessOS\\033[0m"
echo "\\033[1;36m══════════════════════════════════════════════════════════════\\033[0m"
echo ""
echo "\\033[33m⏳ Downloading official Docker install script from get.docker.com...\\033[0m"
echo ""
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sudo sh /tmp/get-docker.sh
INSTALL_EXIT=$?
echo ""
if [ $INSTALL_EXIT -eq 0 ]; then
  echo "\\033[32m✅ Docker installed successfully!\\033[0m"
  echo ""
  echo "\\033[33m⏳ Adding current user to docker group...\\033[0m"
  sudo usermod -aG docker $(whoami) 2>/dev/null
  echo "\\033[32m✅ User added to docker group.\\033[0m"
  echo ""
  echo "\\033[33m⏳ Starting Docker service...\\033[0m"
  sudo systemctl enable docker 2>/dev/null
  sudo systemctl start docker 2>/dev/null
  echo "\\033[32m✅ Docker service started.\\033[0m"
  echo ""
  docker --version 2>/dev/null
  echo ""
  echo "\\033[1;32m══════════════════════════════════════════════════════════════\\033[0m"
  echo "\\033[1;32m  Installation complete! You can close this panel now.\\033[0m"
  echo "\\033[1;32m══════════════════════════════════════════════════════════════\\033[0m"
else
  echo "\\033[31m❌ Docker installation failed (exit code $INSTALL_EXIT)\\033[0m"
  echo "\\033[33m   Make sure this user has sudo privileges.\\033[0m"
fi
rm -f /tmp/get-docker.sh
`;
