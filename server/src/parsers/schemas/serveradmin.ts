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

// ── Network Interface ───────────────────────────────────

export const NetworkInterfaceSchema = z.object({
  name: z.string(),
  state: z.enum(['UP', 'DOWN', 'UNKNOWN']),
  mac: z.string().optional(),
  mtu: z.number().int().optional(),
  type: z.string().optional(),
});

export type NetworkInterface = z.infer<typeof NetworkInterfaceSchema>;

// ── Combined Network Info ───────────────────────────────

export const NetworkInfoSchema = z.object({
  hostname: z.string().optional(),
  ports: z.array(ListeningPortSchema),
  routes: z.array(RouteSchema),
  dns: DNSConfigSchema,
  connections: z.array(NetworkConnectionSchema),
  interfaces: z.array(NetworkInterfaceSchema).optional(),
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

// ── Fail2ban Jail Detail ────────────────────────────────

export const Fail2banJailDetailSchema = z.object({
  jail: z.string(),
  currentlyFailed: z.number(),
  totalFailed: z.number(),
  currentlyBanned: z.number(),
  totalBanned: z.number(),
  bannedIps: z.array(z.string()),
  fileList: z.array(z.string()),
  filter: z.string(),
});

export type Fail2banJailDetail = z.infer<typeof Fail2banJailDetailSchema>;

// ── Combined Security Info ──────────────────────────────

export const SecurityInfoSchema = z.object({
  users: z.array(SystemUserSchema),
  sessions: z.array(LoginSessionSchema),
  loginHistory: z.array(LoginHistorySchema),
  sshConfig: SSHConfigSchema,
  fail2ban: Fail2banStatusSchema,
});

export type SecurityInfo = z.infer<typeof SecurityInfoSchema>;

// --- M8.6: User & Session Management Schemas ---

export const CreateUserSchema = z.object({
  username: z.string().min(1).max(32),
  shell: z.string().max(256).optional(),
  createHome: z.boolean().optional().default(true),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

export const SetPasswordSchema = z.object({
  password: z.string().min(1).max(256),
});

export type SetPassword = z.infer<typeof SetPasswordSchema>;

export const AddToGroupSchema = z.object({
  group: z.string().min(1).max(32),
});

export type AddToGroup = z.infer<typeof AddToGroupSchema>;

export const KillSessionSchema = z.object({
  tty: z.string().min(1).max(32),
});

export type KillSession = z.infer<typeof KillSessionSchema>;

// ── M8.7: Network Management Schemas ────────────────────

export const SetHostnameSchema = z.object({
  hostname: z.string().min(1).max(253),
});

export type SetHostname = z.infer<typeof SetHostnameSchema>;

export const SetDnsSchema = z.object({
  nameservers: z.array(z.string().min(1).max(45)).min(1).max(10),
  searchDomains: z.array(z.string().min(1).max(253)).max(10).optional(),
});

export type SetDns = z.infer<typeof SetDnsSchema>;

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

// M8.3 — Nginx site config read schema
export const NginxSiteConfigSchema = z.object({
  site: z.string(),
  config: z.string(),
});

export type NginxSiteConfig = z.infer<typeof NginxSiteConfigSchema>;

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

// --- M8.4: Package Management Schemas ---

export const AptSearchResultSchema = z.object({
  name: z.string(),
  version: z.string(),
  architecture: z.string(),
  description: z.string(),
  installed: z.boolean(),
});

export type AptSearchResult = z.infer<typeof AptSearchResultSchema>;

export const AptSearchResultsSchema = z.array(AptSearchResultSchema);

export const PackageActionSchema = z.object({
  package: z.string().min(1).max(200),
});

export type PackageAction = z.infer<typeof PackageActionSchema>;

export const PackageSearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export type PackageSearchQuery = z.infer<typeof PackageSearchQuerySchema>;

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

// --- M8.5: Cron Management Schemas ---

export const AddCronJobSchema = z.object({
  schedule: z.string().min(1).max(100),
  command: z.string().min(1).max(1024),
  description: z.string().max(200).optional(),
});

export type AddCronJob = z.infer<typeof AddCronJobSchema>;

export const EditCronJobSchema = z.object({
  schedule: z.string().min(1).max(100),
  command: z.string().min(1).max(1024),
  description: z.string().max(200).optional(),
});

export type EditCronJob = z.infer<typeof EditCronJobSchema>;

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

export const AddAdvancedFirewallRuleSchema = z.object({
  action: z.enum(['allow', 'deny']),
  from: z.string().min(1),              // IP or CIDR (validated in route handler)
  port: z.string().optional(),           // port or port range like "8000:9000"
  protocol: z.enum(['tcp', 'udp']).optional(),
  comment: z.string().max(128).optional(),
});

export type AddAdvancedFirewallRule = z.infer<typeof AddAdvancedFirewallRuleSchema>;

export const UfwAppProfileSchema = z.object({
  name: z.string(),
});

export type UfwAppProfile = z.infer<typeof UfwAppProfileSchema>;

export const UfwAppListSchema = z.object({
  apps: z.array(UfwAppProfileSchema),
});

export type UfwAppList = z.infer<typeof UfwAppListSchema>;

export const AllowDenyAppSchema = z.object({
  action: z.enum(['allow', 'deny']),
  app: z.string().min(1),
});

export type AllowDenyApp = z.infer<typeof AllowDenyAppSchema>;

export const ToggleFirewallSchema = z.object({
  enable: z.boolean(),
});

export type ToggleFirewall = z.infer<typeof ToggleFirewallSchema>;
