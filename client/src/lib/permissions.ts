// M10.5: App Permission System — per-app capability types, checks, UI indicators
// @see docs/PROGRESS.md

import { create } from 'zustand';

// ── Capability Definitions ───────────────────────────────

/**
 * Fine-grained capabilities that apps can request.
 * Each maps to a backend action category.
 */
export type AppCapability =
  | 'fs:read'           // Read files and directories
  | 'fs:write'          // Create, edit, delete files
  | 'fs:upload'         // Upload files to server
  | 'process:list'      // List running processes
  | 'process:kill'      // Kill / signal processes
  | 'docker:read'       // List containers and images
  | 'docker:manage'     // Start, stop, remove containers
  | 'service:read'      // List systemd services
  | 'service:manage'    // Start, stop, enable, disable services
  | 'terminal:access'   // Open interactive shell
  | 'network:read'      // View network configuration
  | 'network:manage'    // Modify network, firewall, DNS
  | 'system:read'       // Read system info (dashboard)
  | 'system:manage'     // Modify hostname, users, packages
  | 'llm:invoke';       // Use LLM for parsing

/** Human-readable labels and risk levels */
export interface CapabilityInfo {
  id: AppCapability;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  icon: string; // Lucide icon name
}

export const CAPABILITY_CATALOG: CapabilityInfo[] = [
  { id: 'fs:read',          label: 'Read Files',          description: 'Browse and read file contents',                risk: 'low',    icon: 'Eye' },
  { id: 'fs:write',         label: 'Write Files',         description: 'Create, edit, and delete files',              risk: 'high',   icon: 'Pencil' },
  { id: 'fs:upload',        label: 'Upload Files',        description: 'Upload files from your computer',             risk: 'medium', icon: 'Upload' },
  { id: 'process:list',     label: 'List Processes',      description: 'View running processes',                      risk: 'low',    icon: 'List' },
  { id: 'process:kill',     label: 'Kill Processes',      description: 'Terminate running processes',                 risk: 'high',   icon: 'XCircle' },
  { id: 'docker:read',      label: 'View Docker',         description: 'List containers and images',                  risk: 'low',    icon: 'Box' },
  { id: 'docker:manage',    label: 'Manage Docker',       description: 'Start, stop, and remove containers',          risk: 'high',   icon: 'Settings' },
  { id: 'service:read',     label: 'View Services',       description: 'List systemd services',                       risk: 'low',    icon: 'Server' },
  { id: 'service:manage',   label: 'Manage Services',     description: 'Start, stop, enable, disable services',       risk: 'high',   icon: 'Settings' },
  { id: 'terminal:access',  label: 'Terminal Access',     description: 'Open interactive SSH shell',                  risk: 'high',   icon: 'Terminal' },
  { id: 'network:read',     label: 'View Network',        description: 'View network configuration',                  risk: 'low',    icon: 'Wifi' },
  { id: 'network:manage',   label: 'Manage Network',      description: 'Modify firewall, DNS, interfaces',            risk: 'high',   icon: 'Shield' },
  { id: 'system:read',      label: 'System Info',         description: 'Read system dashboard and stats',             risk: 'low',    icon: 'BarChart' },
  { id: 'system:manage',    label: 'System Admin',        description: 'Modify hostname, users, packages',            risk: 'high',   icon: 'ShieldAlert' },
  { id: 'llm:invoke',       label: 'Use AI Parsing',      description: 'Invoke LLM for output parsing',              risk: 'medium', icon: 'Brain' },
];

// ── Default Permissions per App ──────────────────────────

/** Built-in apps and their default capabilities */
export const DEFAULT_APP_PERMISSIONS: Record<string, AppCapability[]> = {
  dashboard:    ['system:read', 'llm:invoke'],
  files:        ['fs:read', 'fs:write', 'fs:upload'],
  terminal:     ['terminal:access'],
  docker:       ['docker:read', 'docker:manage'],
  services:     ['service:read', 'service:manage'],
  taskmanager:  ['process:list', 'process:kill', 'system:read'],
  settings:     ['system:read'],
  serveradmin:  ['system:read', 'system:manage', 'network:read', 'network:manage'],
};

// ── Permission Store ─────────────────────────────────────

interface PermissionOverride {
  appId: string;
  capability: AppCapability;
  granted: boolean;
}

interface PermissionState {
  /** User overrides — takes precedence over defaults */
  overrides: PermissionOverride[];

  /** Check if an app has a specific capability */
  hasPermission: (appId: string, capability: AppCapability) => boolean;

  /** Get all capabilities for an app (defaults + overrides) */
  getAppCapabilities: (appId: string) => AppCapability[];

  /** Grant a capability to an app */
  grant: (appId: string, capability: AppCapability) => void;

  /** Revoke a capability from an app */
  revoke: (appId: string, capability: AppCapability) => void;

  /** Reset an app to its default permissions */
  resetApp: (appId: string) => void;

  /** Reset all overrides */
  resetAll: () => void;
}

const STORAGE_KEY = 'headlessos-permissions';

function loadOverrides(): PermissionOverride[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as PermissionOverride[];
  } catch { /* ignore */ }
  return [];
}

function saveOverrides(overrides: PermissionOverride[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  overrides: loadOverrides(),

  hasPermission: (appId, capability) => {
    const { overrides } = get();
    // Check override first
    const override = overrides.find(o => o.appId === appId && o.capability === capability);
    if (override !== undefined) return override.granted;
    // Fall back to defaults
    const defaults = DEFAULT_APP_PERMISSIONS[appId] ?? [];
    return defaults.includes(capability);
  },

  getAppCapabilities: (appId) => {
    const { overrides } = get();
    const defaults = DEFAULT_APP_PERMISSIONS[appId] ?? [];
    const caps = new Set<AppCapability>(defaults);
    for (const o of overrides) {
      if (o.appId !== appId) continue;
      if (o.granted) caps.add(o.capability);
      else caps.delete(o.capability);
    }
    return [...caps];
  },

  grant: (appId, capability) => {
    set(s => {
      const overrides = s.overrides.filter(o => !(o.appId === appId && o.capability === capability));
      overrides.push({ appId, capability, granted: true });
      saveOverrides(overrides);
      return { overrides };
    });
  },

  revoke: (appId, capability) => {
    set(s => {
      const overrides = s.overrides.filter(o => !(o.appId === appId && o.capability === capability));
      overrides.push({ appId, capability, granted: false });
      saveOverrides(overrides);
      return { overrides };
    });
  },

  resetApp: (appId) => {
    set(s => {
      const overrides = s.overrides.filter(o => o.appId !== appId);
      saveOverrides(overrides);
      return { overrides };
    });
  },

  resetAll: () => {
    saveOverrides([]);
    set({ overrides: [] });
  },
}));

// ── Utility Helpers ──────────────────────────────────────

export function getCapabilityInfo(capability: AppCapability): CapabilityInfo | undefined {
  return CAPABILITY_CATALOG.find(c => c.id === capability);
}

export function getRiskColor(risk: 'low' | 'medium' | 'high'): string {
  switch (risk) {
    case 'low': return 'text-success';
    case 'medium': return 'text-warning';
    case 'high': return 'text-destructive';
  }
}

export function getRiskBadgeVariant(risk: 'low' | 'medium' | 'high'): 'success' | 'warning' | 'destructive' {
  switch (risk) {
    case 'low': return 'success';
    case 'medium': return 'warning';
    case 'high': return 'destructive';
  }
}
