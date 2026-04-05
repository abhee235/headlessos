// M3.1: Docker Routes — container & image management via SSH
// Uses `docker` CLI with JSON format for deterministic parsing (no LLM needed)
// @see docs/phases/phase-3.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { DockerContainer, DockerImage } from 'headlessos-shared';
import type { ClientChannel } from 'ssh2';

interface DockerRouteOpts {
  connectionManager: ConnectionManager;
}

// Docker JSON format field mapping
interface DockerPsJson {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
  Ports: string;
  CreatedAt: string;
}

interface DockerImageJson {
  ID: string;
  Repository: string;
  Tag: string;
  Size: string;
  CreatedAt: string;
}

function parseContainers(stdout: string): DockerContainer[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const containers: DockerContainer[] = [];
  for (const line of lines) {
    try {
      const raw: DockerPsJson = JSON.parse(line);
      const state = raw.State.toLowerCase();
      containers.push({
        id: raw.ID,
        name: raw.Names,
        image: raw.Image,
        status: raw.Status,
        state: (['running', 'exited', 'paused', 'restarting', 'dead'].includes(state)
          ? state
          : 'exited') as DockerContainer['state'],
        ports: raw.Ports,
        created: raw.CreatedAt,
      });
    } catch {
      // skip malformed lines
    }
  }
  return containers;
}

function parseImages(stdout: string): DockerImage[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const images: DockerImage[] = [];
  for (const line of lines) {
    try {
      const raw: DockerImageJson = JSON.parse(line);
      images.push({
        id: raw.ID,
        repository: raw.Repository,
        tag: raw.Tag,
        size: raw.Size,
        created: raw.CreatedAt,
      });
    } catch {
      // skip malformed lines
    }
  }
  return images;
}

// Validate container/image ID — hex chars only (short or full hash)
function isValidDockerRef(ref: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.\-/:]*$/.test(ref) && ref.length <= 256;
}

