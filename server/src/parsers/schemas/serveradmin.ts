// M7.2: Server Admin Zod Schemas
// @see docs/phases/phase-7.md

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK
// ═══════════════════════════════════════════════════════════════════════════

// ── Listening Ports (ss -tlnp) ──────────────────────────

export const ListeningPortSchema = z.object({
  protocol: z.enum(['tcp', 'udp']),
  localAddress: z.string(),
  localPort: z.number().int().min(0).max(65535),
  process: z.string(),
  pid: z.number().int().nonnegative().optional(),
});

export type ListeningPort = z.infer<typeof ListeningPortSchema>;

// ── Routes (ip route show) ──────────────────────────────

export const RouteSchema = z.object({
  destination: z.string(),
  gateway: z.string().optional(),
  interface: z.string(),
  metric: z.number().int().nonnegative().optional(),
  scope: z.string().optional(),
  protocol: z.string().optional(),
});

export type Route = z.infer<typeof RouteSchema>;

// ── DNS Config (cat /etc/resolv.conf) ───────────────────

export const DNSConfigSchema = z.object({
  nameservers: z.array(z.string()),
  searchDomains: z.array(z.string()),
});

export type DNSConfig = z.infer<typeof DNSConfigSchema>;

// ── Active Connections (ss -tunap) ──────────────────────

export const NetworkConnectionSchema = z.object({
  protocol: z.enum(['tcp', 'udp']),
  localAddress: z.string(),
  localPort: z.number().int().min(0).max(65535),
  remoteAddress: z.string(),
  remotePort: z.number().int().min(0).max(65535),
  state: z.string(),
  process: z.string().optional(),
  pid: z.number().int().nonnegative().optional(),
});

export type NetworkConnection = z.infer<typeof NetworkConnectionSchema>;

// ── Combined Network Info ───────────────────────────────

export const NetworkInfoSchema = z.object({
  ports: z.array(ListeningPortSchema),
  routes: z.array(RouteSchema),
  dns: DNSConfigSchema,
  connections: z.array(NetworkConnectionSchema),
});

export type NetworkInfo = z.infer<typeof NetworkInfoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// FIREWALL
// ═══════════════════════════════════════════════════════════════════════════

export const UFWRuleSchema = z.object({
  number: z.number().int().positive(),
  to: z.string(),
  action: z.string(),
  from: z.string(),
});

export type UFWRule = z.infer<typeof UFWRuleSchema>;

export const FirewallStatusSchema = z.object({
  available: z.boolean(),
  active: z.boolean(),
  rules: z.array(UFWRuleSchema),
  message: z.string().optional(),
});

export type FirewallStatus = z.infer<typeof FirewallStatusSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY
// ═══════════════════════════════════════════════════════════════════════════

// ── System Users (/etc/passwd) ──────────────────────────

export const SystemUserSchema = z.object({
  username: z.string(),
  uid: z.number().int().nonnegative(),
  gid: z.number().int().nonnegative(),
  home: z.string(),
  shell: z.string(),
  description: z.string().optional(),
});

export type SystemUser = z.infer<typeof SystemUserSchema>;

// ── Active Sessions (who) ───────────────────────────────

export const LoginSessionSchema = z.object({
  user: z.string(),
  terminal: z.string(),
  loginTime: z.string(),
  remoteHost: z.string().optional(),
});

export type LoginSession = z.infer<typeof LoginSessionSchema>;

// ── Login History (last -n 30) ──────────────────────────

export const LoginHistorySchema = z.object({
  user: z.string(),
  terminal: z.string(),
  remoteHost: z.string(),
  loginTime: z.string(),
  logoutTime: z.string(),
  duration: z.string().optional(),
});

export type LoginHistory = z.infer<typeof LoginHistorySchema>;

// ── SSH Config (sshd_config) ────────────────────────────

export const SSHConfigSchema = z.object({
  port: z.string().default('22'),
  permitRootLogin: z.string().default('prohibit-password'),
  passwordAuthentication: z.string().default('yes'),
  pubkeyAuthentication: z.string().default('yes'),
  maxAuthTries: z.string().default('6'),
  x11Forwarding: z.string().default('no'),
});

export type SSHConfig = z.infer<typeof SSHConfigSchema>;

// ── Fail2ban Status ─────────────────────────────────────

