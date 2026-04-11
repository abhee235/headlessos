// M2.2: App Definitions — registered apps available in the UI
// @see docs/phases/phase-2.md

import type { AppDefinition } from 'headlessos-shared';

export const APPS: AppDefinition[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: 'LayoutDashboard',
    description: 'System overview: CPU, memory, disk, network',
    requiredTools: [],
    singleInstance: true,
    refreshInterval: 30_000,
  },
  {
    id: 'files',
    name: 'Files',
    icon: 'FolderOpen',
    description: 'Browse, edit, and manage files on the server',
    requiredTools: [],
    singleInstance: true,
  },
  {
    id: 'terminal',
    name: 'Terminal',
    icon: 'Terminal',
    description: 'Interactive SSH terminal session',
    requiredTools: [],
    singleInstance: true,
  },
  {
    id: 'docker',
    name: 'Docker',
    icon: 'Box',
    description: 'Manage Docker containers and images',
    requiredTools: ['docker'],
    singleInstance: true,
    refreshInterval: 5_000,
  },
  {
    id: 'services',
    name: 'Services',
    icon: 'Server',
    description: 'Manage systemd services',
    requiredTools: ['systemctl'],
    singleInstance: true,
    refreshInterval: 10_000,
  },
  {
    id: 'taskmanager',
    name: 'Task Manager',
    icon: 'Activity',
    description: 'View and manage running processes',
    requiredTools: [],
    singleInstance: true,
    refreshInterval: 5_000,
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: 'Settings',
    description: 'Appearance, terminal, wallpaper, and notification preferences',
    requiredTools: [],
    singleInstance: true,
  },
  {
    id: 'serveradmin',
    name: 'Server Admin',
    icon: 'Shield',
    description: 'Network, firewall, security, packages, cron, logs, storage',
    requiredTools: [],
    singleInstance: true,
  },
  {
    id: 'fleet',
    name: 'Fleet Overview',
    icon: 'Globe',
    description: 'Aggregate dashboard across all connected servers',
    requiredTools: [],
    singleInstance: true,
    refreshInterval: 30_000,
  },
  {
    id: 'agent',
    name: 'AI Agent',
    icon: 'Bot',
    description: 'AI-powered server investigation and diagnostics',
    requiredTools: [],
    singleInstance: false,
  },
  {
    id: 'dynamic-ui',
    name: 'Dynamic View',
    icon: 'Sparkles',
    description: 'AI-generated dynamic UI view',
    requiredTools: [],
    singleInstance: false,
  },
  {
    id: 'ui-agent',
    name: 'UI Agent',
    icon: 'Wand2',
    description: 'AI-powered dynamic UI generation via conversational agent',
    requiredTools: [],
    singleInstance: false,
  },
  {
    id: 'observatory',
    name: 'LLM Observatory',
    icon: 'Telescope',
    description: 'Trace viewer for LLM calls, agent runs, and dynamic UI generation',
    requiredTools: [],
    singleInstance: true,
  },
];

export function getAppById(id: string): AppDefinition | undefined {
  return APPS.find(a => a.id === id);
}