export async function dockerRoutes(
  fastify: FastifyInstance,
  opts: DockerRouteOpts,
): Promise<void> {
  const { connectionManager } = opts;

  function requireConnected(serverId: string): void {
    const state = connectionManager.getState(serverId);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${serverId}" is not connected`), {
        statusCode: 400,
      });
    }
  }

  // ── GET /api/servers/:id/docker/containers — list all containers ──

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/docker/containers',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const result = await connectionManager.exec(
          id,
          'docker ps -a --format \'{{json .}}\'',
          10_000,
        );

        if (result.exitCode !== 0) {
          // Docker might not be installed or user lacks permissions
          const errMsg = result.stderr.trim();
          if (errMsg.includes('not found') || errMsg.includes('command not found')) {
            return { success: true, data: [], dockerAvailable: false };
          }
          reply.code(500);
          return { success: false, error: errMsg || 'Failed to list containers' };
        }

        const containers = parseContainers(result.stdout);
        return { success: true, data: containers, dockerAvailable: true };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list containers',
        };
      }
    },
  );

  // ── GET /api/servers/:id/docker/images — list all images ──

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/docker/images',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const result = await connectionManager.exec(
          id,
          'docker images --format \'{{json .}}\'',
          10_000,
        );

        if (result.exitCode !== 0) {
          const errMsg = result.stderr.trim();
          if (errMsg.includes('not found') || errMsg.includes('command not found')) {
            return { success: true, data: [], dockerAvailable: false };
          }
          reply.code(500);
          return { success: false, error: errMsg || 'Failed to list images' };
        }

        const images = parseImages(result.stdout);
        return { success: true, data: images, dockerAvailable: true };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list images',
        };
      }
    },
  );

  // ── POST /api/servers/:id/docker/containers/:containerId/:action — start/stop/restart/pause/unpause ──

  fastify.post<{ Params: { id: string; containerId: string; action: string } }>(
    '/api/servers/:id/docker/containers/:containerId/:action',
    async (req, reply) => {
      const { id, containerId, action } = req.params;
      requireConnected(id);

      if (!isValidDockerRef(containerId)) {
        reply.code(400);
        return { success: false, error: 'Invalid container ID' };
      }

      const validActions = ['start', 'stop', 'restart', 'pause', 'unpause'];
      if (!validActions.includes(action)) {
        reply.code(400);
        return { success: false, error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}` };
      }

      try {
        const result = await connectionManager.exec(
          id,
          `docker ${action} ${containerId}`,
          30_000, // stop/restart may take up to 10s via SIGTERM
        );

        if (result.exitCode === 0) {
          return { success: true };
        }
        reply.code(500);
        return {
          success: false,
          error: result.stderr.trim() || `docker ${action} failed with exit code ${result.exitCode}`,
        };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : `Failed to ${action} container`,
        };
      }
    },
  );

  // ── POST /api/servers/:id/docker/run — create & start a container from an image ──

  fastify.post<{
    Params: { id: string };
    Body: {
      image: string;
      name?: string;
      ports?: string[];    // ["8080:80", "3306:3306"]
      env?: string[];      // ["KEY=VALUE"]
      volumes?: string[];  // ["/host:/container"]
      detach?: boolean;
      command?: string;    // override CMD
    };
  }>(
    '/api/servers/:id/docker/run',
    async (req, reply) => {
      const { id } = req.params;
      const { image, name, ports, env, volumes, detach = true, command } = req.body ?? {};
      requireConnected(id);

      if (!image || !isValidDockerRef(image)) {
        reply.code(400);
        return { success: false, error: 'Invalid or missing image name' };
      }

      // Build `docker run` command safely
      const args: string[] = ['docker', 'run'];

      if (detach) args.push('-d');

      if (name) {
        // Validate container name: alphanumeric, underscore, hyphen, dot
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$/.test(name) || name.length > 128) {
          reply.code(400);
          return { success: false, error: 'Invalid container name' };
        }
        args.push('--name', name);
      }

      if (ports && Array.isArray(ports)) {
        for (const p of ports) {
          // Validate port mapping: number:number or ip:number:number
          if (!/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:)?\d+:\d+(\/tcp|\/udp)?$/.test(p)) {
            reply.code(400);
            return { success: false, error: `Invalid port mapping: ${p}` };
          }
          args.push('-p', p);
        }
      }

      if (env && Array.isArray(env)) {
        for (const e of env) {
          // Basic env validation: must contain = and no shell metacharacters
          if (!e.includes('=') || /[;&|`$]/.test(e)) {
            reply.code(400);
            return { success: false, error: `Invalid environment variable: ${e}` };
          }
          args.push('-e', e);
        }
      }

      if (volumes && Array.isArray(volumes)) {
        for (const v of volumes) {
          // Validate volume: path:path (no shell metacharacters)
          if (!v.includes(':') || /[;&|`$]/.test(v)) {
            reply.code(400);
            return { success: false, error: `Invalid volume mapping: ${v}` };
          }
          args.push('-v', v);
        }
      }

      args.push(image);

      if (command) {
        // Validate command: no dangerous shell metacharacters
        if (/[;&|`$]/.test(command)) {
          reply.code(400);
          return { success: false, error: 'Invalid command — shell metacharacters not allowed' };
        }
        args.push(...command.split(/\s+/));
      }

      const cmd = args.join(' ');

      try {
        const result = await connectionManager.exec(id, cmd, 60_000);

        if (result.exitCode === 0) {
          const containerId = result.stdout.trim().substring(0, 12);
          return { success: true, containerId };
        }
        reply.code(500);
        return {
          success: false,
          error: result.stderr.trim() || `docker run failed with exit code ${result.exitCode}`,
        };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to run container',
        };
      }
    },
  );

  // ── DELETE /api/servers/:id/docker/containers/:containerId — remove container ──

  fastify.delete<{ Params: { id: string; containerId: string }; Querystring: { force?: string } }>(
    '/api/servers/:id/docker/containers/:containerId',
    async (req, reply) => {
      const { id, containerId } = req.params;
      const force = req.query.force === 'true';
      requireConnected(id);

      if (!isValidDockerRef(containerId)) {
        reply.code(400);
        return { success: false, error: 'Invalid container ID' };
      }

      try {
        const cmd = force ? `docker rm -f ${containerId}` : `docker rm ${containerId}`;
        const result = await connectionManager.exec(id, cmd, 15_000);

        if (result.exitCode === 0) {
          return { success: true };
        }
        reply.code(500);
        return {
          success: false,
          error: result.stderr.trim() || `Failed to remove container`,
        };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to remove container',
        };
      }
    },
  );

  // ── DELETE /api/servers/:id/docker/images/:imageId — remove image ──

  fastify.delete<{ Params: { id: string; imageId: string }; Querystring: { force?: string } }>(
    '/api/servers/:id/docker/images/:imageId',
    async (req, reply) => {
      const { id, imageId } = req.params;
      const force = req.query.force === 'true';
      requireConnected(id);

      if (!isValidDockerRef(imageId)) {
        reply.code(400);
        return { success: false, error: 'Invalid image ID' };
      }

      try {
        const cmd = force ? `docker rmi -f ${imageId}` : `docker rmi ${imageId}`;
        const result = await connectionManager.exec(id, cmd, 15_000);

        if (result.exitCode === 0) {
          return { success: true };
        }
        reply.code(500);
        return {
          success: false,
          error: result.stderr.trim() || `Failed to remove image`,
        };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to remove image',
        };
      }
    },
  );

  // ── GET /api/servers/:id/docker/containers/:containerId/logs — fetch container logs ──

  fastify.get<{
    Params: { id: string; containerId: string };
    Querystring: { tail?: string; since?: string };
  }>(
    '/api/servers/:id/docker/containers/:containerId/logs',
    async (req, reply) => {
      const { id, containerId } = req.params;
      const tail = req.query.tail ?? '200';
      const since = req.query.since;
      requireConnected(id);

      if (!isValidDockerRef(containerId)) {
        reply.code(400);
        return { success: false, error: 'Invalid container ID' };
      }

      // Validate tail is a number
      if (!/^\d+$/.test(tail)) {
        reply.code(400);
        return { success: false, error: 'Invalid tail count' };
      }

      try {
        let cmd = `docker logs --tail ${tail} --timestamps ${containerId}`;
        if (since) {
          // Basic ISO date validation
          if (!/^\d{4}-\d{2}-\d{2}/.test(since)) {
            reply.code(400);
            return { success: false, error: 'Invalid since format' };
          }
          cmd = `docker logs --since ${since} --timestamps ${containerId}`;
        }

        const result = await connectionManager.exec(id, cmd, 15_000);

        // docker logs sends output to stderr for some containers, combine both
        const logs = (result.stdout + result.stderr).trim();
        return { success: true, data: logs };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch logs',
        };
      }
    },
  );

  // ── GET /api/servers/:id/docker/containers/:containerId/inspect — detailed container info ──

  fastify.get<{ Params: { id: string; containerId: string } }>(
    '/api/servers/:id/docker/containers/:containerId/inspect',
    async (req, reply) => {
      const { id, containerId } = req.params;
      requireConnected(id);

      if (!isValidDockerRef(containerId)) {
        reply.code(400);
        return { success: false, error: 'Invalid container ID' };
      }

      try {
        const result = await connectionManager.exec(
          id,
          `docker inspect ${containerId}`,
          10_000,
        );

        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr.trim() || 'Failed to inspect container' };
        }

        const inspectData = JSON.parse(result.stdout);
        return { success: true, data: inspectData[0] ?? inspectData };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to inspect container',
        };
      }
    },
  );

  // ── WS /ws/docker-install/:serverId — install Docker via interactive shell + xterm.js ──

  fastify.get('/ws/docker-install/:serverId', { websocket: true }, (socket, req) => {
    const { serverId } = (req.params as { serverId: string });
    let shell: ClientChannel | null = null;

    const setup = async () => {
      try {
        requireConnected(serverId);

        shell = await connectionManager.getShell(serverId, {
          rows: 24,
          cols: 80,
          term: 'xterm-256color',
        });

        // SSH → Browser
        shell.on('data', (data: Buffer) => {
          if (socket.readyState === 1) {
            socket.send(data);
          }
        });

        shell.stderr.on('data', (data: Buffer) => {
          if (socket.readyState === 1) {
            socket.send(data);
          }
        });

        shell.on('close', () => {
          // Send a completion marker before closing
          if (socket.readyState === 1) {
            socket.send('\r\n\x1b[32m[Docker installation process finished]\x1b[0m\r\n');
          }
          socket.close();
        });

        // Browser → SSH (handle resize and input)
        socket.on('message', (data: Buffer | string) => {
          if (!shell) return;

          // Handle JSON messages (resize, commands)
          try {
            const str = typeof data === 'string' ? data : data.toString();
            const msg = JSON.parse(str) as { type: string; rows?: number; cols?: number };
            if (msg.type === 'resize' && msg.rows && msg.cols) {
              shell.setWindow(msg.rows, msg.cols, 0, 0);
              return;
            }
            if (msg.type === 'start-install') {
              // Run the Docker install script via get.docker.com
              // Uses the official convenience script — supports Ubuntu, Debian, CentOS, Fedora, etc.
              // Note: `set +H` disables bash history expansion so `!` in echo strings doesn't trigger `event not found`
              // We write a proper shell script using newlines (not &&) so if/then/else/fi works correctly.
              const installScript = `set +H
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

              // Write the script to the shell (newline-separated, not &&-joined)
              shell.write(installScript);
              return;
            }
          } catch {
            // Not JSON — treat as terminal input (for sudo password, etc.)
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
        const message = err instanceof Error ? err.message : 'Failed to open install terminal';
        if (socket.readyState === 1) {
          socket.send(`\r\n\x1b[31m[Error: ${message}]\x1b[0m\r\n`);
        }
        socket.close();
      }
    };

    setup();
  });
}
