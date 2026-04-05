// M3.6: Services Routes — systemd service management via SSH
// Uses `systemctl` CLI for service listing and control
// @see docs/phases/phase-3.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { ServiceInfo } from 'headlessos-shared';

interface ServicesRouteOpts {
  connectionManager: ConnectionManager;
}

// Parse `systemctl list-units --type=service --all --no-pager --no-legend` output
function parseServiceList(stdout: string): ServiceInfo[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const services: ServiceInfo[] = [];

  for (const line of lines) {
    // Format: UNIT LOAD ACTIVE SUB DESCRIPTION...
    // e.g.: "  ssh.service loaded active running OpenBSD Secure Shell server"
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Some lines start with ● for failed services
    const cleaned = trimmed.replace(/^[●○]\s*/, '');

    const parts = cleaned.split(/\s+/);
    if (parts.length < 4) continue;

    const unitName = parts[0];
    const loadState = parts[1];
    const activeState = parts[2];
    const subState = parts[3];
    const description = parts.slice(4).join(' ');

    // Only include .service units
    if (!unitName.endsWith('.service')) continue;

    // Strip .service suffix for display name
    const name = unitName.replace(/\.service$/, '');

    services.push({
      name,
      loadState: (['loaded', 'not-found', 'masked'].includes(loadState)
        ? loadState
        : 'loaded') as ServiceInfo['loadState'],
      activeState: (['active', 'inactive', 'failed', 'activating', 'deactivating'].includes(activeState)
        ? activeState
        : 'inactive') as ServiceInfo['activeState'],
      subState,
      description,
    });
  }

  // Sort: active first, then by name
  services.sort((a, b) => {
    if (a.activeState === 'active' && b.activeState !== 'active') return -1;
    if (a.activeState !== 'active' && b.activeState === 'active') return 1;
    if (a.activeState === 'failed' && b.activeState !== 'failed') return -1;
    if (a.activeState !== 'failed' && b.activeState === 'failed') return 1;
    return a.name.localeCompare(b.name);
  });

  return services;
}

// Validate service name — alphanumeric, hyphen, underscore, @ allowed
function isValidServiceName(name: string): boolean {
  return /^[a-zA-Z0-9_\-@.]+$/.test(name) && name.length <= 256;
}

export async function servicesRoutes(
  fastify: FastifyInstance,
  opts: ServicesRouteOpts,
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

  // ── GET /api/servers/:id/services — list systemd services ──

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/services',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const result = await connectionManager.exec(
          id,
          'systemctl list-units --type=service --all --no-pager --no-legend',
          10_000,
        );

        if (result.exitCode !== 0 && !result.stdout.trim()) {
          const errMsg = result.stderr.trim();
          if (errMsg.includes('not found') || errMsg.includes('command not found')) {
            return { success: true, data: [], systemdAvailable: false };
          }
          reply.code(500);
          return { success: false, error: errMsg || 'Failed to list services' };
        }

        const services = parseServiceList(result.stdout);
        return { success: true, data: services, systemdAvailable: true };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list services',
        };
      }
    },
  );

  // ── POST /api/servers/:id/services/:serviceName/:action — start/stop/restart/enable/disable ──

  fastify.post<{ Params: { id: string; serviceName: string; action: string } }>(
    '/api/servers/:id/services/:serviceName/:action',
    async (req, reply) => {
      const { id, serviceName, action } = req.params;
      requireConnected(id);

      if (!isValidServiceName(serviceName)) {
        reply.code(400);
        return { success: false, error: 'Invalid service name' };
      }

      const validActions = ['start', 'stop', 'restart', 'enable', 'disable'];
      if (!validActions.includes(action)) {
        reply.code(400);
        return {
          success: false,
          error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`,
        };
      }

      try {
        // Use sudo for service control
        const unit = serviceName.endsWith('.service') ? serviceName : `${serviceName}.service`;
        const result = await connectionManager.exec(
          id,
          `sudo systemctl ${action} ${unit}`,
          15_000,
        );

        if (result.exitCode === 0) {
          return { success: true };
        }
        reply.code(500);
        return {
          success: false,
          error: result.stderr.trim() || `systemctl ${action} failed with exit code ${result.exitCode}`,
        };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : `Failed to ${action} service`,
        };
      }
    },
  );

  // ── GET /api/servers/:id/services/:serviceName/status — detailed service status ──

  fastify.get<{ Params: { id: string; serviceName: string } }>(
    '/api/servers/:id/services/:serviceName/status',
    async (req, reply) => {
      const { id, serviceName } = req.params;
      requireConnected(id);

      if (!isValidServiceName(serviceName)) {
        reply.code(400);
        return { success: false, error: 'Invalid service name' };
      }

      try {
        const unit = serviceName.endsWith('.service') ? serviceName : `${serviceName}.service`;
        const result = await connectionManager.exec(
          id,
          `systemctl status ${unit} --no-pager`,
          10_000,
        );

        // systemctl status returns exit code 3 for inactive services, that's ok
        return { success: true, data: result.stdout.trim() || result.stderr.trim() };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get service status',
        };
      }
    },
  );

  // ── GET /api/servers/:id/services/:serviceName/logs — recent journal logs ──

  fastify.get<{
    Params: { id: string; serviceName: string };
    Querystring: { lines?: string };
  }>(
    '/api/servers/:id/services/:serviceName/logs',
    async (req, reply) => {
      const { id, serviceName } = req.params;
      const lines = req.query.lines ?? '100';
      requireConnected(id);

      if (!isValidServiceName(serviceName)) {
        reply.code(400);
        return { success: false, error: 'Invalid service name' };
      }

      if (!/^\d+$/.test(lines)) {
        reply.code(400);
        return { success: false, error: 'Invalid lines count' };
      }

      try {
        const unit = serviceName.endsWith('.service') ? serviceName : `${serviceName}.service`;
        const result = await connectionManager.exec(
          id,
          `journalctl -u ${unit} -n ${lines} --no-pager`,
          10_000,
        );

        return { success: true, data: result.stdout.trim() || result.stderr.trim() };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch service logs',
        };
      }
    },
  );
}
