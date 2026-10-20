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
  ProcStatSchema,
} from '../../parsers/schemas/taskmanager.js';
import { computeCpuUsage, type CpuUsage } from '../../parsers/deterministic/proc-stat.js';
import { MemoryInfoSchema as SystemMemorySchema } from '../../parsers/schemas/system.js';
import type {
  ProcessListParsed,
  CpuStatsParsed,
  NetworkIoParsed,
  DiskIoParsed,
  ProcStatParsed,
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

/** EX8.6: extra fields for the Task Manager process detail card */
export interface ProcessDetail {
  pid: number;
  threads: number | null;
  /** nice value, -20 (highest priority) … 19 (lowest) */
  nice: number | null;
  /** full start timestamp as printed by `ps -o lstart` */
  startedAt: string | null;
}

/**
 * Signals the Task Manager may send. Numbers are the Linux x86/ARM values,
 * which the `kill -N pid` allowlist pattern requires.
 */
export const ALLOWED_SIGNALS: Record<number, string> = {
  9: 'SIGKILL',
  15: 'SIGTERM',
  18: 'SIGCONT', // resume a suspended process
  19: 'SIGSTOP', // suspend
};

/** Parse `ps -o nlwp=,ni=,lstart= -p PID` → "  2  10 Tue Oct 20 16:28:01 2026" */
export function parseProcessDetail(pid: number, stdout: string): ProcessDetail | null {
  const line = stdout.trim().split('\n')[0]?.trim();
  if (!line) return null;
  const [nlwp, ni, ...rest] = line.split(/\s+/);
  const threads = Number.parseInt(nlwp ?? '', 10);
  const nice = Number.parseInt(ni ?? '', 10); // "-" for some kernel threads
  return {
    pid,
    threads: Number.isFinite(threads) ? threads : null,
    nice: Number.isFinite(nice) ? nice : null,
    startedAt: rest.length > 0 ? rest.join(' ') : null,
  };
}

export interface TaskManagerResult {
  data: TaskManagerSnapshot;
  steps: StepMeta[];
  totalLatencyMs: number;
}

export class TaskManagerService extends DomainService {
  /** EX8.6: previous /proc/stat sample + last computed usage, per server */
  private cpuSamples = new Map<string, { stat: ProcStatParsed; usage: CpuUsage | null }>();

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
          // EX8.6: CPU % from counter deltas (top's one frame averages since boot)
          { id: 'proc-stat', command: 'cat /proc/stat', schema: ProcStatSchema, timeout: 10_000 },
        ],
        parallel: true,
      };

      const result = await this.orchestrator.execute(
        serverId,
        plan,
        (results) => ({
          processes: (results.get('processes') ?? []) as ProcessListParsed,
          cpu: this.withProcStat(
            serverId,
            (results.get('cpu') ?? {
              overallPercent: 0, coreCount: 1, cores: [],
              loadAverage: { one: 0, five: 0, fifteen: 0 },
              processes: { total: 0, running: 0, sleeping: 0, stopped: 0, zombie: 0 },
              uptime: 'unknown',
            }) as CpuStatsParsed,
            results.get('proc-stat') as ProcStatParsed | undefined,
          ),
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

  /**
   * EX8.6: Replace top's CPU percentages with /proc/stat deltas since this
   * server's previous sample (every core, accurate). Two polls inside one clock
   * tick reuse the last computed value; no sample keeps top's numbers.
   */
  private withProcStat(serverId: string, cpu: CpuStatsParsed, stat: ProcStatParsed | undefined): CpuStatsParsed {
    if (!stat || stat.length === 0) return cpu;
    const prev = this.cpuSamples.get(serverId);
    const usage = computeCpuUsage(prev?.stat, stat) ?? prev?.usage ?? null;
    this.cpuSamples.set(serverId, { stat, usage });
    if (!usage) return cpu;
    return {
      ...cpu,
      overallPercent: usage.overallPercent,
      cores: usage.cores,
      coreCount: Math.max(cpu.coreCount, usage.cores.length),
    };
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
    // Restricted for safety: terminate, kill, suspend, resume
    if (!(signal in ALLOWED_SIGNALS)) {
      return fail('Signal must be 9 (SIGKILL), 15 (SIGTERM), 19 (SIGSTOP) or 18 (SIGCONT)', 400);
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

  // ── Process detail (EX8.6) ───────────────────────────

  async getProcessDetail(serverId: string, pid: string | number): Promise<ServiceResult<ProcessDetail>> {
    try {
      this.requireConnected(serverId);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }

    const pidNum = parseInt(String(pid), 10);
    if (isNaN(pidNum) || pidNum <= 0 || !Number.isInteger(pidNum) || String(pidNum) !== String(pid).trim()) {
      return fail('Invalid PID', 400);
    }

    const result = await this.exec(serverId, `ps -o nlwp=,ni=,lstart= -p ${pidNum}`, 5_000);
    // ps exits 1 when the PID no longer exists
    const detail = result.exitCode === 0 ? parseProcessDetail(pidNum, result.stdout) : null;
    if (!detail) return fail(`Process ${pidNum} not found`, 404);
    return ok(detail);
  }
}
