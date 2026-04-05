// M2.1: System Dashboard Routes
// @see docs/phases/phase-2.md

import type { FastifyInstance } from 'fastify';
import type { CommandOrchestrator } from '../orchestrator/orchestrator.js';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { ExecutionPlan } from '../orchestrator/orchestrator.js';
import {
  SystemInfoSchema,
  DiskUsageSchema,
  MemoryInfoSchema,
  NetworkInterfacesSchema,
  SystemDashboardSchema,
} from '../parsers/schemas/system.js';
import type {
  SystemInfoParsed,
  DiskUsageParsed,
  MemoryInfoParsed,
  NetworkInterfacesParsed,
  SystemDashboardParsed,
} from '../parsers/schemas/system.js';

interface SystemRouteOpts {
  orchestrator: CommandOrchestrator;
  connectionManager: ConnectionManager;
}

export async function systemRoutes(
  fastify: FastifyInstance,
  opts: SystemRouteOpts,
): Promise<void> {
  const { orchestrator, connectionManager } = opts;

  // ── Helper: ensure server is connected ────────────────

  function requireConnected(serverId: string): void {
    const state = connectionManager.getState(serverId);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${serverId}" is not connected`), {
        statusCode: 400,
      });
    }
  }

  // ── GET /api/servers/:id/system — full dashboard ──────

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/system',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const plan: ExecutionPlan = {
        steps: [
          {
            id: 'system-info',
            command: 'uname -a && uptime -p && cat /etc/os-release',
            schema: SystemInfoSchema,
            fallbackCommands: ['uname -a && uptime && cat /etc/os-release'],
            timeout: 10_000,
          },
          {
            id: 'disk',
            command: 'df -h',
            schema: DiskUsageSchema,
            timeout: 10_000,
          },
          {
            id: 'memory',
            command: 'free -m',
            schema: MemoryInfoSchema,
            timeout: 10_000,
          },
          {
            id: 'network',
            command: 'ip -brief addr',
            schema: NetworkInterfacesSchema,
            fallbackCommands: ['ip addr show', 'ifconfig'],
            timeout: 10_000,
          },
        ],
        parallel: true,
      };

      try {
        const result = await orchestrator.execute<SystemDashboardParsed>(
          id,
          plan,
          (results) => {
            const system = (results.get('system-info') ?? {
              hostname: 'unknown',
              uptime: 'unknown',
              os: 'unknown',
              kernel: 'unknown',
              architecture: 'unknown',
            }) as SystemInfoParsed;

            const disks = (results.get('disk') ?? []) as DiskUsageParsed;
            const memory = (results.get('memory') ?? {
              totalMb: 0,
              usedMb: 0,
              freeMb: 0,
              availableMb: 0,
              swapTotalMb: 0,
              swapUsedMb: 0,
            }) as MemoryInfoParsed;

            const network = (results.get('network') ?? []) as NetworkInterfacesParsed;

            return SystemDashboardSchema.parse({
              system,
              disks,
              memory,
              network,
            });
          },
        );

        return {
          success: true,
          data: result.data,
          steps: result.steps.map((s) => ({
            stepId: s.stepId,
            parsedBy: s.parsedBy,
            latencyMs: s.latencyMs,
            success: s.success,
          })),
          totalLatencyMs: result.totalLatencyMs,
        };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch system data',
        };
      }
    },
  );

  // ── GET /api/servers/:id/system/disk — disk only ──────

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/system/disk',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const plan: ExecutionPlan = {
        steps: [
          {
            id: 'disk',
            command: 'df -h',
            schema: DiskUsageSchema,
            timeout: 10_000,
          },
        ],
      };

      try {
        const result = await orchestrator.execute<DiskUsageParsed>(
          id,
          plan,
          (results) => results.get('disk') as DiskUsageParsed,
        );

        return {
          success: true,
          data: result.data,
          parsedBy: result.steps[0]?.parsedBy,
          latencyMs: result.totalLatencyMs,
        };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch disk data',
        };
      }
    },
  );

  // ── GET /api/servers/:id/system/memory — memory only ──

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/system/memory',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const plan: ExecutionPlan = {
        steps: [
          {
            id: 'memory',
            command: 'free -m',
            schema: MemoryInfoSchema,
            timeout: 10_000,
          },
        ],
      };

      try {
        const result = await orchestrator.execute<MemoryInfoParsed>(
          id,
          plan,
          (results) => results.get('memory') as MemoryInfoParsed,
        );

        return {
          success: true,
          data: result.data,
          parsedBy: result.steps[0]?.parsedBy,
          latencyMs: result.totalLatencyMs,
        };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch memory data',
        };
      }
    },
  );
}
