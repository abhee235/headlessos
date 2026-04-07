// M1.8: API Client
// @see docs/phases/phase-1.md

import type { ServerConfig, ConnectionState, ApiResponse } from 'headlessos-shared';

// In Electron production mode (file:// protocol), there's no Vite proxy —
// API calls must go directly to the backend server.
export const isElectronProd = typeof window !== 'undefined' &&
  window.location.protocol === 'file:';
const BACKEND_ORIGIN = 'http://localhost:3001';
export const API_BASE = isElectronProd ? `${BACKEND_ORIGIN}/api` : '/api';
const BASE = API_BASE;

/** Resolve a server-relative URL (e.g. /api/wallpapers/...) to an absolute URL in Electron */
export function resolveServerUrl(path: string): string {
  if (isElectronProd && path.startsWith('/')) {
    return `${BACKEND_ORIGIN}${path}`;
  }
  return path;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.message ?? body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Server CRUD ─────────────────────────────────────────

export type ServerWithState = Omit<ServerConfig, 'password' | 'passphrase'> & {
  state: ConnectionState | null;
};

export async function fetchServers(): Promise<ServerWithState[]> {
  return request<ServerWithState[]>('/servers');
}

export async function addServer(
  config: Omit<ServerConfig, 'id'>,
): Promise<ServerConfig> {
  return request<ServerConfig>('/servers', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function updateServer(
  id: string,
  updates: Partial<ServerConfig>,
): Promise<ServerConfig> {
  return request<ServerConfig>(`/servers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function removeServer(id: string): Promise<void> {
  await request<void>(`/servers/${id}`, { method: 'DELETE' });
}

// ── Connection ──────────────────────────────────────────

export interface ConnectCredentials {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export async function connectServer(id: string, credentials?: ConnectCredentials): Promise<ConnectionState> {
  return request<ConnectionState>(`/servers/${id}/connect`, {
    method: 'POST',
    body: JSON.stringify(credentials ?? {}),
  });
}

export async function disconnectServer(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/servers/${id}/disconnect`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getServerStatus(id: string): Promise<ConnectionState> {
  return request<ConnectionState>(`/servers/${id}/status`);
}

// ── WebSocket URL ───────────────────────────────────────

export function terminalWsUrl(serverId: string): string {
  if (isElectronProd) {
    return `ws://localhost:3001/ws/terminal/${serverId}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/terminal/${serverId}`;
}

export function dockerInstallWsUrl(serverId: string): string {
  if (isElectronProd) {
    return `ws://localhost:3001/ws/docker-install/${serverId}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/docker-install/${serverId}`;
}

// ── SSH Keys ────────────────────────────────────────────

export interface SSHKeyInfo {
  name: string;
  path: string;
  type: string;
}

export async function fetchSSHKeys(): Promise<SSHKeyInfo[]> {
  const result = await request<{ keys: SSHKeyInfo[] }>('/ssh-keys');
  return result.keys;
}

export async function fetchSSHKeyContent(keyName: string): Promise<string> {
  const result = await request<{ content: string }>(`/ssh-keys/${encodeURIComponent(keyName)}`);
  return result.content;
}

// ── System Dashboard ────────────────────────────────────

export interface SystemDashboardData {
  system: {
    hostname: string;
    uptime: string;
    os: string;
    kernel: string;
    architecture: string;
  };
  disks: Array<{
    filesystem: string;
    size: string;
    used: string;
    available: string;
    usePercent: number;
    mountPoint: string;
  }>;
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    availableMb: number;
    swapTotalMb: number;
    swapUsedMb: number;
  };
  network: Array<{
    name: string;
    status: 'UP' | 'DOWN' | 'UNKNOWN';
    ipAddresses: string[];
  }>;
}

export interface SystemDashboardResponse {
  success: boolean;
  data?: SystemDashboardData;
  steps?: Array<{
    stepId: string;
    parsedBy: 'deterministic' | 'llm';
    latencyMs: number;
    success: boolean;
  }>;
  totalLatencyMs?: number;
  error?: string;
}

export async function fetchSystemDashboard(serverId: string): Promise<SystemDashboardResponse> {
  return request<SystemDashboardResponse>(`/servers/${serverId}/system`);
}

// ── File Explorer ───────────────────────────────────────

export interface FileEntryData {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  permissions: string;
  owner: string;
  group: string;
  size: number;
  modified: string;
  symlinkTarget?: string;
}

export interface FileStatData {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  permissions: string;
  mode: number;
  owner: string;
  group: string;
  size: number;
  modified: string;
  accessed: string;
  symlinkTarget?: string;
}

export async function fetchFiles(serverId: string, path: string): Promise<FileEntryData[]> {
  return request<FileEntryData[]>(`/servers/${serverId}/files?path=${encodeURIComponent(path)}`);
}

export async function fetchFileStat(serverId: string, path: string): Promise<FileStatData> {
  return request<FileStatData>(`/servers/${serverId}/files/stat?path=${encodeURIComponent(path)}`);
}

export async function readFile(serverId: string, path: string): Promise<{ content: string; encoding: string }> {
  return request<{ content: string; encoding: string }>(`/servers/${serverId}/files/read?path=${encodeURIComponent(path)}`);
}

export async function createDirectory(serverId: string, path: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/servers/${serverId}/files/mkdir`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function renameFile(serverId: string, oldPath: string, newPath: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/servers/${serverId}/files/rename`, {
    method: 'POST',
    body: JSON.stringify({ oldPath, newPath }),
  });
}

export async function deleteFile(serverId: string, path: string): Promise<void> {
  await request<void>(`/servers/${serverId}/files?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
}

export async function writeFile(serverId: string, path: string, content: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/servers/${serverId}/files/write`, {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  });
}

export async function copyFile(serverId: string, sourcePath: string, destPath: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/servers/${serverId}/files/copy`, {
    method: 'POST',
    body: JSON.stringify({ sourcePath, destPath }),
  });
}

export async function moveFile(serverId: string, sourcePath: string, destPath: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/servers/${serverId}/files/move`, {
    method: 'POST',
    body: JSON.stringify({ sourcePath, destPath }),
  });
}

// ── File Upload (M10.3) ────────────────────────────────

export interface UploadResult {
  success: boolean;
  files: Array<{ name: string; size: number; success: boolean }>;
}

export async function uploadFiles(
  serverId: string,
  destPath: string,
  files: File[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<UploadResult> {
  const formData = new FormData();
  let totalSize = 0;
  for (const file of files) {
    formData.append('files', file, file.name);
    totalSize += file.size;
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/servers/${serverId}/files/upload?path=${encodeURIComponent(destPath)}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ success: true, files: [] });
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.send(formData);
  });
}

// ── Task Manager ────────────────────────────────────────

export interface ProcessData {
  pid: number;
  user: string;
  cpu: number;
  memory: number;
  vsz: number;
  rss: number;
  stat: string;
  started: string;
  time: string;
  command: string;
}

export interface CpuStatsData {
  overallPercent: number;
  coreCount: number;
  cores: Array<{ id: number; percent: number }>;
  loadAverage: { one: number; five: number; fifteen: number };
  processes: {
    total: number;
    running: number;
    sleeping: number;
    stopped: number;
    zombie: number;
  };
  uptime: string;
}

export interface NetworkIoEntry {
  interface: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
}

export interface DiskIoEntry {
  device: string;
  readBytes: number;
  writeBytes: number;
}

export interface TaskManagerData {
  processes: ProcessData[];
  cpu: CpuStatsData;
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    availableMb: number;
    swapTotalMb: number;
    swapUsedMb: number;
  };
  networkIo: NetworkIoEntry[];
  diskIo: DiskIoEntry[];
}

export interface TaskManagerResponse {
  success: boolean;
  data?: TaskManagerData;
  steps?: Array<{
    stepId: string;
    parsedBy: 'deterministic' | 'llm';
    latencyMs: number;
    success: boolean;
  }>;
  totalLatencyMs?: number;
  error?: string;
}

export async function fetchTaskManager(serverId: string): Promise<TaskManagerResponse> {
  return request<TaskManagerResponse>(`/servers/${serverId}/taskmanager`);
}

export async function killProcess(
  serverId: string,
  pid: number,
  signal: 9 | 15 = 15,
): Promise<{ success: boolean; error?: string }> {
  return request<{ success: boolean; error?: string }>(
    `/servers/${serverId}/taskmanager/kill`,
    {
      method: 'POST',
      body: JSON.stringify({ pid, signal }),
    },
  );
}

// ── Docker ──────────────────────────────────────────────

export interface DockerContainerData {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead';
  ports: string;
  created: string;
}

export interface DockerImageData {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export interface DockerContainersResponse {
  success: boolean;
  data?: DockerContainerData[];
  dockerAvailable?: boolean;
  error?: string;
}

export interface DockerImagesResponse {
  success: boolean;
  data?: DockerImageData[];
  dockerAvailable?: boolean;
  error?: string;
}

export async function fetchDockerContainers(serverId: string): Promise<DockerContainersResponse> {
  return request<DockerContainersResponse>(`/servers/${serverId}/docker/containers`);
}

export async function fetchDockerImages(serverId: string): Promise<DockerImagesResponse> {
  return request<DockerImagesResponse>(`/servers/${serverId}/docker/images`);
}

export async function dockerContainerAction(
  serverId: string,
  containerId: string,
  action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause',
): Promise<{ success: boolean; error?: string }> {
  return request<{ success: boolean; error?: string }>(
    `/servers/${serverId}/docker/containers/${encodeURIComponent(containerId)}/${action}`,
    { method: 'POST' },
  );
}

export async function removeDockerContainer(
  serverId: string,
  containerId: string,
  force = false,
): Promise<{ success: boolean; error?: string }> {
  return request<{ success: boolean; error?: string }>(
    `/servers/${serverId}/docker/containers/${encodeURIComponent(containerId)}${force ? '?force=true' : ''}`,
    { method: 'DELETE' },
  );
}

export async function removeDockerImage(
  serverId: string,
  imageId: string,
  force = false,
): Promise<{ success: boolean; error?: string }> {
  return request<{ success: boolean; error?: string }>(
    `/servers/${serverId}/docker/images/${encodeURIComponent(imageId)}${force ? '?force=true' : ''}`,
    { method: 'DELETE' },
  );
}

export async function fetchDockerLogs(
  serverId: string,
  containerId: string,
  tail = 200,
): Promise<{ success: boolean; data?: string; error?: string }> {
  return request<{ success: boolean; data?: string; error?: string }>(
    `/servers/${serverId}/docker/containers/${encodeURIComponent(containerId)}/logs?tail=${tail}`,
  );
}

export interface RunDockerImageOptions {
  image: string;
  name?: string;
  ports?: string[];
  env?: string[];
  volumes?: string[];
  detach?: boolean;
  command?: string;
}

export async function runDockerImage(
  serverId: string,
  options: RunDockerImageOptions,
): Promise<{ success: boolean; containerId?: string; error?: string }> {
  return request<{ success: boolean; containerId?: string; error?: string }>(
    `/servers/${serverId}/docker/run`,
    { method: 'POST', body: JSON.stringify(options) },
  );
}

export async function fetchDockerInspect(
  serverId: string,
  containerId: string,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  return request<{ success: boolean; data?: Record<string, unknown>; error?: string }>(
    `/servers/${serverId}/docker/containers/${encodeURIComponent(containerId)}/inspect`,
  );
}

// ── Services ────────────────────────────────────────────

export interface ServiceData {
  name: string;
  loadState: 'loaded' | 'not-found' | 'masked';
  activeState: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating';
  subState: string;
  description: string;
}

export interface ServicesResponse {
  success: boolean;
  data?: ServiceData[];
  systemdAvailable?: boolean;
  error?: string;
}

export async function fetchServices(serverId: string): Promise<ServicesResponse> {
  return request<ServicesResponse>(`/servers/${serverId}/services`);
}

export async function serviceAction(
  serverId: string,
  serviceName: string,
  action: 'start' | 'stop' | 'restart' | 'enable' | 'disable',
): Promise<{ success: boolean; error?: string }> {
  return request<{ success: boolean; error?: string }>(
    `/servers/${serverId}/services/${encodeURIComponent(serviceName)}/${action}`,
    { method: 'POST' },
  );
}

export async function fetchServiceStatus(
  serverId: string,
  serviceName: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  return request<{ success: boolean; data?: string; error?: string }>(
    `/servers/${serverId}/services/${encodeURIComponent(serviceName)}/status`,
  );
}

export async function fetchServiceLogs(
  serverId: string,
  serviceName: string,
  lines = 100,
): Promise<{ success: boolean; data?: string; error?: string }> {
  return request<{ success: boolean; data?: string; error?: string }>(
    `/servers/${serverId}/services/${encodeURIComponent(serviceName)}/logs?lines=${lines}`,
  );
}

// ── Server Admin ────────────────────────────────────────

export interface NetworkInterface {
  name: string;
  state: 'UP' | 'DOWN' | 'UNKNOWN';
  mac?: string;
  mtu?: number;
  type?: string;
}

export interface NetworkInfo {
  hostname?: string;
  ports: Array<{ protocol: string; localAddress: string; localPort: number; process: string; pid?: number }>;
  routes: Array<{ destination: string; gateway?: string; interface: string; metric?: number; scope?: string; protocol?: string }>;
  dns: { nameservers: string[]; searchDomains: string[] };
  connections: Array<{ protocol: string; localAddress: string; localPort: number; remoteAddress: string; remotePort: number; state: string; process?: string; pid?: number }>;
  interfaces?: NetworkInterface[];
}

export interface FirewallStatus {
  available: boolean;
  active: boolean;
  rules: Array<{ number: number; to: string; action: string; from: string }>;
  message?: string;
}

export interface SecurityInfo {
  users: Array<{ username: string; uid: number; gid: number; home: string; shell: string; description?: string }>;
  sessions: Array<{ user: string; terminal: string; loginTime: string; remoteHost?: string }>;
  loginHistory: Array<{ user: string; terminal: string; remoteHost: string; loginTime: string; logoutTime: string; duration?: string }>;
  sshConfig: { port: string; permitRootLogin: string; passwordAuthentication: string; pubkeyAuthentication: string; maxAuthTries: string; x11Forwarding: string };
  fail2ban: { available: boolean; jails?: string[]; message?: string };
}

export interface WebServerInfo {
  available: boolean;
  sites: Array<{ name: string; enabled: boolean }>;
  configTest?: { success: boolean; output: string };
  sslCertificates: Array<{ domain: string; expiry: string; issuer: string; daysRemaining: number }>;
  message?: string;
}

export interface PackageInfo {
  available: boolean;
  totalInstalled: number;
  upgradable: Array<{ name: string; currentVersion: string; newVersion: string; architecture?: string }>;
  message?: string;
}

export interface AptSearchResult {
  name: string;
  version: string;
  architecture: string;
  description: string;
  installed: boolean;
}

export interface CronInfo {
  jobs: Array<{ schedule: string; command: string; source: string; description?: string }>;
}

export interface LogInfo {
  source: 'journal' | 'dmesg' | 'syslog';
  entries: Array<{ timestamp?: string; unit?: string; priority?: string; message: string }>;
}

export interface StorageInfo {
  dirSizes: Array<{ path: string; size: string }>;
  mounts: Array<{ target: string; source: string; fstype: string; options?: string }>;
  swap: Array<{ name: string; type: string; size: string; used: string; priority: number }>;
}

export async function fetchNetworkInfo(serverId: string): Promise<{ success: boolean; data?: NetworkInfo; error?: string }> {
  return request(`/servers/${serverId}/admin/network`);
}

export async function setHostname(
  serverId: string,
  hostname: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/network/hostname`, {
    method: 'POST',
    body: JSON.stringify({ hostname }),
  });
}

export async function setDnsConfig(
  serverId: string,
  nameservers: string[],
  searchDomains?: string[],
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/network/dns`, {
    method: 'POST',
    body: JSON.stringify({ nameservers, searchDomains }),
  });
}

export async function setInterfaceUp(
  serverId: string,
  name: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/network/interface/${encodeURIComponent(name)}/up`, {
    method: 'POST',
  });
}

export async function setInterfaceDown(
  serverId: string,
  name: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/network/interface/${encodeURIComponent(name)}/down`, {
    method: 'POST',
  });
}

export async function fetchFirewallStatus(serverId: string): Promise<{ success: boolean; data?: FirewallStatus; error?: string }> {
  return request(`/servers/${serverId}/admin/firewall`);
}

export async function addFirewallRule(
  serverId: string,
  rule: { port: number; protocol: 'tcp' | 'udp'; action: 'allow' | 'deny' },
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/firewall`, {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

export async function deleteFirewallRule(
  serverId: string,
  ruleNumber: number,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/firewall/${ruleNumber}`, {
    method: 'DELETE',
  });
}

