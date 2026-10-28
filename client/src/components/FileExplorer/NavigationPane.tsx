// M6: Navigation Pane - places sidebar
// EX8.6: LumenOS v3 — the shared PaneSidebar (208px glass-subtle inset pane).
// EX8.30: Favorites follow the signed-in user's home (asked of the server), and the
// Desktop / Documents / Downloads shortcuts only show when that folder exists.
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

import { useEffect, useState } from 'react';
import {
  Home,
  Download,
  FileText,
  Monitor,
  Folder,
  Clock,
  HardDrive,
  Server,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PaneSidebar, PaneSidebarGroup, PaneSidebarItem } from '@/components/ui/pane-sidebar';
import { fetchFiles, fetchHomeDir } from '../../lib/api';

/** The user's home folder and the names of the folders in it; null until known */
export interface HomeFolders {
  home: string;
  folders: string[];
}

interface NavigationPaneProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  /** EX8.30: from useHomeFolders; while null only the home-independent favourites show */
  homeFolders?: HomeFolders | null;
}

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

/** Shortcuts into the home folder, shown only when the folder exists there */
const HOME_SHORTCUTS: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Desktop', icon: Monitor },
  { label: 'Documents', icon: FileText },
  { label: 'Downloads', icon: Download },
];

/** Favorites for a home folder: Home, the shortcuts that exist in it, then Recents and Recycle Bin */
export function favouritesFor(homeFolders: HomeFolders | null | undefined): NavItem[] {
  const home = homeFolders
    ? [
        { label: 'Home', path: homeFolders.home, icon: Home },
        ...HOME_SHORTCUTS.filter((s) => homeFolders.folders.includes(s.label)).map((s) => ({
          label: s.label,
          path: `${homeFolders.home.replace(/\/$/, '')}/${s.label}`,
          icon: s.icon,
        })),
      ]
    : [];
  return [
    ...home,
    { label: 'Recents', path: '/tmp', icon: Clock },
    { label: 'Recycle Bin', path: '__trash__', icon: Trash2 },
  ];
}

/** EX8.30: ask the server once for the home folder and list it; null while loading or on failure */
export function useHomeFolders(serverId: string): HomeFolders | null {
  const [value, setValue] = useState<HomeFolders | null>(null);
  useEffect(() => {
    let alive = true;
    setValue(null);
    (async () => {
      try {
        const home = await fetchHomeDir(serverId);
        const entries = await fetchFiles(serverId, home).catch(() => []);
        const folders = entries.filter((e) => e.type === 'directory').map((e) => e.name);
        if (alive) setValue({ home, folders });
      } catch {
        /* no home: the pane keeps the favourites that don't need one */
      }
    })();
    return () => { alive = false; };
  }, [serverId]);
  return value;
}

const LOCATIONS: NavItem[] = [
  { label: 'Root (/)', path: '/', icon: HardDrive },
  { label: 'Server Home', path: '/home', icon: Server },
  { label: 'etc', path: '/etc', icon: Folder },
  { label: 'var', path: '/var', icon: Folder },
  { label: 'usr', path: '/usr', icon: Folder },
  { label: 'opt', path: '/opt', icon: Folder },
  { label: 'tmp', path: '/tmp', icon: Folder },
];

export function NavigationPane({ currentPath, onNavigate, homeFolders }: NavigationPaneProps) {
  return (
    <PaneSidebar width={208} className="select-none">
      <PaneSidebarGroup label="Favorites">
        {favouritesFor(homeFolders).map(item => (
          <PaneSidebarItem
            key={item.path + item.label}
            icon={item.icon}
            label={item.label}
            active={currentPath === item.path}
            onClick={() => onNavigate(item.path)}
          />
        ))}
      </PaneSidebarGroup>

      <PaneSidebarGroup label="Locations" className="mt-2">
        {LOCATIONS.map(item => (
          <PaneSidebarItem
            key={item.path + item.label}
            icon={item.icon}
            label={item.label}
            active={currentPath === item.path}
            onClick={() => onNavigate(item.path)}
          />
        ))}
      </PaneSidebarGroup>
    </PaneSidebar>
  );
}
