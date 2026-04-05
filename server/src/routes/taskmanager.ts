// M7.1: Task Manager Routes
// Provides process list, CPU/memory/network/disk performance data
// @see docs/phases/phase-7.md

import type { FastifyInstance } from 'fastify';
import type { CommandOrchestrator, ExecutionPlan } from '../orchestrator/orchestrator.js';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import {
  ProcessListSchema,
  CpuStatsSchema,
  NetworkIoSchema,
  DiskIoSchema,
} from '../parsers/schemas/taskmanager.js';
import { MemoryInfoSchema as SystemMemorySchema } from '../parsers/schemas/system.js';
import type {
  ProcessListParsed,
  CpuStatsParsed,
  NetworkIoParsed,
  DiskIoParsed,
} from '../parsers/schemas/taskmanager.js';
import type { MemoryInfoParsed } from '../parsers/schemas/system.js';

interface TaskManagerRouteOpts {
  orchestrator: CommandOrchestrator;
  connectionManager: ConnectionManager;
}

export async function taskManagerRoutes(
  fastify: FastifyInstance,
  opts: TaskManagerRouteOpts,
): Promise<void> {
  const { orchestrator, connectionManager } = opts;

  function requireConnected(serverId: string): void {
    const state = connectionManager.getState(serverId);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${serverId}" is not connected`), {
        statusCode: 400,
      });
    }
  }

  // ── GET /api/servers/:id/taskmanager — full snapshot ──

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/taskmanager',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const plan: ExecutionPlan = {
        steps: [
          {
            id: 'processes',
            command: 'ps aux',
            schema: ProcessListSchema,
            timeout: 10_000,
          },
          {
            id: 'cpu',
            command: 'top -bn1 -1 | head -20 && cat /proc/loadavg && nproc',
            schema: CpuStatsSchema,
            timeout: 10_000,
          },
          {
            id: 'memory',
            command: 'free -m',
            schema: SystemMemorySchema,
            timeout: 10_000,
          },
          {
            id: 'network-io',
            command: 'cat /proc/net/dev',
            schema: NetworkIoSchema,
            timeout: 10_000,
          },
          {
            id: 'disk-io',
            command: 'cat /proc/diskstats',
            schema: DiskIoSchema,
            timeout: 10_000,
          },
        ],
        parallel: true,
      };

      try {
        const result = await orchestrator.execute(
          id,
          plan,
          (results) => {
            const processes = (results.get('processes') ?? []) as ProcessListParsed;
            const cpu = (results.get('cpu') ?? {
              overallPercent: 0,
              coreCount: 1,
              cores: [],
              loadAverage: { one: 0, five: 0, fifteen: 0 },
              processes: { total: 0, running: 0, sleeping: 0, stopped: 0, zombie: 0 },
              uptime: 'unknown',
            }) as CpuStatsParsed;
            const memory = (results.get('memory') ?? {
              totalMb: 0,
              usedMb: 0,
              freeMb: 0,
              availableMb: 0,
              swapTotalMb: 0,
              swapUsedMb: 0,
            }) as MemoryInfoParsed;
            const networkIo = (results.get('network-io') ?? []) as NetworkIoParsed;
            const diskIo = (results.get('disk-io') ?? []) as DiskIoParsed;

            return { processes, cpu, memory, networkIo, diskIo };
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
          error: err instanceof Error ? err.message : 'Failed to fetch task manager data',
        };
      }
    },
  );

  // ── POST /api/servers/:id/taskmanager/kill — kill process ──

  fastify.post<{ Params: { id: string }; Body: { pid: number; signal?: number } }>(
    '/api/servers/:id/taskmanager/kill',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const { pid, signal = 15 } = req.body ?? {};

      if (typeof pid !== 'number' || pid <= 0 || !Number.isInteger(pid)) {
        reply.code(400);
        return { success: false, error: 'Invalid PID' };
      }

      // Only allow SIGTERM (15) and SIGKILL (9)
      if (signal !== 9 && signal !== 15) {
        reply.code(400);
        return { success: false, error: 'Signal must be 9 (SIGKILL) or 15 (SIGTERM)' };
      }

      try {
        const result = await connectionManager.exec(id, `kill -${signal} ${pid}`, 5_000);
        if (result.exitCode === 0) {
          return { success: true };
        }
        return {
          success: false,
          error: result.stderr.trim() || `kill failed with exit code ${result.exitCode}`,
        };
      } catch (err) {
        reply.code(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to kill process',
        };
      }
    },
  );
}
