// M6: Explorer Toolbar — modern view mode switcher with rounded pill buttons
// @see docs/phases/phase-6.md

import {
  LayoutGrid,
  List,
  Table2,
  Folder,
  File,
  Grid3x3,
  PanelLeftClose,
  Columns2,
  Search,
  RotateCcw,
  Trash2,
} from 'lucide-react';

export type ViewMode = 'details' | 'list' | 'small-icons' | 'large-icons';

interface ExplorerToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  serverId: string;
  currentPath: string;
  onActionComplete: () => void;
  onStartCreate: (type: 'file' | 'folder') => void;
  splitPane?: boolean;
  onToggleSplitPane?: () => void;
  onOpenSearch?: () => void;
  /** When true, show trash actions (Restore / Empty Bin) instead of normal file actions */
  trashMode?: boolean;
  onEmptyTrash?: () => void;
}

const VIEW_MODES: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
  { mode: 'large-icons', icon: <LayoutGrid className="w-4 h-4" />, label: 'Large icons' },
  { mode: 'small-icons', icon: <Grid3x3 className="w-4 h-4" />, label: 'Medium icons' },
  { mode: 'list', icon: <List className="w-4 h-4" />, label: 'List' },
  { mode: 'details', icon: <Table2 className="w-4 h-4" />, label: 'Details' },
];

export function ExplorerToolbar({
  viewMode,
  onViewModeChange,
  serverId,
  currentPath,
  onActionComplete,
  onStartCreate,
  splitPane,
  onToggleSplitPane,
  onOpenSearch,
  trashMode,
  onEmptyTrash,
}: ExplorerToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
      {trashMode ? (
        /* ── Trash mode toolbar ── */
        <button
          onClick={onEmptyTrash}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-destructive/10 text-sidebar-foreground hover:text-destructive text-[13px] transition-all duration-150"
          title="Empty Recycle Bin"
        >
          <Trash2 className="w-4 h-4 text-sidebar-foreground/70" />
          <span className="hidden sm:inline">Empty Recycle Bin</span>
        </button>
      ) : (
        /* ── Normal mode toolbar ── */
        <>
          {/* New file / folder */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onStartCreate('file')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/40 text-sidebar-foreground hover:text-foreground text-[13px] transition-all duration-150"
              title="New File"
            >
              <File className="w-4 h-4 text-sidebar-foreground/70" />
              <span className="hidden sm:inline">New File</span>
            </button>
            <button
              onClick={() => onStartCreate('folder')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/40 text-sidebar-foreground hover:text-foreground text-[13px] transition-all duration-150"
              title="New Folder"
            >
              <Folder className="w-4 h-4 text-sidebar-foreground/70" />
              <span className="hidden sm:inline">New Folder</span>
            </button>
          </div>

          {/* Separator */}
          <div className="w-px h-4 bg-border/30" />

          {/* Search button */}
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/40 text-sidebar-foreground hover:text-foreground text-[13px] transition-all duration-150"
              title="Search Files (Ctrl+F)"
            >
              <Search className="w-4 h-4 text-sidebar-foreground/70" />
              <span className="hidden sm:inline">Search</span>
            </button>
          )}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Split pane toggle */}
      {onToggleSplitPane && (
        <button
          onClick={onToggleSplitPane}
          className={`p-2 rounded-lg transition-all duration-150 ${
            splitPane
              ? 'bg-primary/10 text-primary'
              : 'text-foreground/50 hover:text-foreground hover:bg-foreground/4'
          }`}
          title={splitPane ? 'Close split pane' : 'Split pane view'}
        >
          {splitPane ? <PanelLeftClose className="w-4 h-4" /> : <Columns2 className="w-4 h-4" />}
        </button>
      )}

      {/* View mode switcher — pill capsule */}
      <div className="flex items-center bg-foreground/[0.05] rounded-full p-0.5">
        {VIEW_MODES.map((vm) => (
          <button
            key={vm.mode}
            onClick={() => onViewModeChange(vm.mode)}
            className={`p-2 rounded-full transition-all duration-150 ${
              viewMode === vm.mode
                ? 'bg-background text-primary shadow-sm'
                : 'text-foreground/50 hover:text-foreground'
            }`}
            title={vm.label}
          >
            {vm.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
