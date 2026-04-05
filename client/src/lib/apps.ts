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
];

export function getAppById(id: string): AppDefinition | undefined {
  return APPS.find(a => a.id === id);
}
