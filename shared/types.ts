// M0.3: Shared Types
// @see docs/phases/phase-0.md

// ============================================
// Server Configuration
// ============================================

export interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'privateKey' | 'agent';
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  tags?: string[];
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  serverId: string;
  status: ConnectionStatus;
  error?: string;
  connectedAt?: string;
  detectedTools?: string[];
}

// ============================================
// App System
// ============================================

export interface AppDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  requiredTools: string[];
  singleInstance?: boolean;
  refreshInterval?: number;
}

// ============================================
// Parsed Data Types
// ============================================

export interface SystemInfo {
  hostname: string;
  uptime: string;
  os: string;
  kernel: string;
  architecture: string;
}

export interface DiskUsage {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: number;
  mountPoint: string;
}

export interface MemoryInfo {
  totalMb: number;
  usedMb: number;
  freeMb: number;
  availableMb: number;
  swapTotalMb: number;
  swapUsedMb: number;
}

export interface NetworkInterface {
  name: string;
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  ipAddresses: string[];
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  permissions: string;
  owner: string;
  group: string;
  size: number;
  modified: string;
  symlinkTarget?: string;
}

export interface FileStatInfo {
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

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead';
  ports: string;
  created: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  vsz: number;
  rss: number;
  tty: string;
  stat: string;
  startTime: string;
  command: string;
}

export interface ServiceInfo {
  name: string;
  loadState: 'loaded' | 'not-found' | 'masked';
  activeState: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating';
  subState: string;
  description: string;
}

// ============================================
// API Response Wrappers
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  parsedBy?: 'deterministic' | 'llm';
  latencyMs?: number;
}

export interface SystemDashboard {
  system: SystemInfo;
  disks: DiskUsage[];
  memory: MemoryInfo;
  network: NetworkInterface[];
}
