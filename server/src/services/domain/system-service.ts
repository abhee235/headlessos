// M12.8: SystemService — domain layer for system dashboard queries
// @see docs/phases/phase-12.md
//
// Owns: ExecutionPlan construction, orchestrator calls, result assembly.
// Routes (routes/system.ts) only translate HTTP ↔ ServiceResult.

import { DomainService, ok, fail, type ServiceResult } from './base.js';
import {
  SystemInfoSchema,
  DiskUsageSchema,
  MemoryInfoSchema,
  NetworkInterfacesSchema,
  SystemDashboardSchema,
} from '../../parsers/schemas/system.js';
import type {
  SystemInfoParsed,
  DiskUsageParsed,
  MemoryInfoParsed,
  NetworkInterfacesParsed,
  SystemDashboardParsed,
} from '../../parsers/schemas/system.js';
import type { ExecutionPlan } from '../../orchestrator/orchestrator.js';

export interface StepMeta {
  stepId: string;
  parsedBy: string | undefined;
  latencyMs: number;
  success: boolean;
}

export interface DashboardResult {
  data: SystemDashboardParsed;
  steps: StepMeta[];
  totalLatencyMs: number;
}

export class SystemService extends DomainService {
  protected async _construct(): Promise<void> {}

  // ── Full dashboard ───────────────────────────────────────

  async getDashboard(serverId: string): Promise<ServiceResult<DashboardResult>> {
    try {
      this.requireConnected(serverId);

      const plan: ExecutionPlan = {
        steps: [
          {
            id: 'system-info',
            command: 'uname -a && uptime -p && cat /etc/os-release',
            schema: SystemInfoSchema,
            fallbackCommands: ['uname -a && uptime && cat /etc/os-release'],
            timeout: 10_000,
          },
          { id: 'disk', command: 'df -h', schema: DiskUsageSchema, timeout: 10_000 },
          { id: 'memory', command: 'free -m', schema: MemoryInfoSchema, timeout: 10_000 },
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

      const result = await this.orchestrator.execute<SystemDashboardParsed>(
        serverId,
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
            totalMb: 0, usedMb: 0, freeMb: 0,
            availableMb: 0, swapTotalMb: 0, swapUsedMb: 0,
          }) as MemoryInfoParsed;
          const network = (results.get('network') ?? []) as NetworkInterfacesParsed;
          return SystemDashboardSchema.parse({ system, disks, memory, network });
        },
      );

      return ok({
        data: result.data,
        steps: result.steps.map((s) => ({
          stepId: s.stepId,
          parsedBy: s.parsedBy,
          latencyMs: s.latencyMs,
          success: s.success,
        })),
        totalLatencyMs: result.totalLatencyMs,
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to fetch system data', e.statusCode ?? 500);
    }
  }

  // ── Disk only ────────────────────────────────────────────

  async getDisk(serverId: string): Promise<ServiceResult<{ data: DiskUsageParsed; parsedBy: string; latencyMs: number }>> {
    try {
      this.requireConnected(serverId);

      const plan: ExecutionPlan = {
        steps: [{ id: 'disk', command: 'df -h', schema: DiskUsageSchema, timeout: 10_000 }],
      };

      const result = await this.orchestrator.execute<DiskUsageParsed>(
        serverId, plan, (results) => results.get('disk') as DiskUsageParsed,
      );

      return ok({
        data: result.data,
        parsedBy: result.steps[0]?.parsedBy ?? 'unknown',
        latencyMs: result.totalLatencyMs,
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to fetch disk data', e.statusCode ?? 500);
    }
  }

  // ── Memory only ──────────────────────────────────────────

  async getMemory(serverId: string): Promise<ServiceResult<{ data: MemoryInfoParsed; parsedBy: string; latencyMs: number }>> {
    try {
      this.requireConnected(serverId);

      const plan: ExecutionPlan = {
        steps: [{ id: 'memory', command: 'free -m', schema: MemoryInfoSchema, timeout: 10_000 }],
      };

      const result = await this.orchestrator.execute<MemoryInfoParsed>(
        serverId, plan, (results) => results.get('memory') as MemoryInfoParsed,
      );

      return ok({
        data: result.data,
        parsedBy: result.steps[0]?.parsedBy ?? 'unknown',
        latencyMs: result.totalLatencyMs,
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Failed to fetch memory data', e.statusCode ?? 500);
    }
  }
}
