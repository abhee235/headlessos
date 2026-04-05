// M3.6: Services Routes — systemd service management via SSH
// Uses `systemctl` CLI for service listing and control
// @see docs/phases/phase-3.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import { validateServiceName, shellEscape } from '../security/validators.js';
import { parseSystemctlListUnits } from '../parsers/deterministic/systemctl.js';

interface ServicesRouteOpts {
  connectionManager: ConnectionManager;
}

// Use central validateServiceName from security/validators.ts

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

        const services = parseSystemctlListUnits(result.stdout);
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

      if (!validateServiceName(serviceName)) {
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
          `sudo systemctl ${action} ${shellEscape(unit)}`,
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

      if (!validateServiceName(serviceName)) {
        reply.code(400);
        return { success: false, error: 'Invalid service name' };
      }

      try {
        const unit = serviceName.endsWith('.service') ? serviceName : `${serviceName}.service`;
        const result = await connectionManager.exec(
          id,
          `systemctl status ${shellEscape(unit)} --no-pager`,
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

      if (!validateServiceName(serviceName)) {
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
          `journalctl -u ${shellEscape(unit)} -n ${lines} --no-pager`,
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