export const Fail2banStatusSchema = z.object({
  available: z.boolean(),
  jails: z.array(z.string()).optional(),
  message: z.string().optional(),
});

export type Fail2banStatus = z.infer<typeof Fail2banStatusSchema>;

// ── Combined Security Info ──────────────────────────────

export const SecurityInfoSchema = z.object({
  users: z.array(SystemUserSchema),
  sessions: z.array(LoginSessionSchema),
  loginHistory: z.array(LoginHistorySchema),
  sshConfig: SSHConfigSchema,
  fail2ban: Fail2banStatusSchema,
});

export type SecurityInfo = z.infer<typeof SecurityInfoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// WEB SERVER (Nginx)
// ═══════════════════════════════════════════════════════════════════════════

export const NginxSiteSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
});

export type NginxSite = z.infer<typeof NginxSiteSchema>;

export const NginxConfigTestSchema = z.object({
  success: z.boolean(),
  output: z.string(),
});

export type NginxConfigTest = z.infer<typeof NginxConfigTestSchema>;

export const SSLCertSchema = z.object({
  domain: z.string(),
  expiry: z.string(),
  issuer: z.string(),
  daysRemaining: z.number().int(),
});

export type SSLCert = z.infer<typeof SSLCertSchema>;

export const WebServerInfoSchema = z.object({
  available: z.boolean(),
  sites: z.array(NginxSiteSchema),
  configTest: NginxConfigTestSchema.optional(),
  sslCertificates: z.array(SSLCertSchema),
  message: z.string().optional(),
});

export type WebServerInfo = z.infer<typeof WebServerInfoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// PACKAGES
// ═══════════════════════════════════════════════════════════════════════════

export const UpgradablePackageSchema = z.object({
  name: z.string(),
  currentVersion: z.string(),
  newVersion: z.string(),
  architecture: z.string().optional(),
});

export type UpgradablePackage = z.infer<typeof UpgradablePackageSchema>;

export const PackageInfoSchema = z.object({
  available: z.boolean(),
  totalInstalled: z.number().int().nonnegative(),
  upgradable: z.array(UpgradablePackageSchema),
  message: z.string().optional(),
});

export type PackageInfo = z.infer<typeof PackageInfoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// CRON JOBS
// ═══════════════════════════════════════════════════════════════════════════

export const CronJobSchema = z.object({
  schedule: z.string(),
  command: z.string(),
  source: z.string(),
  description: z.string().optional(),
});

export type CronJob = z.infer<typeof CronJobSchema>;

export const CronInfoSchema = z.object({
  jobs: z.array(CronJobSchema),
});

export type CronInfo = z.infer<typeof CronInfoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// LOGS
// ═══════════════════════════════════════════════════════════════════════════

export const LogEntrySchema = z.object({
  timestamp: z.string().optional(),
  unit: z.string().optional(),
  priority: z.string().optional(),
  message: z.string(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

export const LogInfoSchema = z.object({
  source: z.enum(['journal', 'dmesg', 'syslog']),
  entries: z.array(LogEntrySchema),
});

export type LogInfo = z.infer<typeof LogInfoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════

export const DirSizeSchema = z.object({
  path: z.string(),
  size: z.string(),
});

export type DirSize = z.infer<typeof DirSizeSchema>;

export const MountPointSchema = z.object({
  target: z.string(),
  source: z.string(),
  fstype: z.string(),
  options: z.string().optional(),
});

export type MountPoint = z.infer<typeof MountPointSchema>;

export const SwapInfoSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.string(),
  used: z.string(),
  priority: z.number().int(),
});

export type SwapInfo = z.infer<typeof SwapInfoSchema>;

export const StorageInfoSchema = z.object({
  dirSizes: z.array(DirSizeSchema),
  mounts: z.array(MountPointSchema),
  swap: z.array(SwapInfoSchema),
});

export type StorageInfo = z.infer<typeof StorageInfoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// FIREWALL ACTION SCHEMAS (request validation)
// ═══════════════════════════════════════════════════════════════════════════

export const AddFirewallRuleSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['tcp', 'udp']),
  action: z.enum(['allow', 'deny']),
});

export type AddFirewallRule = z.infer<typeof AddFirewallRuleSchema>;

export const ToggleFirewallSchema = z.object({
  enable: z.boolean(),
});

export type ToggleFirewall = z.infer<typeof ToggleFirewallSchema>;
