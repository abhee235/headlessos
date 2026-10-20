// M6: Explorer Toolbar — view mode switcher, create/search actions
// EX8.6: LumenOS v3 — transparent row of round ghost icon buttons and pill
// actions. Labels and the search field expand with the `explorer` container
// (set by FileExplorerView), so narrow windows collapse to icon buttons.
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

import {
  LayoutGrid,
  List,
  Table2,
  FolderPlus,
  FilePlus,
  Grid3x3,
  PanelLeftClose,
  Columns2,
  Search,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'details' | 'list' | 'small-icons' | 'large-icons';

// ── Shared round icon button (also used by AddressBar) ──────────

/** 34px round ghost icon button; `active` tints it with the accent. */
export function ExplorerIconButton({
  active = false,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-35',
        active
          ? 'bg-accent-soft text-accent-text'
          : 'text-label-2 hover:bg-fill hover:text-foreground active:bg-fill-2',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Lucide glyph sizing used across the explorer chrome (18px, 1.75 stroke). */
export const EXPLORER_ICON = 'h-[18px] w-[18px] shrink-0';

// ── Toolbar ──────────────────────────────────────────────────────

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

const VIEW_MODES: { mode: ViewMode; icon: LucideIcon; label: string }[] = [
  { mode: 'large-icons', icon: LayoutGrid, label: 'Large icons' },
  { mode: 'small-icons', icon: Grid3x3, label: 'Medium icons' },
  { mode: 'list', icon: List, label: 'List' },
  { mode: 'details', icon: Table2, label: 'Details' },
];

export function ExplorerToolbar({
  viewMode,
  onViewModeChange,
  onStartCreate,
  splitPane,
  onToggleSplitPane,
  onOpenSearch,
  trashMode,
  onEmptyTrash,
}: ExplorerToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {trashMode ? (
        /* ── Trash mode toolbar ── */
        <ToolbarAction
          icon={Trash2}
          label="Empty Recycle Bin"
          title="Empty Recycle Bin"
          onClick={onEmptyTrash}
          danger
        />
      ) : (
        /* ── Normal mode toolbar ── */
        <>
          {/* Search — a pill field that opens the search dialog */}
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className={cn(
                'flex h-[34px] w-[34px] shrink-0 items-center justify-center gap-2 rounded-full border border-edge bg-field text-label-3',
                'transition-[border-color,color] duration-150 hover:border-edge-2 hover:text-label-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                '@3xl/explorer:mr-1 @3xl/explorer:w-[200px] @3xl/explorer:justify-start @3xl/explorer:px-3',
              )}
              title="Search Files (Ctrl+F)"
            >
              <Search className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
              <span className="hidden flex-1 truncate text-left text-[13px] @3xl/explorer:inline">Search files</span>
            </button>
          )}

          {/* New file / folder */}
          <ToolbarAction icon={FilePlus} label="New File" title="New File" onClick={() => onStartCreate('file')} />
          <ToolbarAction icon={FolderPlus} label="New Folder" title="New Folder" onClick={() => onStartCreate('folder')} />
        </>
      )}

      {/* Split pane toggle */}
      {onToggleSplitPane && (
        <ExplorerIconButton
          onClick={onToggleSplitPane}
          active={splitPane}
          title={splitPane ? 'Close split pane' : 'Split pane view'}
        >
          {splitPane
            ? <PanelLeftClose className={EXPLORER_ICON} strokeWidth={1.75} />
            : <Columns2 className={EXPLORER_ICON} strokeWidth={1.75} />}
        </ExplorerIconButton>
      )}

      {/* View mode switcher — round buttons in a fill capsule */}
      <div className="ml-1 flex shrink-0 items-center gap-0.5 rounded-full bg-fill p-[3px]">
        {VIEW_MODES.map(({ mode, icon: Icon, label }) => (
          <button
            type="button"
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-full transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              viewMode === mode
                ? 'bg-accent-soft text-accent-text'
                : 'text-label-2 hover:bg-fill-2 hover:text-foreground',
            )}
            title={label}
            aria-pressed={viewMode === mode}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Pill action: icon-only below the `explorer` @4xl width ─────────

function ToolbarAction({
  icon: Icon,
  label,
  title,
  onClick,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-[34px] shrink-0 items-center gap-2 rounded-full px-2 text-[13px] font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        '@4xl/explorer:px-3',
        danger
          ? 'text-danger hover:bg-danger/12'
          : 'text-foreground hover:bg-fill active:bg-fill-2',
      )}
      title={title}
    >
      <Icon className={cn(EXPLORER_ICON, !danger && 'text-label-2')} strokeWidth={1.75} />
      <span className="hidden @4xl/explorer:inline">{label}</span>
    </button>
  );
}
