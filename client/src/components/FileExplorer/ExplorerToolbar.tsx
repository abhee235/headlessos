// M2.5: Explorer Toolbar — view mode switcher, sort, new file/folder actions
// @see docs/phases/phase-2.md

import {
  LayoutGrid,
  List,
  Table2,
  Folder,
  File,
  Grid3x3,
} from 'lucide-react';

export type ViewMode = 'details' | 'list' | 'small-icons' | 'large-icons';

interface ExplorerToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  serverId: string;
  currentPath: string;
  onActionComplete: () => void;
  entryCount: number;
  onStartCreate: (type: 'file' | 'folder') => void;
}

const VIEW_MODES: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
  { mode: 'large-icons', icon: <LayoutGrid className="w-3.5 h-3.5" />, label: 'Large icons' },
  { mode: 'small-icons', icon: <Grid3x3 className="w-3.5 h-3.5" />, label: 'Medium icons' },
  { mode: 'list', icon: <List className="w-3.5 h-3.5" />, label: 'List' },
  { mode: 'details', icon: <Table2 className="w-3.5 h-3.5" />, label: 'Details' },
];

export function ExplorerToolbar({
  viewMode,
  onViewModeChange,
  serverId,
  currentPath,
  onActionComplete,
  entryCount,
  onStartCreate,
}: ExplorerToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[rgb(var(--chrome))] border-b border-gray-200/60 dark:border-zinc-700/40">
      {/* New file / folder — just buttons, inline create handled by FileList */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onStartCreate('file')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 text-xs transition-colors"
          title="New File"
        >
          <File className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New File</span>
        </button>
        <button
          onClick={() => onStartCreate('folder')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 text-xs transition-colors"
          title="New Folder"
        >
          <Folder className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Folder</span>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-gray-200 dark:bg-zinc-700/50 mx-1" />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Item count */}
      <span className="text-[10px] text-gray-400 dark:text-zinc-600 mr-2 tabular-nums">{entryCount} items</span>

      {/* View mode switcher */}
      <div className="flex items-center bg-gray-100 dark:bg-zinc-800/80 rounded-md border border-gray-200 dark:border-zinc-700/50">
        {VIEW_MODES.map((vm, i) => (
          <button
            key={vm.mode}
            onClick={() => onViewModeChange(vm.mode)}
            className={`p-1.5 transition-colors ${
              viewMode === vm.mode
                ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                : 'text-gray-400 dark:text-zinc-500 hover:text-gray-800 dark:hover:text-zinc-300 hover:bg-gray-200/50 dark:hover:bg-zinc-700/50'
            } ${i === 0 ? 'rounded-l-md' : ''} ${i === VIEW_MODES.length - 1 ? 'rounded-r-md' : ''}`}
            title={vm.label}
          >
            {vm.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
