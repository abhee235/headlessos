// M11.1: Fleet Overview Routes — aggregate stats across all connected servers
// @see docs/PROGRESS.md

import type { FastifyInstance } from 'fastify';
import type { CommandOrchestrator, ExecutionPlan } from '../orchestrator/orchestrator.js';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { ConfigStore } from '../config/store.js';
import {
  SystemInfoSchema,
  DiskUsageSchema,
  MemoryInfoSchema,
} from '../parsers/schemas/system.js';
import type {
  SystemInfoParsed,
  DiskUsageParsed,
  MemoryInfoParsed,
} from '../parsers/schemas/system.js';

export interface FleetServerSummary {
  id: string;
  name: string;
  host: string;
  port: number;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  tags: string[];
  system?: {
    hostname: string;
    os: string;
    uptime: string;
    kernel: string;
    architecture: string;
  };
  memory?: {
    totalMb: number;
    usedMb: number;
    usedPercent: number;
  };
  disk?: {
    totalGb: number;
    usedGb: number;
    usedPercent: number;
  };
  latencyMs?: number;
  error?: string;
}

export interface FleetOverview {
  servers: FleetServerSummary[];
  totals: {
    total: number;
    connected: number;
    disconnected: number;
    totalMemoryMb: number;
    usedMemoryMb: number;
    totalDiskGb: number;
    usedDiskGb: number;
  };
  fetchedAt: string;
}

interface FleetRouteOpts {
  orchestrator: CommandOrchestrator;
  connectionManager: ConnectionManager;
  configStore: ConfigStore;
}

export async function fleetRoutes(
  fastify: FastifyInstance,
  opts: FleetRouteOpts,
): Promise<void> {
  const { orchestrator, connectionManager, configStore } = opts;

  // ── GET /api/fleet/overview — aggregate all servers ───

  fastify.get('/api/fleet/overview', async (_req, reply) => {
    const allServers = await configStore.getServers();
    const summaries: FleetServerSummary[] = [];

    // Query all connected servers in parallel
    const promises = allServers.map(async (srv): Promise<FleetServerSummary> => {
      const state = connectionManager.getState(srv.id);
      const status = state.status as FleetServerSummary['status'];

      const base: FleetServerSummary = {
        id: srv.id,
        name: srv.name,
        host: srv.host,
        port: srv.port ?? 22,
        status,
        tags: srv.tags ?? [],
      };

      if (status !== 'connected') {
        return base;
      }

      // Fetch system + memory + disk in parallel for this server
      const plan: ExecutionPlan = {
        steps: [
          {
            id: 'system-info',
            command: 'uname -a && uptime -p && cat /etc/os-release',
            schema: SystemInfoSchema,
            fallbackCommands: ['uname -a && uptime && cat /etc/os-release'],
            timeout: 8_000,
          },
          {
            id: 'memory',
            command: 'free -m',
            schema: MemoryInfoSchema,
            timeout: 8_000,
          },
          {
            id: 'disk',
            command: 'df -h',
            schema: DiskUsageSchema,
            timeout: 8_000,
          },
        ],
        parallel: true,
      };

      try {
        const result = await orchestrator.execute(
          srv.id,
          plan,
          (results) => {
            const sysInfo = results.get('system-info') as SystemInfoParsed | undefined;
            const memory = results.get('memory') as MemoryInfoParsed | undefined;
            const diskArr = results.get('disk') as DiskUsageParsed | undefined;

            return { sysInfo, memory, diskArr };
          },
        );

        const { sysInfo, memory, diskArr } = result.data as {
          sysInfo?: SystemInfoParsed;
          memory?: MemoryInfoParsed;
          diskArr?: DiskUsageParsed;
        };

        // Aggregate disk — sum only real filesystems mounted on /
        let totalDiskGb = 0;
        let usedDiskGb = 0;
        if (Array.isArray(diskArr)) {
          for (const fs of diskArr) {
            // Only count real mounts (skip tmpfs, devtmpfs etc)
            if (fs.mountPoint === '/' || fs.mountPoint.startsWith('/home') || fs.mountPoint.startsWith('/data')) {
              totalDiskGb += parseFloat(String(fs.size ?? '0')) || 0;
              usedDiskGb += parseFloat(String(fs.used ?? '0')) || 0;
            }
          }
        }

        return {
          ...base,
          system: sysInfo ? {
            hostname: sysInfo.hostname,
            os: sysInfo.os,
            uptime: sysInfo.uptime,
            kernel: sysInfo.kernel,
            architecture: sysInfo.architecture,
          } : undefined,
          memory: memory ? {
            totalMb: memory.totalMb,
            usedMb: memory.usedMb,
            usedPercent: memory.totalMb > 0
              ? Math.round((memory.usedMb / memory.totalMb) * 100)
              : 0,
          } : undefined,
          disk: totalDiskGb > 0 ? {
            totalGb: Math.round(totalDiskGb * 10) / 10,
            usedGb: Math.round(usedDiskGb * 10) / 10,
            usedPercent: Math.round((usedDiskGb / totalDiskGb) * 100),
          } : undefined,
          latencyMs: result.totalLatencyMs,
        };
      } catch (err) {
        return {
          ...base,
          error: err instanceof Error ? err.message : 'Failed to fetch data',
        };
      }
    });

    const results = await Promise.allSettled(promises);

    for (const r of results) {
      if (r.status === 'fulfilled') {
        summaries.push(r.value);
      }
    }

    // Compute totals
    const connected = summaries.filter(s => s.status === 'connected').length;
    let totalMemoryMb = 0;
    let usedMemoryMb = 0;
    let totalDiskGb = 0;
    let usedDiskGb = 0;

    for (const s of summaries) {
      if (s.memory) {
        totalMemoryMb += s.memory.totalMb;
        usedMemoryMb += s.memory.usedMb;
      }
      if (s.disk) {
        totalDiskGb += s.disk.totalGb;
        usedDiskGb += s.disk.usedGb;
      }
    }

    const overview: FleetOverview = {
      servers: summaries,
      totals: {
        total: summaries.length,
        connected,
        disconnected: summaries.length - connected,
        totalMemoryMb,
        usedMemoryMb,
        totalDiskGb,
        usedDiskGb,
      },
      fetchedAt: new Date().toISOString(),
    };

    return { success: true, data: overview };
  });

  // ── PUT /api/servers/:id/tags — set tags on a server ──

  fastify.put<{ Params: { id: string }; Body: { tags: string[] } }>(
    '/api/servers/:id/tags',
    async (req, reply) => {
      const { id } = req.params;
      const { tags } = req.body ?? {};

      if (!Array.isArray(tags) || tags.some(t => typeof t !== 'string')) {
        reply.code(400);
        return { success: false, error: 'tags must be an array of strings' };
      }

      const server = await configStore.getServer(id);
      if (!server) {
        reply.code(404);
        return { success: false, error: 'Server not found' };
      }

      // Store tags on the server config
      const updated = await configStore.updateServer(id, { tags } as Record<string, unknown>);
      return { success: true, data: updated };
    },
  );
}
