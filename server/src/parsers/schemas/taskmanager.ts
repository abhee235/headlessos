// M7.1: Task Manager Zod Schemas
// Schemas for process list, CPU/memory/disk/network performance data
// @see docs/phases/phase-7.md

import { z } from 'zod';

// ── Process List (ps aux) ───────────────────────────────

export const ProcessSchema = z.object({
  pid: z.number().int().nonnegative(),
  user: z.string(),
  cpu: z.number().nonnegative().describe('CPU usage percentage'),
  memory: z.number().nonnegative().describe('Memory usage percentage'),
  vsz: z.number().nonnegative().describe('Virtual memory size in KB'),
  rss: z.number().nonnegative().describe('Resident set size in KB'),
  stat: z.string().describe('Process state (R/S/D/Z/T)'),
  started: z.string().describe('Start time or date'),
  time: z.string().describe('Cumulative CPU time'),
  command: z.string().describe('Full command line'),
});

export type ProcessParsed = z.infer<typeof ProcessSchema>;

export const ProcessListSchema = z.array(ProcessSchema);

export type ProcessListParsed = z.infer<typeof ProcessListSchema>;

// ── CPU Stats (/proc/stat + top) ────────────────────────

export const CpuStatsSchema = z.object({
  overallPercent: z.number().min(0).max(100).describe('Overall CPU usage %'),
  coreCount: z.number().int().positive(),
  cores: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      percent: z.number().min(0).max(100),
    }),
  ),
  loadAverage: z.object({
    one: z.number().nonnegative(),
    five: z.number().nonnegative(),
    fifteen: z.number().nonnegative(),
  }),
  processes: z.object({
    total: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    sleeping: z.number().int().nonnegative(),
    stopped: z.number().int().nonnegative(),
    zombie: z.number().int().nonnegative(),
  }),
  uptime: z.string(),
});

export type CpuStatsParsed = z.infer<typeof CpuStatsSchema>;

// ── CPU counters (/proc/stat) — EX8.6 ──────────────────
// id -1 is the aggregate "cpu" line; busy/total are cumulative jiffies.

export const ProcStatSchema = z.array(
  z.object({
    id: z.number().int().min(-1),
    busy: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }),
);

export type ProcStatParsed = z.infer<typeof ProcStatSchema>;

// ── Network I/O (/proc/net/dev) ─────────────────────────

export const NetworkIoEntrySchema = z.object({
  interface: z.string(),
  rxBytes: z.number().nonnegative(),
  txBytes: z.number().nonnegative(),
  rxPackets: z.number().nonnegative(),
  txPackets: z.number().nonnegative(),
});

export const NetworkIoSchema = z.array(NetworkIoEntrySchema);

export type NetworkIoParsed = z.infer<typeof NetworkIoSchema>;

// ── Disk I/O (/proc/diskstats or iostat) ────────────────

export const DiskIoEntrySchema = z.object({
  device: z.string(),
  readBytes: z.number().nonnegative(),
  writeBytes: z.number().nonnegative(),
});

export const DiskIoSchema = z.array(DiskIoEntrySchema);

export type DiskIoParsed = z.infer<typeof DiskIoSchema>;

// ── Full Task Manager Snapshot ──────────────────────────

export const TaskManagerSnapshotSchema = z.object({
  processes: ProcessListSchema,
  cpu: CpuStatsSchema,
  networkIo: NetworkIoSchema,
  diskIo: DiskIoSchema,
});

export type TaskManagerSnapshotParsed = z.infer<typeof TaskManagerSnapshotSchema>;

// ── EX8.9: Users page (getent passwd + who / tty processes) ──

export const InitSystemSchema = z.enum(['systemd', 'sysv', 'none']);

export type InitSystem = z.infer<typeof InitSystemSchema>;

export const TaskManagerAccountSchema = z.object({
  name: z.string().min(1),
  uid: z.number().int().nonnegative(),
  shell: z.string(),
  kind: z.enum(['admin', 'standard', 'service']),
});

export const TaskManagerSessionSchema = z.object({
  user: z.string().min(1),
  tty: z.string().min(1),
  from: z.string().nullable(),
  /** ISO timestamp; derived from the oldest process on the tty */
  loginAt: z.string().nullable(),
});

export const TaskManagerUsersSchema = z.object({
  accounts: z.array(TaskManagerAccountSchema),
  sessions: z.array(TaskManagerSessionSchema),
  currentUser: z.string(),
});

export type TaskManagerAccount = z.infer<typeof TaskManagerAccountSchema>;
export type TaskManagerSession = z.infer<typeof TaskManagerSessionSchema>;
export type TaskManagerUsers = z.infer<typeof TaskManagerUsersSchema>;

// ── EX8.9: App history (running processes since boot) ──

export const AppUsageSchema = z.object({
  name: z.string().min(1),
  cpuSeconds: z.number().nonnegative(),
  rssKb: z.number().nonnegative(),
  instances: z.number().int().positive(),
  readBytes: z.number().nonnegative().nullable(),
  writeBytes: z.number().nonnegative().nullable(),
  users: z.array(z.string()),
});

export const AppHistorySchema = z.object({
  since: z.string(),
  ioReadable: z.boolean(),
  apps: z.array(AppUsageSchema),
});

export type AppUsage = z.infer<typeof AppUsageSchema>;
export type AppHistory = z.infer<typeof AppHistorySchema>;

// ── EX8.9: Startup apps ─────────────────────────────────

export const StartupItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  command: z.string().nullable(),
  source: z.enum(['systemd', 'sysv', 'cron']),
  enabled: z.boolean(),
  delayMs: z.number().nonnegative().nullable(),
  impact: z.enum(['high', 'medium', 'low']).nullable(),
  toggleable: z.boolean(),
});

export const BootTimesSchema = z.object({
  totalMs: z.number().nonnegative(),
  firmwareMs: z.number().nonnegative().nullable(),
  loaderMs: z.number().nonnegative().nullable(),
  kernelMs: z.number().nonnegative().nullable(),
  userspaceMs: z.number().nonnegative().nullable(),
});

export const StartupSchema = z.object({
  init: InitSystemSchema,
  pid1: z.string(),
  bootedAt: z.string(),
  boot: BootTimesSchema.nullable(),
  items: z.array(StartupItemSchema),
});

export type StartupItem = z.infer<typeof StartupItemSchema>;
export type BootTimes = z.infer<typeof BootTimesSchema>;
export type StartupData = z.infer<typeof StartupSchema>;
