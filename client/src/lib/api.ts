// M1.8: API Client
// @see docs/phases/phase-1.md

import type { ServerConfig, ConnectionState, ApiResponse } from 'headlessos-shared';

const BASE = '/api';

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
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/terminal/${serverId}`;
}

export function dockerInstallWsUrl(serverId: string): string {
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