export async function toggleFirewall(
  serverId: string,
  enable: boolean,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/firewall/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enable }),
  });
}

// ── Firewall Advanced Rules (M8.2) ─────────────────────────────

export interface AdvancedFirewallRule {
  action: 'allow' | 'deny';
  from: string;
  port?: string;
  protocol?: 'tcp' | 'udp';
  comment?: string;
}

export interface UfwAppProfile {
  name: string;
}

export async function addAdvancedFirewallRule(
  serverId: string,
  rule: AdvancedFirewallRule,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/firewall/advanced`, {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

export async function fetchUfwAppProfiles(
  serverId: string,
): Promise<{ success: boolean; data?: { apps: UfwAppProfile[] }; error?: string }> {
  return request(`/servers/${serverId}/admin/firewall/apps`);
}

export async function allowDenyUfwApp(
  serverId: string,
  action: 'allow' | 'deny',
  app: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/firewall/app`, {
    method: 'POST',
    body: JSON.stringify({ action, app }),
  });
}

export async function fetchSecurityInfo(serverId: string): Promise<{ success: boolean; data?: SecurityInfo; error?: string }> {
  return request(`/servers/${serverId}/admin/security`);
}

// ── Fail2ban Management (M8.1) ─────────────────────────────────

export interface Fail2banJailDetail {
  jail: string;
  currentlyFailed: number;
  totalFailed: number;
  currentlyBanned: number;
  totalBanned: number;
  bannedIps: string[];
  fileList: string[];
  filter: string;
}

