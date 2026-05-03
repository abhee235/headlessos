// M12.8: FleetService — domain layer for fleet-wide server aggregation
// @see docs/phases/phase-12.md
//
// Owns: parallel per-server queries, aggregation logic, tag persistence.
// Routes (routes/fleet.ts) only translate HTTP ↔ ServiceResult.

import { DomainService, ok, fail, type ServiceResult } from './base.js';
import {
  SystemInfoSchema,
  DiskUsageSchema,
  MemoryInfoSchema,
} from '../../parsers/schemas/system.js';
import type {
  SystemInfoParsed,
  DiskUsageParsed,
  MemoryInfoParsed,
} from '../../parsers/schemas/system.js';
import type { ConfigStore } from '../../config/store.js';
import type { ExecutionPlan } from '../../orchestrator/orchestrator.js';

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

export class FleetService extends DomainService {
  private configStore!: ConfigStore;

  protected async _construct(): Promise<void> {}

  protected async _init(): Promise<void> {
    await super._init();
    this.configStore = this.services.get<ConfigStore>('config');
  }

  // ── Fleet overview ───────────────────────────────────

  async getOverview(): Promise<ServiceResult<FleetOverview>> {
    try {
      const allServers = await this.configStore.getServers();

      const promises = allServers.map(async (srv): Promise<FleetServerSummary> => {
        const state = this.ssh.getState(srv.id);
        const status = state.status as FleetServerSummary['status'];

        const base: FleetServerSummary = {
          id: srv.id,
          name: srv.name,
          host: srv.host,
          port: srv.port ?? 22,
          status,
          tags: srv.tags ?? [],
        };

        if (status !== 'connected') return base;

        const plan: ExecutionPlan = {
          steps: [
            {
              id: 'system-info',
              command: 'uname -a && uptime -p && cat /etc/os-release',
              schema: SystemInfoSchema,
              fallbackCommands: ['uname -a && uptime && cat /etc/os-release'],
              timeout: 8_000,
            },
            { id: 'memory', command: 'free -m', schema: MemoryInfoSchema, timeout: 8_000 },
            { id: 'disk', command: 'df -h', schema: DiskUsageSchema, timeout: 8_000 },
          ],
          parallel: true,
        };

        try {
          const result = await this.orchestrator.execute(
            srv.id,
            plan,
            (results) => ({
              sysInfo: results.get('system-info') as SystemInfoParsed | undefined,
              memory: results.get('memory') as MemoryInfoParsed | undefined,
              diskArr: results.get('disk') as DiskUsageParsed | undefined,
            }),
          );

          const { sysInfo, memory, diskArr } = result.data as {
            sysInfo?: SystemInfoParsed;
            memory?: MemoryInfoParsed;
            diskArr?: DiskUsageParsed;
          };

          let totalDiskGb = 0;
          let usedDiskGb = 0;
          if (Array.isArray(diskArr)) {
            for (const fs of diskArr) {
              if (
                fs.mountPoint === '/' ||
                fs.mountPoint.startsWith('/home') ||
                fs.mountPoint.startsWith('/data')
              ) {
                totalDiskGb += parseFloat(String(fs.size ?? '0')) || 0;
                usedDiskGb += parseFloat(String(fs.used ?? '0')) || 0;
              }
            }
          }

          return {
            ...base,
            system: sysInfo
              ? {
                  hostname: sysInfo.hostname,
                  os: sysInfo.os,
                  uptime: sysInfo.uptime,
                  kernel: sysInfo.kernel,
                  architecture: sysInfo.architecture,
                }
              : undefined,
            memory: memory
              ? {
                  totalMb: memory.totalMb,
                  usedMb: memory.usedMb,
                  usedPercent:
                    memory.totalMb > 0
                      ? Math.round((memory.usedMb / memory.totalMb) * 100)
                      : 0,
                }
              : undefined,
            disk:
              totalDiskGb > 0
                ? {
                    totalGb: Math.round(totalDiskGb * 10) / 10,
                    usedGb: Math.round(usedDiskGb * 10) / 10,
                    usedPercent: Math.round((usedDiskGb / totalDiskGb) * 100),
                  }
                : undefined,
            latencyMs: result.totalLatencyMs,
          };
        } catch (err) {
          return {
            ...base,
            status: 'error' as const,
            error: err instanceof Error ? err.message : 'Failed to fetch data',
          };
        }
      });

      const settled = await Promise.allSettled(promises);
      const summaries: FleetServerSummary[] = settled
        .filter((r): r is PromiseFulfilledResult<FleetServerSummary> => r.status === 'fulfilled')
        .map((r) => r.value);

      const connected = summaries.filter((s) => s.status === 'connected').length;
      let totalMemoryMb = 0;
      let usedMemoryMb = 0;
      let totalDiskGb = 0;
      let usedDiskGb = 0;

      for (const s of summaries) {
        if (s.memory) { totalMemoryMb += s.memory.totalMb; usedMemoryMb += s.memory.usedMb; }
        if (s.disk) { totalDiskGb += s.disk.totalGb; usedDiskGb += s.disk.usedGb; }
      }

      return ok({
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
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Failed to fetch fleet overview');
    }
  }

  // ── Set tags ─────────────────────────────────────────

  async setTags(
    serverId: string,
    tags: string[],
  ): Promise<ServiceResult<Record<string, unknown>>> {
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
      return fail('tags must be an array of strings', 400);
    }

    const server = await this.configStore.getServer(serverId);
    if (!server) {
      return fail('Server not found', 404);
    }

    const updated = await this.configStore.updateServer(serverId, { tags } as unknown as Record<string, unknown>);
    return ok(updated as unknown as Record<string, unknown>);
  }
}
