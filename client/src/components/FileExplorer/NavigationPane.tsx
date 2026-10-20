// M6: Navigation Pane - places sidebar
// EX8.6: LumenOS v3 — the shared PaneSidebar (208px glass-subtle inset pane).
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

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

interface NavigationPaneProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

const FAVOURITES: NavItem[] = [
  { label: 'Home', path: '/home/testuser', icon: Home },
  { label: 'Desktop', path: '/home/testuser/Desktop', icon: Monitor },
  { label: 'Documents', path: '/home/testuser/Documents', icon: FileText },
  { label: 'Downloads', path: '/home/testuser/Downloads', icon: Download },
  { label: 'Recents', path: '/tmp', icon: Clock },
  { label: 'Recycle Bin', path: '__trash__', icon: Trash2 },
];

const LOCATIONS: NavItem[] = [
  { label: 'Root (/)', path: '/', icon: HardDrive },
  { label: 'Server Home', path: '/home', icon: Server },
  { label: 'etc', path: '/etc', icon: Folder },
  { label: 'var', path: '/var', icon: Folder },
  { label: 'usr', path: '/usr', icon: Folder },
  { label: 'opt', path: '/opt', icon: Folder },
  { label: 'tmp', path: '/tmp', icon: Folder },
];

export function NavigationPane({ currentPath, onNavigate }: NavigationPaneProps) {
  return (
    <PaneSidebar width={208} className="select-none">
      <PaneSidebarGroup label="Favorites">
        {FAVOURITES.map(item => (
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