export async function fetchFail2banJailDetail(serverId: string, jail: string): Promise<{ success: boolean; data?: Fail2banJailDetail; error?: string }> {
  return request(`/servers/${serverId}/admin/fail2ban/jails/${encodeURIComponent(jail)}`);
}

export async function fail2banBanIp(serverId: string, jail: string, ip: string): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/fail2ban/ban`, { method: 'POST', body: JSON.stringify({ jail, ip }) });
}

export async function fail2banUnbanIp(serverId: string, jail: string, ip: string): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/fail2ban/unban`, { method: 'POST', body: JSON.stringify({ jail, ip }) });
}

export async function fail2banReload(serverId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/fail2ban/reload`, { method: 'POST' });
}

// ── User & Session Management (M8.6) ──────────────────────────

export async function createUser(
  serverId: string,
  opts: { username: string; shell?: string; createHome?: boolean },
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/users`, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function deleteUser(
  serverId: string,
  username: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
  });
}

export async function setUserPassword(
  serverId: string,
  username: string,
  password: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/users/${encodeURIComponent(username)}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function addUserToGroup(
  serverId: string,
  username: string,
  group: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/users/${encodeURIComponent(username)}/groups`, {
    method: 'POST',
    body: JSON.stringify({ group }),
  });
}

export async function killSession(
  serverId: string,
  tty: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/sessions/kill`, {
    method: 'POST',
    body: JSON.stringify({ tty }),
  });
}

