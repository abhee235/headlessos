// M2.5: Navigation Pane — Windows-style left sidebar with quick access, tree nav
// @see docs/phases/phase-2.md

import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Star,
  HardDrive,
  Home,
  Download,
  FolderOpen,
  FileText,
  Monitor,
  Folder,
  Users,
} from 'lucide-react';

interface NavigationPaneProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const QUICK_ACCESS: NavItem[] = [
  { label: 'Home', path: '/home', icon: <Home className="w-3.5 h-3.5" /> },
  { label: 'Desktop', path: '/home/testuser/Desktop', icon: <Monitor className="w-3.5 h-3.5" /> },
  { label: 'Documents', path: '/home/testuser/Documents', icon: <FileText className="w-3.5 h-3.5" /> },
  { label: 'Downloads', path: '/home/testuser/Downloads', icon: <Download className="w-3.5 h-3.5" /> },
];

const SYSTEM_LOCATIONS: NavItem[] = [
  { label: 'Root (/)', path: '/', icon: <HardDrive className="w-3.5 h-3.5" /> },
  { label: 'etc', path: '/etc', icon: <Folder className="w-3.5 h-3.5" /> },
  { label: 'var', path: '/var', icon: <Folder className="w-3.5 h-3.5" /> },
  { label: 'tmp', path: '/tmp', icon: <Folder className="w-3.5 h-3.5" /> },
  { label: 'usr', path: '/usr', icon: <Folder className="w-3.5 h-3.5" /> },
  { label: 'opt', path: '/opt', icon: <Folder className="w-3.5 h-3.5" /> },
];

export function NavigationPane({ currentPath, onNavigate }: NavigationPaneProps) {
  const [quickAccessOpen, setQuickAccessOpen] = useState(true);
  const [thispcOpen, setThispcOpen] = useState(true);

  return (
    <div className="w-48 min-w-45 max-w-55 bg-[rgb(var(--sidebar))] border-r border-gray-200 dark:border-zinc-700/60 overflow-y-auto py-1 select-none shrink-0">
      {/* Quick Access */}
      <SectionHeader
        label="Quick access"
        icon={<Star className="w-3 h-3 text-yellow-500" />}
        open={quickAccessOpen}
        onToggle={() => setQuickAccessOpen(!quickAccessOpen)}
      />
      {quickAccessOpen && (
        <div className="mb-1">
          {QUICK_ACCESS.map(item => (
            <NavItemRow
              key={item.path}
              item={item}
              active={currentPath === item.path}
              onClick={() => onNavigate(item.path)}
            />
          ))}
        </div>
      )}

      {/* This PC */}
      <SectionHeader
        label="This PC"
        icon={<Monitor className="w-3 h-3 text-blue-400" />}
        open={thispcOpen}
        onToggle={() => setThispcOpen(!thispcOpen)}
      />
      {thispcOpen && (
        <div className="mb-1">
          {SYSTEM_LOCATIONS.map(item => (
            <NavItemRow
              key={item.path}
              item={item}
              active={currentPath === item.path}
              onClick={() => onNavigate(item.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  label,
  icon,
  open,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 hover:bg-gray-100/50 dark:hover:bg-zinc-800/50 transition-colors"
    >
      {open ? (
        <ChevronDown className="w-3 h-3 text-gray-400 dark:text-zinc-500" />
      ) : (
        <ChevronRight className="w-3 h-3 text-gray-400 dark:text-zinc-500" />
      )}
      {icon}
      <span>{label}</span>
    </button>
  );
}

function NavItemRow({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-4 py-1 text-xs transition-colors ${
        active
          ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300 border-r-2 border-blue-500'
          : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800/60'
      }`}
    >
      <span className={active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-zinc-500'}>{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </button>
  );
}
