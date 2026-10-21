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
// EX8.9: Users, App history, Startup apps
import {
  TaskManagerUsersSchema,
  AppHistorySchema,
  StartupSchema,
  type TaskManagerUsers,
  type AppHistory,
  type StartupData,
  type StartupItem,
  type InitSystem,
} from '../../parsers/schemas/taskmanager.js';
import { parseEtcPasswd } from '../../parsers/deterministic/etc-passwd.js';
import { parseWho } from '../../parsers/deterministic/who.js';
import { toAccounts, parseTtyProcessRows, buildSessions } from '../../parsers/deterministic/user-sessions.js';
import {
  parseAppProcessRows,
  parseProcIo,
  aggregateApps,
  isIoReadable,
  parseBootTime,
} from '../../parsers/deterministic/app-usage.js';
import { parseListUnitFiles, parseSystemctlShow } from '../../parsers/deterministic/systemctl.js';
import { parseSystemdAnalyzeTime, parseSystemdBlame } from '../../parsers/deterministic/systemd-analyze.js';
import { parseRcLinks, parseShortDescriptions, parseInitDList } from '../../parsers/deterministic/sysv-init.js';
import {
  CRON_ID_PREFIX,
  isStartupUnitFile,
  parseRebootCron,
  buildCronItems,
  buildSystemdStartupItems,
  buildSysvStartupItems,
  sortStartupItems,
} from '../../parsers/deterministic/startup-items.js';
import { validateServiceName } from '../../security/validators.js';
import {
  PROBE,
  buildUnitInfoCommand,
  buildSysvCommand,
  buildSystemctlEnableCommand,
} from './init-system.js';

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

  // ── EX8.9: Users ─────────────────────────────────────

  /**
   * Accounts from /etc/passwd (read over SFTP — commands containing
   * `passwd` are on the blocklist, so `getent passwd` cannot run), sessions
   * from `who`, or from processes with a terminal when utmp is empty.
   */
  async getUsers(serverId: string): Promise<ServiceResult<TaskManagerUsers>> {
    const notConnected = this.checkConnected(serverId);
    if (notConnected) return notConnected;

    const [passwd, who, tty, me] = await Promise.all([
      this.readRemoteText(serverId, '/etc/passwd'),
      this.execSafe(serverId, PROBE.who, 10_000),
      this.execSafe(serverId, PROBE.ttyProcesses, 10_000),
      this.execSafe(serverId, PROBE.currentUser, 5_000),
    ]);

    return ok(TaskManagerUsersSchema.parse({
      accounts: toAccounts(parseEtcPasswd(passwd)),
      sessions: buildSessions(
        who.exitCode === 0 ? parseWho(who.stdout) : [],
        parseTtyProcessRows(tty.stdout),
        Date.now(),
      ),
      currentUser: me.exitCode === 0 ? me.stdout.trim() : '',
    }));
  }

  // ── EX8.9: App history ───────────────────────────────

  async getAppHistory(serverId: string): Promise<ServiceResult<AppHistory>> {
    const notConnected = this.checkConnected(serverId);
    if (notConnected) return notConnected;

    const [ps, io, stat, me] = await Promise.all([
      this.execSafe(serverId, PROBE.appProcesses, 10_000),
      // grep exits 2 when some io files are unreadable; its stdout is still good
      this.execSafe(serverId, PROBE.procIo, 10_000),
      this.execSafe(serverId, PROBE.procStat, 10_000),
      this.execSafe(serverId, PROBE.currentUser, 5_000),
    ]);

    const sshUser = me.exitCode === 0 ? me.stdout.trim() : '';
    const rows = parseAppProcessRows(ps.stdout);
    const ioMap = parseProcIo(io.stdout);

    return ok(AppHistorySchema.parse({
      since: parseBootTime(stat.stdout) ?? new Date().toISOString(),
      ioReadable: isIoReadable(rows, ioMap, sshUser),
      apps: aggregateApps(rows, ioMap, sshUser),
    }));
  }

  // ── EX8.9: Startup apps ──────────────────────────────

  async getStartup(serverId: string): Promise<ServiceResult<StartupData>> {
    const notConnected = this.checkConnected(serverId);
    if (notConnected) return notConnected;

    const [pid1, booted, stat, cronSystem, cronUser] = await Promise.all([
      this.execSafe(serverId, PROBE.pid1, 5_000),
      this.execSafe(serverId, PROBE.systemdBooted, 5_000),
      this.execSafe(serverId, PROBE.procStat, 10_000),
      this.execSafe(serverId, PROBE.cronSystemSpecial, 10_000),
      // exits 1 with "no crontab for <user>", 127 without cron: both → none
      this.execSafe(serverId, PROBE.cronUser, 10_000),
    ]);

    const pid1Comm = pid1.exitCode === 0 ? pid1.stdout.trim() : '';
    const cronItems = buildCronItems([
      ...parseRebootCron(cronSystem.stdout, true),
      ...(cronUser.exitCode === 0 ? parseRebootCron(cronUser.stdout, false) : []),
    ]);

    let init: InitSystem;
    let boot: StartupData['boot'] = null;
    let items: StartupItem[];

    if (booted.exitCode === 0 || pid1Comm === 'systemd') {
      init = 'systemd';
      const [files, time, blame] = await Promise.all([
        this.execSafe(serverId, PROBE.unitFiles, 10_000),
        this.execSafe(serverId, PROBE.analyzeTime, 10_000),
        this.execSafe(serverId, PROBE.analyzeBlame, 10_000),
      ]);
      const unitFiles = parseListUnitFiles(files.stdout);
      const infoCmd = buildUnitInfoCommand(unitFiles.filter(isStartupUnitFile).map((u) => u.unit));
      const info = infoCmd ? await this.execSafe(serverId, infoCmd, 15_000) : null;
      boot = time.exitCode === 0 ? parseSystemdAnalyzeTime(time.stdout) : null;
      items = buildSystemdStartupItems(
        unitFiles,
        parseSystemdBlame(blame.stdout),
        info ? parseSystemctlShow(info.stdout) : [],
      );
    } else {
      const [initD, rc2, desc] = await Promise.all([
        this.execSafe(serverId, PROBE.initD, 5_000),
        this.execSafe(serverId, PROBE.rc2d, 5_000),
        this.execSafe(serverId, PROBE.initDescriptions, 10_000),
      ]);
      const scripts = initD.exitCode === 0 ? parseInitDList(initD.stdout) : [];
      init = scripts.length > 0 ? 'sysv' : 'none';
      items = init === 'sysv'
        ? buildSysvStartupItems(parseRcLinks(rc2.stdout), parseShortDescriptions(desc.stdout), scripts)
        : [];
    }

    return ok(StartupSchema.parse({
      init,
      pid1: pid1Comm,
      bootedAt: parseBootTime(stat.stdout) ?? new Date().toISOString(),
      boot,
      items: sortStartupItems([...items, ...cronItems]),
    }));
  }

  /**
   * Enable or disable a startup item. `x.service` ids → `sudo systemctl
   * enable|disable`; other ids are SysV scripts → `sudo update-rc.d`.
   * cron `@reboot` items are read-only.
   */
  async setStartupItem(serverId: string, item: string, action: string): Promise<ServiceResult<void>> {
    const notConnected = this.checkConnected(serverId);
    if (notConnected) return notConnected;

    if (action !== 'enable' && action !== 'disable') {
      return fail('Action must be enable or disable', 400);
    }
    if (typeof item === 'string' && item.startsWith(CRON_ID_PREFIX)) {
      return fail('@reboot cron entries are read-only; edit the crontab to change them', 400);
    }
    if (!validateServiceName(item)) {
      return fail('Invalid startup item', 400);
    }

    const command = item.endsWith('.service')
      ? buildSystemctlEnableCommand(item, action)
      : buildSysvCommand(item, action);
    const result = await this.execSafe(serverId, command, 20_000);
    if (result.exitCode !== 0) {
      return fail(result.stderr.trim() || `${action} failed with exit code ${result.exitCode}`, 500);
    }
    return ok(undefined);
  }

  // ── helpers ──────────────────────────────────────────

  private checkConnected(serverId: string): ServiceResult<never> | null {
    try {
      this.requireConnected(serverId);
      return null;
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }
  }

  /** Small world-readable file over SFTP; '' on any error or after 10 s. */
  private async readRemoteText(serverId: string, path: string): Promise<string> {
    try {
      const sftp = await this.ssh.getSftp(serverId);
      return await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SFTP read timed out')), 10_000);
        sftp.readFile(path, (err, buf) => {
          clearTimeout(timer);
          if (err) reject(err);
          else resolve(buf.toString('utf-8'));
        });
      });
    } catch {
      return '';
    }
  }
}