export async function fetchWebServerInfo(serverId: string): Promise<{ success: boolean; data?: WebServerInfo; error?: string }> {
  return request(`/servers/${serverId}/admin/webserver`);
}

// ── Nginx Site Management (M8.3) ───────────────────────────────

export interface NginxSiteConfig {
  site: string;
  config: string;
}

export async function enableNginxSite(serverId: string, site: string): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/nginx/sites/${encodeURIComponent(site)}/enable`, { method: 'POST' });
}

export async function disableNginxSite(serverId: string, site: string): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/nginx/sites/${encodeURIComponent(site)}/disable`, { method: 'POST' });
}

export async function reloadNginx(serverId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/nginx/reload`, { method: 'POST' });
}

export async function restartNginx(serverId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  return request(`/servers/${serverId}/admin/nginx/restart`, { method: 'POST' });
}

export async function fetchNginxSiteConfig(serverId: string, site: string): Promise<{ success: boolean; data?: NginxSiteConfig; error?: string }> {
  return request(`/servers/${serverId}/admin/nginx/sites/${encodeURIComponent(site)}/config`);
}

export async function testNginxConfig(serverId: string): Promise<{ success: boolean; data?: { success: boolean; output: string }; error?: string }> {
  return request(`/servers/${serverId}/admin/nginx/test`, { method: 'POST' });
}

export async function fetchPackageInfo(serverId: string): Promise<{ success: boolean; data?: PackageInfo; error?: string }> {
  return request(`/servers/${serverId}/admin/packages`);
}

export async function aptUpdate(serverId: string): Promise<{ success: boolean; data?: { output: string }; error?: string }> {
  return request(`/servers/${serverId}/admin/packages/update`, { method: 'POST' });
}

export async function aptUpgradeAll(serverId: string): Promise<{ success: boolean; data?: { output: string }; error?: string }> {
  return request(`/servers/${serverId}/admin/packages/upgrade-all`, { method: 'POST' });
}

export async function installPackage(serverId: string, pkg: string): Promise<{ success: boolean; data?: { output: string }; error?: string }> {
  return request(`/servers/${serverId}/admin/packages/install`, { method: 'POST', body: JSON.stringify({ package: pkg }) });
}

export async function removePackage(serverId: string, pkg: string): Promise<{ success: boolean; data?: { output: string }; error?: string }> {
  return request(`/servers/${serverId}/admin/packages/remove`, { method: 'POST', body: JSON.stringify({ package: pkg }) });
}

export async function upgradePackage(serverId: string, pkg: string): Promise<{ success: boolean; data?: { output: string }; error?: string }> {
  return request(`/servers/${serverId}/admin/packages/upgrade`, { method: 'POST', body: JSON.stringify({ package: pkg }) });
}

export async function searchPackages(serverId: string, query: string): Promise<{ success: boolean; data?: AptSearchResult[]; error?: string }> {
  return request(`/servers/${serverId}/admin/packages/search?q=${encodeURIComponent(query)}`);
}

export async function fetchCronInfo(serverId: string): Promise<{ success: boolean; data?: CronInfo; error?: string }> {
  return request(`/servers/${serverId}/admin/cron`);
}

export async function addCronJob(
  serverId: string,
  job: { schedule: string; command: string; description?: string },
): Promise<{ success: boolean; error?: string }> {
  return request(`/servers/${serverId}/admin/cron`, {
    method: 'POST',
    body: JSON.stringify(job),
  });
}

export async function deleteCronJob(
  serverId: string,
  index: number,
): Promise<{ success: boolean; error?: string }> {
  return request(`/servers/${serverId}/admin/cron/${index}`, {
    method: 'DELETE',
  });
}

export async function editCronJob(
  serverId: string,
  index: number,
  job: { schedule: string; command: string; description?: string },
): Promise<{ success: boolean; error?: string }> {
  return request(`/servers/${serverId}/admin/cron/${index}`, {
    method: 'PUT',
    body: JSON.stringify(job),
  });
}

export interface LogQueryOpts {
  source?: 'journal' | 'dmesg' | 'syslog';
  unit?: string;
  lines?: number;
  priority?: string;
  since?: string;
  until?: string;
  grep?: string;
}

export async function fetchLogInfo(
  serverId: string,
  opts?: LogQueryOpts,
): Promise<{ success: boolean; data?: LogInfo; error?: string }> {
  const params = new URLSearchParams();
  if (opts?.source) params.set('source', opts.source);
  if (opts?.unit) params.set('unit', opts.unit);
  if (opts?.lines) params.set('lines', String(opts.lines));
  if (opts?.priority) params.set('priority', opts.priority);
  if (opts?.since) params.set('since', opts.since);
  if (opts?.until) params.set('until', opts.until);
  if (opts?.grep) params.set('grep', opts.grep);
  const qs = params.toString();
  return request(`/servers/${serverId}/admin/logs${qs ? `?${qs}` : ''}`);
}

export function getLogExportUrl(serverId: string, opts?: LogQueryOpts): string {
  const params = new URLSearchParams();
  if (opts?.source) params.set('source', opts.source);
  if (opts?.unit) params.set('unit', opts.unit);
  if (opts?.lines) params.set('lines', String(opts.lines));
  if (opts?.priority) params.set('priority', opts.priority);
  if (opts?.since) params.set('since', opts.since);
  if (opts?.until) params.set('until', opts.until);
  if (opts?.grep) params.set('grep', opts.grep);
  const qs = params.toString();
  return `${BASE}/servers/${serverId}/admin/logs/export${qs ? `?${qs}` : ''}`;
}

export async function fetchStorageInfo(serverId: string): Promise<{ success: boolean; data?: StorageInfo; error?: string }> {
  return request(`/servers/${serverId}/admin/storage`);
}

// ── LLM Configuration (M10.7) ───────────────────────────

export interface LLMConfig {
  provider: 'openai' | 'none';
  model: string;
  hasApiKey: boolean;
}

export interface LLMModelInfo {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
}

export async function fetchLLMConfig(): Promise<{ success: boolean; data?: LLMConfig }> {
  return request('/llm/config');
}

export async function updateLLMConfig(config: { provider: string; apiKey?: string; model?: string }): Promise<{ success: boolean; data?: LLMConfig; error?: string }> {
  return request('/llm/config', { method: 'PUT', body: JSON.stringify(config) });
}

export async function fetchLLMModels(): Promise<{ success: boolean; data?: Record<string, LLMModelInfo[]> }> {
  return request('/llm/models');
}

// ── Fleet Overview (M11.1) ──────────────────────────────

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
  };
  fetchedAt: string;
}

export async function fetchFleetOverview(): Promise<{ success: boolean; data?: FleetOverview }> {
  return request('/fleet/overview');
}

export async function updateServerTags(serverId: string, tags: string[]): Promise<{ success: boolean }> {
  return request(`/servers/${serverId}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  });
}

