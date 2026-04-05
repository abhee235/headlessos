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
