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
import { ProcStatSchema, type ProcStatParsed } from '../../parsers/schemas/taskmanager.js';
import { computeCpuUsage } from '../../parsers/deterministic/proc-stat.js';
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
  /** EX8.29: average CPU since this server's previous fleet sample; null on the first one */
  cpu?: {
    usedPercent: number | null;
    cores: number;
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
    /** EX8.29: mean CPU of the connected servers that have a reading; null when none do */
    avgCpuPercent: number | null;
  };
  fetchedAt: string;
}

export class FleetService extends DomainService {
  private configStore!: ConfigStore;
  /** EX8.29: each server's previous /proc/stat sample, for CPU between refreshes */
  private cpuSamples = new Map<string, ProcStatParsed>();

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
            { id: 'proc-stat', command: 'cat /proc/stat', schema: ProcStatSchema, timeout: 8_000 },
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
              procStat: results.get('proc-stat') as ProcStatParsed | undefined,
            }),
          );

          const { sysInfo, memory, diskArr, procStat } = result.data as {
            sysInfo?: SystemInfoParsed;
            memory?: MemoryInfoParsed;
            diskArr?: DiskUsageParsed;
            procStat?: ProcStatParsed;
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
            cpu: this.cpuFrom(srv.id, procStat),
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

      const cpuReadings: number[] = [];
      for (const s of summaries) {
        if (s.memory) { totalMemoryMb += s.memory.totalMb; usedMemoryMb += s.memory.usedMb; }
        if (s.disk) { totalDiskGb += s.disk.totalGb; usedDiskGb += s.disk.usedGb; }
        if (s.cpu?.usedPercent != null) cpuReadings.push(s.cpu.usedPercent);
      }
      const avgCpuPercent = cpuReadings.length
        ? Math.round((cpuReadings.reduce((a, b) => a + b, 0) / cpuReadings.length) * 10) / 10
        : null;

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
          avgCpuPercent,
        },
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Failed to fetch fleet overview');
    }
  }

  /**
   * EX8.29: CPU since this server's previous sample (counter deltas, as in the Task
   * Manager). The first sample has nothing to compare with, so its CPU is null rather
   * than the since-boot average; a read inside the same clock tick also gives null.
   */
  private cpuFrom(serverId: string, stat: ProcStatParsed | undefined): FleetServerSummary['cpu'] {
    if (!stat || stat.length === 0) return undefined;
    const prev = this.cpuSamples.get(serverId);
    this.cpuSamples.set(serverId, stat);
    const cores = stat.filter((c) => c.id >= 0).length || 1;
    const usage = prev ? computeCpuUsage(prev, stat) : null;
    return { usedPercent: usage ? usage.overallPercent : null, cores };
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