// ── ReAct Agent (M11.5) ─────────────────────────────────

export interface AgentStep {
  stepNumber: number;
  thought: string;
  command?: string;
  output?: string;
  observation?: string;
  decision: 'continue' | 'answer' | 'error';
}

export interface AgentResult {
  sessionId: string;
  question: string;
  steps: AgentStep[];
  answer: string;
  totalSteps: number;
  totalTokens: number;
  totalLatencyMs: number;
  status: 'completed' | 'aborted' | 'error' | 'max_steps_reached';
}

export async function startAgentInvestigation(
  serverId: string,
  question: string,
  options?: { maxSteps?: number; readOnly?: boolean },
): Promise<{ success: boolean; data?: AgentResult; error?: string }> {
  return request(`/servers/${serverId}/agent/investigate`, {
    method: 'POST',
    body: JSON.stringify({ question, ...options }),
  });
}

export async function abortAgentInvestigation(
  serverId: string,
  sessionId: string,
): Promise<{ success: boolean }> {
  return request(`/servers/${serverId}/agent/${sessionId}/abort`, {
    method: 'POST',
  });
}

// ── Dynamic UI ──────────────────────────────────────────

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface TemplateSearchResult {
  templateId: string;
  name: string;
  matchedPattern: string;
  confidence: number;
}

