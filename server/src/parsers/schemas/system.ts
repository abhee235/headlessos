// M2.1: System Dashboard Zod Schemas
// @see docs/phases/phase-2.md

import { z } from 'zod';

// ── System Info (uname -a + uptime + /etc/os-release) ───

export const SystemInfoSchema = z.object({
  hostname: z.string(),
  uptime: z.string(),
  os: z.string(),
  kernel: z.string(),
  architecture: z.string(),
});

export type SystemInfoParsed = z.infer<typeof SystemInfoSchema>;

// ── Disk Usage (df -h) ──────────────────────────────────

export const DiskUsageEntrySchema = z.object({
  filesystem: z.string(),
  size: z.string(),
  used: z.string(),
  available: z.string(),
  usePercent: z.number().min(0).max(100),
  mountPoint: z.string(),
});

export const DiskUsageSchema = z.array(DiskUsageEntrySchema);

export type DiskUsageParsed = z.infer<typeof DiskUsageSchema>;

// ── Memory Info (free -m) ───────────────────────────────

export const MemoryInfoSchema = z.object({
  totalMb: z.number().nonnegative(),
  usedMb: z.number().nonnegative(),
  freeMb: z.number().nonnegative(),
  availableMb: z.number().nonnegative(),
  swapTotalMb: z.number().nonnegative(),
  swapUsedMb: z.number().nonnegative(),
});

export type MemoryInfoParsed = z.infer<typeof MemoryInfoSchema>;

// ── Network Interfaces (ip -brief addr) ─────────────────

export const NetworkInterfaceSchema = z.object({
  name: z.string(),
  status: z.enum(['UP', 'DOWN', 'UNKNOWN']),
  ipAddresses: z.array(z.string()),
});

export const NetworkInterfacesSchema = z.array(NetworkInterfaceSchema);

export type NetworkInterfacesParsed = z.infer<typeof NetworkInterfacesSchema>;

// ── Full System Dashboard ───────────────────────────────

export const SystemDashboardSchema = z.object({
  system: SystemInfoSchema,
  disks: DiskUsageSchema,
  memory: MemoryInfoSchema,
  network: NetworkInterfacesSchema,
});

export type SystemDashboardParsed = z.infer<typeof SystemDashboardSchema>;
