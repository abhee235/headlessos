// M12.8: TaskManagerService — domain layer for process/performance data
// @see docs/phases/phase-12.md
//
// Owns: ExecutionPlan construction, orchestrator calls, kill validation.
// Routes (routes/taskmanager.ts) only translate HTTP ↔ ServiceResult.

import { DomainService, ok, fail, type ServiceResult } from './base.js';
import {
  ProcessListSchema,
  CpuStatsSchema,
  NetworkIoSchema,
  DiskIoSchema,
} from '../../parsers/schemas/taskmanager.js';
import { MemoryInfoSchema as SystemMemorySchema } from '../../parsers/schemas/system.js';
import type {
  ProcessListParsed,
  CpuStatsParsed,
  NetworkIoParsed,
  DiskIoParsed,
} from '../../parsers/schemas/taskmanager.js';
import type { MemoryInfoParsed } from '../../parsers/schemas/system.js';
import type { ExecutionPlan } from '../../orchestrator/orchestrator.js';
import type { StepMeta } from './system-service.js';

export interface TaskManagerSnapshot {
  processes: ProcessListParsed;
  cpu: CpuStatsParsed;
  memory: MemoryInfoParsed;
  networkIo: NetworkIoParsed;
  diskIo: DiskIoParsed;
}

export interface TaskManagerResult {
  data: TaskManagerSnapshot;
  steps: StepMeta[];
  totalLatencyMs: number;
}

export class TaskManagerService extends DomainService {
  protected async _construct(): Promise<void> {}

  // ── Full snapshot ────────────────────────────────────

  async getSnapshot(serverId: string): Promise<ServiceResult<TaskManagerResult>> {
    try {
      this.requireConnected(serverId);

      const plan: ExecutionPlan = {
        steps: [
          { id: 'processes', command: 'ps aux', schema: ProcessListSchema, timeout: 10_000 },
          {
            id: 'cpu',
            command: 'top -bn1 -1 | head -20 && cat /proc/loadavg && nproc',
            schema: CpuStatsSchema,
            timeout: 10_000,
          },
          { id: 'memory', command: 'free -m', schema: SystemMemorySchema, timeout: 10_000 },
          { id: 'network-io', command: 'cat /proc/net/dev', schema: NetworkIoSchema, timeout: 10_000 },
          { id: 'disk-io', command: 'cat /proc/diskstats', schema: DiskIoSchema, timeout: 10_000 },
        ],
        parallel: true,
      };

      const result = await this.orchestrator.execute(
        serverId,
        plan,
        (results) => ({
          processes: (results.get('processes') ?? []) as ProcessListParsed,
          cpu: (results.get('cpu') ?? {
            overallPercent: 0, coreCount: 1, cores: [],
            loadAverage: { one: 0, five: 0, fifteen: 0 },
            processes: { total: 0, running: 0, sleeping: 0, stopped: 0, zombie: 0 },
            uptime: 'unknown',
          }) as CpuStatsParsed,
          memory: (results.get('memory') ?? {
            totalMb: 0, usedMb: 0, freeMb: 0,
            availableMb: 0, swapTotalMb: 0, swapUsedMb: 0,
          }) as MemoryInfoParsed,
          networkIo: (results.get('network-io') ?? []) as NetworkIoParsed,
          diskIo: (results.get('disk-io') ?? []) as DiskIoParsed,
        }),
      );

      return ok({
        data: result.data as TaskManagerSnapshot,
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
      return fail(e.message ?? 'Failed to fetch task manager data', e.statusCode ?? 500);
    }
  }

  // ── Kill process ─────────────────────────────────────

  async killProcess(
    serverId: string,
    pid: string | number,
    signal: number,
  ): Promise<ServiceResult<void>> {
    try {
      this.requireConnected(serverId);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }

    const pidNum = parseInt(String(pid), 10);
    if (isNaN(pidNum) || pidNum <= 0 || !Number.isInteger(pidNum)) {
      return fail('Invalid PID', 400);
    }
    // Restrict to SIGTERM (15) and SIGKILL (9) for safety
    if (signal !== 9 && signal !== 15) {
      return fail('Signal must be 9 (SIGKILL) or 15 (SIGTERM)', 400);
    }

    const result = await this.exec(serverId, `kill -${signal} ${pidNum}`, 5_000);
    if (result.exitCode !== 0) {
      return fail(
        result.stderr.trim() || `kill failed with exit code ${result.exitCode}`,
        500,
      );
    }
    return ok(undefined);
  }
}