export interface GenerateDynamicUIResult {
  view: Record<string, unknown>;
  source: 'cache' | 'llm';
  templateId?: string;
  llmStats?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  };
}

export async function fetchDynamicUITemplates(): Promise<TemplateSummary[]> {
  const res = await request<{ success: boolean; data: TemplateSummary[] }>(
    '/dynamic-ui/templates',
  );
  return res.data;
}

export async function searchDynamicUITemplates(
  query: string,
): Promise<TemplateSummary[]> {
  const res = await request<{ success: boolean; data: TemplateSummary[] }>(
    `/dynamic-ui/templates/search?q=${encodeURIComponent(query)}`,
  );
  return res.data;
}

export async function generateDynamicUI(
  serverId: string,
  tool: string,
  command: string,
  rawOutput: string,
): Promise<GenerateDynamicUIResult> {
  const res = await request<{ success: boolean; data: GenerateDynamicUIResult }>(
    `/servers/${serverId}/dynamic-ui/generate`,
    {
      method: 'POST',
      body: JSON.stringify({ tool, command, rawOutput }),
    },
  );
  return res.data;
}

export interface RefreshResult {
  success: boolean;
  data: unknown;
  rawOutput: string;
}

export async function refreshWidgetData(
  serverId: string,
  command: string,
  parseMode: 'json' | 'text' = 'text',
): Promise<RefreshResult> {
  return request<RefreshResult>(
    `/servers/${serverId}/dynamic-ui/refresh`,
    {
      method: 'POST',
      body: JSON.stringify({ command, parseMode }),
    },
  );
}
