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
];

export function getAppById(id: string): AppDefinition | undefined {
  return APPS.find(a => a.id === id);
}
