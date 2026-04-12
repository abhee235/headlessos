// M6: Navigation Pane - clean Sweep-style sidebar
// @see docs/phases/phase-6.md

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
import { cn } from '@/lib/utils';

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
    <div className="w-56 min-w-48 max-w-64 shrink-0 flex flex-col overflow-y-auto select-none bg-sidebar border-r border-black/6 dark:border-white/6">
      <div className="py-3 px-3">
        {/* Favorites */}
        <SectionHeader label="Favorites" />
        <div className="mb-6">
          {FAVOURITES.map(item => (
            <NavItemRow
              key={item.path + item.label}
              item={item}
              active={currentPath === item.path}
              onClick={() => onNavigate(item.path)}
            />
          ))}
        </div>

        {/* Locations */}
        <SectionHeader label="Locations" />
        <div className="mb-1">
          {LOCATIONS.map(item => (
            <NavItemRow
              key={item.path + item.label}
              item={item}
              active={currentPath === item.path}
              onClick={() => onNavigate(item.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// -- Section Header --

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pb-1.5 text-[13px] font-medium text-muted-foreground">
      {label}
    </div>
  );
}

// -- Nav Item Row --

function NavItemRow({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const IconComp = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-1.5 rounded-lg text-[14px] transition-colors text-left',
        active
          ? 'bg-primary/10 text-primary font-medium dark:bg-primary/15'
          : 'text-sidebar-foreground hover:bg-accent/40',
      )}
    >
      <IconComp className={cn(
        'w-4.5 h-4.5 shrink-0',
        active
          ? 'text-primary'
          : 'text-sidebar-foreground/70',
      )} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}
