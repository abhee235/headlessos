// M6.1: File List — multi-view file display with rich SVG icons
// @see docs/phases/phase-6.md

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Trash2,
  Pencil,
  FolderOpen,
  TerminalSquare,
  Scissors,
  Copy,
  ClipboardPaste,
  Folder,
  File,
  RefreshCw,
  LayoutGrid,
  List,
  SortAsc,
  Table2,
  Grid3x3,
  Info,
} from 'lucide-react';
import type { FileEntryData } from '../../lib/api';
import { deleteFile, renameFile, createDirectory, writeFile } from '../../lib/api';
import type { ViewMode } from './ExplorerToolbar';
import { FileIcon, FolderSVG } from '../ui/FileIcon';
import { usePreferencesStore, type IconSize } from '../../store/preferences-store';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FileProperties } from './FileProperties';
import { toast } from 'sonner';

interface FileListProps {
  entries: FileEntryData[];
  currentPath: string;
  onOpen: (entry: FileEntryData) => void;
  onNavigateUp: () => void;
  serverId: string;
  onRefresh: () => void;
  viewMode: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  /** Expose startCreate to parent so toolbar can trigger inline creation */
  onStartCreateRef?: React.MutableRefObject<((type: 'file' | 'folder') => void) | null>;
}

export function FileList({
  entries,
  currentPath,
  onOpen,
  onNavigateUp,
  serverId,
  onRefresh,
  viewMode,
  onViewModeChange,
  onStartCreateRef,
}: FileListProps) {
  const [renamingEntry, setRenamingEntry] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FileEntryData | null>(null);
  const [propertiesTarget, setPropertiesTarget] = useState<FileEntryData | null>(null);
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [createName, setCreateName] = useState('');
  const sortBy = usePreferencesStore(s => s.explorerSortBy);
  const sortAsc = usePreferencesStore(s => s.explorerSortAsc);
  const setSortBy = usePreferencesStore(s => s.setExplorerSortBy);
  const setSortAsc = usePreferencesStore(s => s.setExplorerSortAsc);

  const changeView = useCallback((mode: ViewMode) => {
    onViewModeChange?.(mode);
  }, [onViewModeChange]);

  // Windows-like: start creation with a default name
  const startCreate = useCallback((type: 'file' | 'folder') => {
    setCreatingType(type);
    setCreateName(type === 'folder' ? 'untitled folder' : 'untitled file');
  }, []);

  // Expose startCreate to parent (toolbar)
  useEffect(() => {
    if (onStartCreateRef) {
      onStartCreateRef.current = startCreate;
    }
    return () => {
      if (onStartCreateRef) {
        onStartCreateRef.current = null;
      }
    };
  }, [onStartCreateRef, startCreate]);

  const handleCreateSubmit = async (name?: string) => {
    const finalName = (name ?? createName).trim();
    if (!finalName) {
      setCreatingType(null);
      setCreateName('');
      return;
    }
    const fullPath =
      currentPath === '/' ? `/${finalName}` : `${currentPath}/${finalName}`;
    try {
      if (creatingType === 'folder') {
        await createDirectory(serverId, fullPath);
      } else {
        await writeFile(serverId, fullPath, '');
      }
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreatingType(null);
      setCreateName('');
    }
  };

  const cancelCreate = useCallback(() => {
    setCreatingType(null);
    setCreateName('');
  }, []);

  const handleDelete = async (entry: FileEntryData, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleteTarget(entry);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const fullPath =
      currentPath === '/' ? `/${deleteTarget.name}` : `${currentPath}/${deleteTarget.name}`;
    try {
      await deleteFile(serverId, fullPath);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteTarget(null);
    }
  };

  const startRename = (entry: FileEntryData, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenamingEntry(entry.name);
    setRenameValue(entry.name);
  };

  const submitRename = async (oldName: string) => {
    if (!renameValue || renameValue === oldName) {
      setRenamingEntry(null);
      return;
    }
    const oldPath =
      currentPath === '/' ? `/${oldName}` : `${currentPath}/${oldName}`;
    const newPath =
      currentPath === '/' ? `/${renameValue}` : `${currentPath}/${renameValue}`;
    try {
      await renameFile(serverId, oldPath, newPath);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setRenamingEntry(null);
    }
  };

  const renameProps = { renamingEntry, renameValue, setRenameValue, submitRename, setRenamingEntry };
  const actionProps = { startRename, handleDelete };
  const canGoUp = currentPath !== '/';

  const fileContextMenu = useCallback(
    (entry: FileEntryData) => (
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onOpen(entry)}>
          <FolderOpen className="w-4 h-4 mr-2 opacity-60" />
          Open
        </ContextMenuItem>
        <ContextMenuItem disabled>
          <TerminalSquare className="w-4 h-4 mr-2 opacity-60" />
          Open in Terminal
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>
          <Scissors className="w-4 h-4 mr-2 opacity-60" />
          Cut
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled>
          <Copy className="w-4 h-4 mr-2 opacity-60" />
          Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => startRename(entry)}>
          <Pencil className="w-4 h-4 mr-2 opacity-60" />
          Rename
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem danger onClick={() => setDeleteTarget(entry)}>
          <Trash2 className="w-4 h-4 mr-2 opacity-60" />
          Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setPropertiesTarget(entry)}>
          <Info className="w-4 h-4 mr-2 opacity-60" />
          Properties
          <ContextMenuShortcut>Alt+↩</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    ),
    [onOpen, startRename],
  );

  const emptyAreaContextMenu = useCallback(
    () => (
      <ContextMenuContent>
        <ContextMenuItem onClick={() => startCreate('folder')}>
          <Folder className="w-4 h-4 mr-2 opacity-60" />
          New Folder
          <ContextMenuShortcut>⇧⌘N</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => startCreate('file')}>
          <File className="w-4 h-4 mr-2 opacity-60" />
          New File
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>
          <ClipboardPaste className="w-4 h-4 mr-2 opacity-60" />
          Paste
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <LayoutGrid className="w-4 h-4 mr-2 opacity-60" />
            View
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => changeView('large-icons')}>
              <LayoutGrid className="w-4 h-4 mr-2 opacity-60" />
              Large Icons
              {viewMode === 'large-icons' && <span className="ml-auto text-[rgb(var(--primary))]">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => changeView('small-icons')}>
              <Grid3x3 className="w-4 h-4 mr-2 opacity-60" />
              Medium Icons
              {viewMode === 'small-icons' && <span className="ml-auto text-[rgb(var(--primary))]">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => changeView('list')}>
              <List className="w-4 h-4 mr-2 opacity-60" />
              List
              {viewMode === 'list' && <span className="ml-auto text-[rgb(var(--primary))]">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => changeView('details')}>
              <Table2 className="w-4 h-4 mr-2 opacity-60" />
              Details
              {viewMode === 'details' && <span className="ml-auto text-[rgb(var(--primary))]">✓</span>}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <SortAsc className="w-4 h-4 mr-2 opacity-60" />
            Sort by
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => { setSortBy('name'); setSortAsc(true); }}>
              Name
              {sortBy === 'name' && <span className="ml-auto text-[rgb(var(--primary))]">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { setSortBy('size'); setSortAsc(false); }}>
              Size
              {sortBy === 'size' && <span className="ml-auto text-[rgb(var(--primary))]">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { setSortBy('date'); setSortAsc(false); }}>
              Date Modified
              {sortBy === 'date' && <span className="ml-auto text-[rgb(var(--primary))]">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { setSortBy('type'); setSortAsc(true); }}>
              Type
              {sortBy === 'type' && <span className="ml-auto text-[rgb(var(--primary))]">✓</span>}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onRefresh()}>
          <RefreshCw className="w-4 h-4 mr-2 opacity-60" />
          Refresh
          <ContextMenuShortcut>F5</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    ),
    [onRefresh, startCreate, changeView, viewMode, sortBy, setSortBy, setSortAsc],
  );

  const contextMenuProps = { fileContextMenu, emptyAreaContextMenu };
  const createProps = { creatingType, createName, setCreateName, handleCreateSubmit, cancelCreate };

  const viewContent = (() => {
    switch (viewMode) {
      case 'details':
        return (
          <DetailsView
            entries={entries}
            canGoUp={canGoUp}
            onOpen={onOpen}
            onNavigateUp={onNavigateUp}
            {...renameProps}
            {...actionProps}
            {...contextMenuProps}
            {...createProps}
          />
        );
      case 'list':
        return (
          <ListView
            entries={entries}
            canGoUp={canGoUp}
            onOpen={onOpen}
            onNavigateUp={onNavigateUp}
            {...renameProps}
            {...actionProps}
            {...contextMenuProps}
            {...createProps}
          />
        );
      case 'small-icons':
        return (
          <IconGridView
            entries={entries}
            canGoUp={canGoUp}
            onOpen={onOpen}
            onNavigateUp={onNavigateUp}
            iconSize="medium"
            {...renameProps}
            {...actionProps}
            {...contextMenuProps}
            {...createProps}
          />
        );
      case 'large-icons':
        return (
          <IconGridView
            entries={entries}
            canGoUp={canGoUp}
            onOpen={onOpen}
            onNavigateUp={onNavigateUp}
            iconSize="large"
            {...renameProps}
            {...actionProps}
            {...contextMenuProps}
            {...createProps}
          />
        );
    }
  })();

  return (
    <>
      {viewContent}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete File"
        description={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />

      {/* File Properties dialog */}
      {propertiesTarget && (
        <FileProperties
          open={propertiesTarget !== null}
          onOpenChange={(open) => { if (!open) setPropertiesTarget(null); }}
          serverId={serverId}
          filePath={currentPath === '/' ? `/${propertiesTarget.name}` : `${currentPath}/${propertiesTarget.name}`}
          fileName={propertiesTarget.name}
          fileType={propertiesTarget.type}
        />
      )}
    </>
  );
}

// ── Shared types ────────────────────────────────────────

interface RenameProps {
  renamingEntry: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  submitRename: (oldName: string) => void;
  setRenamingEntry: (v: string | null) => void;
}

interface ActionProps {
  startRename: (entry: FileEntryData, e?: React.MouseEvent) => void;
  handleDelete: (entry: FileEntryData, e?: React.MouseEvent) => void;
}

interface ContextMenuProps {
  fileContextMenu: (entry: FileEntryData) => React.ReactNode;
  emptyAreaContextMenu: () => React.ReactNode;
}

interface CreateProps {
  creatingType: 'file' | 'folder' | null;
  createName: string;
  setCreateName: (v: string) => void;
  handleCreateSubmit: (name?: string) => Promise<void>;
  cancelCreate: () => void;
}

interface ViewProps extends RenameProps, ActionProps, ContextMenuProps, CreateProps {
  entries: FileEntryData[];
  canGoUp: boolean;
  onOpen: (entry: FileEntryData) => void;
  onNavigateUp: () => void;
}

// ── Details (table) ─────────────────────────────────────

function DetailsView({
  entries,
  canGoUp,
  onOpen,
  onNavigateUp,
  renamingEntry,
  renameValue,
  setRenameValue,
  submitRename,
  setRenamingEntry,
  fileContextMenu,
  emptyAreaContextMenu,
  creatingType,
  createName,
  setCreateName,
  handleCreateSubmit,
  cancelCreate,
}: ViewProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="overflow-auto h-full">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50/90 dark:bg-zinc-800/90 text-gray-500 dark:text-zinc-500 border-b border-gray-200 dark:border-zinc-700/60">
                <th className="text-left px-3 py-1.5 font-medium">Name</th>
                <th className="text-left px-3 py-1.5 font-medium w-20">Type</th>
                <th className="text-right px-3 py-1.5 font-medium w-20">Size</th>
                <th className="text-left px-3 py-1.5 font-medium w-36 hidden md:table-cell">Date modified</th>
                <th className="text-left px-3 py-1.5 font-medium w-24 hidden lg:table-cell">Permissions</th>
              </tr>
            </thead>
            <tbody>
              {canGoUp && (
                <tr
                  className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 cursor-pointer border-b border-gray-100 dark:border-zinc-800/30"
                  onClick={onNavigateUp}
                >
                  <td className="px-3 py-1 flex items-center gap-2 text-gray-400 dark:text-zinc-400">
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span>..</span>
                  </td>
                  <td className="px-3 py-1 text-gray-400 dark:text-zinc-600">Folder</td>
                  <td />
                  <td className="hidden md:table-cell" />
                  <td className="hidden lg:table-cell" />
                </tr>
              )}
              {entries.map(entry => (
                <ContextMenu key={entry.name}>
                  <ContextMenuTrigger asChild>
                    <tr
                      className="hover:bg-blue-50 dark:hover:bg-blue-600/10 cursor-pointer group border-b border-gray-100 dark:border-zinc-800/20"
                      onDoubleClick={() => onOpen(entry)}
                    >
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <FileIcon entry={entry} size="sm" className="shrink-0" />
                          {renamingEntry === entry.name ? (
                            <RenameInput
                              value={renameValue}
                              onChange={setRenameValue}
                              onSubmit={() => submitRename(entry.name)}
                              onCancel={() => setRenamingEntry(null)}
                            />
                          ) : (
                            <span className="text-gray-900 dark:text-zinc-200 truncate">{entry.name}</span>
                          )}
                          {entry.type === 'symlink' && entry.symlinkTarget && (
                            <span className="text-[10px] text-gray-400 dark:text-zinc-600">→ {entry.symlinkTarget}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1 text-gray-400 dark:text-zinc-500">{getTypeLabel(entry)}</td>
                      <td className="px-3 py-1 text-right text-gray-400 dark:text-zinc-500 font-mono">
                        {entry.type === 'directory' ? '' : formatSize(entry.size)}
                      </td>
                      <td className="px-3 py-1 text-gray-400 dark:text-zinc-500 hidden md:table-cell">
                        {formatDate(entry.modified)}
                      </td>
                      <td className="px-3 py-1 text-gray-300 dark:text-zinc-600 font-mono hidden lg:table-cell">
                        {entry.permissions.split(' ')[0]}
                      </td>
                    </tr>
                  </ContextMenuTrigger>
                  {fileContextMenu(entry)}
                </ContextMenu>
              ))}
              {/* Inline create at bottom */}
              {creatingType && (
                <tr>
                  <td colSpan={5}>
                    <InlineCreateInput
                      name={createName}
                      onChange={setCreateName}
                      onSubmit={handleCreateSubmit}
                      onCancel={cancelCreate}
                      type={creatingType}
                    />
                  </td>
                </tr>
              )}
              {entries.length === 0 && !canGoUp && !creatingType && <EmptyRow colSpan={5} />}
            </tbody>
          </table>
        </div>
      </ContextMenuTrigger>
      {emptyAreaContextMenu()}
    </ContextMenu>
  );
}

// ── List view ───────────────────────────────────────────

function ListView({
  entries,
  canGoUp,
  onOpen,
  onNavigateUp,
  renamingEntry,
  renameValue,
  setRenameValue,
  submitRename,
  setRenamingEntry,
  fileContextMenu,
  emptyAreaContextMenu,
  creatingType,
  createName,
  setCreateName,
  handleCreateSubmit,
  cancelCreate,
}: ViewProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="overflow-auto h-full p-1">
          <div className="flex flex-col gap-0">
            {canGoUp && (
              <button
                onClick={onNavigateUp}
                className="flex items-center gap-2 px-2 py-0.5 rounded text-xs text-gray-400 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800/60 hover:text-gray-900 dark:hover:text-zinc-200 text-left"
              >
                <ArrowUp className="w-3.5 h-3.5 shrink-0" />
                <span>..</span>
              </button>
            )}
            {entries.map(entry => (
              <ContextMenu key={entry.name}>
                <ContextMenuTrigger asChild>
                  <div
                    className="flex items-center gap-2 px-2 py-0.5 rounded text-xs hover:bg-blue-50 dark:hover:bg-blue-600/10 cursor-pointer"
                    onDoubleClick={() => onOpen(entry)}
                  >
                    <FileIcon entry={entry} size="sm" className="shrink-0" />
                    {renamingEntry === entry.name ? (
                      <RenameInput
                        value={renameValue}
                        onChange={setRenameValue}
                        onSubmit={() => submitRename(entry.name)}
                        onCancel={() => setRenamingEntry(null)}
                      />
                    ) : (
                      <span className="text-gray-900 dark:text-zinc-200 truncate flex-1">{entry.name}</span>
                    )}
                    <span className="text-gray-400 dark:text-zinc-600 font-mono text-[10px] shrink-0">
                      {entry.type === 'directory' ? '' : formatSize(entry.size)}
                    </span>
                  </div>
                </ContextMenuTrigger>
                {fileContextMenu(entry)}
              </ContextMenu>
            ))}
            {/* Inline create at bottom */}
            {creatingType && (
              <InlineCreateInput
                name={createName}
                onChange={setCreateName}
                onSubmit={handleCreateSubmit}
                onCancel={cancelCreate}
                type={creatingType}
              />
            )}
            {entries.length === 0 && !canGoUp && !creatingType && (
              <div className="text-center text-gray-400 dark:text-zinc-600 text-xs py-8">Empty directory</div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      {emptyAreaContextMenu()}
    </ContextMenu>
  );
}

// ── Icon grid (small + large) ───────────────────────────

const ICON_SIZE_CONFIG: Record<IconSize, { iconPx: number; fileSize: 'lg' | 'xl'; gridCols: string; cellPad: string; textSize: string }> = {
  medium: { iconPx: 40, fileSize: 'lg', gridCols: 'grid-cols-[repeat(auto-fill,minmax(88px,1fr))]', cellPad: 'p-2', textSize: 'text-[11px]' },
  large:  { iconPx: 60, fileSize: 'xl', gridCols: 'grid-cols-[repeat(auto-fill,minmax(110px,1fr))]', cellPad: 'p-3', textSize: 'text-xs' },
};

function IconGridView({
  entries,
  canGoUp,
  onOpen,
  onNavigateUp,
  iconSize,
  renamingEntry,
  renameValue,
  setRenameValue,
  submitRename,
  setRenamingEntry,
  fileContextMenu,
  emptyAreaContextMenu,
  creatingType,
  createName,
  setCreateName,
  handleCreateSubmit,
  cancelCreate,
}: ViewProps & { iconSize: IconSize }) {
  const cfg = ICON_SIZE_CONFIG[iconSize];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="overflow-auto h-full p-2">
          <div className={`grid ${cfg.gridCols} gap-1`}>
            {canGoUp && (
              <button
                onClick={onNavigateUp}
                className={`flex flex-col items-center justify-center ${cfg.cellPad} rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800/60 text-gray-400 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 transition-colors`}
              >
                <ArrowUp style={{ width: cfg.iconPx * 0.6, height: cfg.iconPx * 0.6 }} className="mb-1" />
                <span className={`${cfg.textSize} truncate max-w-full`}>..</span>
              </button>
            )}
            {entries.map(entry => (
              <ContextMenu key={entry.name}>
                <ContextMenuTrigger asChild>
                  <div
                    className={`flex flex-col items-center justify-center ${cfg.cellPad} rounded-lg hover:bg-blue-50 dark:hover:bg-blue-600/10 cursor-pointer transition-colors`}
                    onDoubleClick={() => onOpen(entry)}
                  >
                    <FileIcon entry={entry} size={cfg.fileSize} style={{ width: cfg.iconPx, height: cfg.iconPx }} />
                    {renamingEntry === entry.name ? (
                      <RenameInput
                        value={renameValue}
                        onChange={setRenameValue}
                        onSubmit={() => submitRename(entry.name)}
                        onCancel={() => setRenamingEntry(null)}
                        centered
                      />
                    ) : (
                      <span className={`${cfg.textSize} text-gray-800 dark:text-zinc-300 text-center truncate max-w-full mt-1 leading-tight`}>
                        {entry.name}
                      </span>
                    )}
                  </div>
                </ContextMenuTrigger>
                {fileContextMenu(entry)}
              </ContextMenu>
            ))}
            {/* Inline create card — Windows-like */}
            {creatingType && (
              <GridCreateCard
                name={createName}
                onChange={setCreateName}
                onSubmit={handleCreateSubmit}
                onCancel={cancelCreate}
                type={creatingType}
                iconPx={cfg.iconPx}
                textSize={cfg.textSize}
                cellPad={cfg.cellPad}
              />
            )}
          </div>
          {entries.length === 0 && !canGoUp && !creatingType && (
            <div className="text-center text-gray-400 dark:text-zinc-600 text-xs py-12">This folder is empty</div>
          )}
        </div>
      </ContextMenuTrigger>
      {emptyAreaContextMenu()}
    </ContextMenu>
  );
}

// ── Shared UI pieces ────────────────────────────────────

function RenameInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  centered,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  centered?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      // Select filename without extension (Windows behavior)
      const dotIdx = value.lastIndexOf('.');
      if (dotIdx > 0) {
        el.setSelectionRange(0, dotIdx);
      } else {
        el.select();
      }
    }
  }, []);

  return (
    <input
      ref={inputRef}
      className={`bg-white dark:bg-zinc-800 border border-blue-500 rounded px-1 py-0.5 text-gray-900 dark:text-zinc-200 text-xs outline-none w-full max-w-30 focus:ring-1 focus:ring-blue-500/30 ${centered ? 'text-center' : ''}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={() => onSubmit()}
      onKeyDown={e => {
        if (e.key === 'Enter') onSubmit();
        if (e.key === 'Escape') onCancel();
      }}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    />
  );
}

/** Inline create input for details/list views — appears at the bottom of the list */
function InlineCreateInput({
  name,
  onChange,
  onSubmit,
  onCancel,
  type,
}: {
  name: string;
  onChange: (v: string) => void;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
  type: 'file' | 'folder';
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      {type === 'folder' ? (
        <FolderSVG size={16} className="shrink-0" />
      ) : (
        <FileIcon type="file" name="untitled" size="sm" className="shrink-0" />
      )}
      <input
        ref={inputRef}
        className="bg-white dark:bg-zinc-800 border border-blue-500 rounded px-1.5 py-0.5 text-gray-900 dark:text-zinc-200 text-xs outline-none w-48 focus:ring-1 focus:ring-blue-500/30"
        value={name}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(name);
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => {
          if (name.trim()) onSubmit(name);
          else onCancel();
        }}
      />
    </div>
  );
}

/** Grid create card for icon views — Windows-like folder/file icon with editable name */
function GridCreateCard({
  name,
  onChange,
  onSubmit,
  onCancel,
  type,
  iconPx,
  textSize,
  cellPad,
}: {
  name: string;
  onChange: (v: string) => void;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
  type: 'file' | 'folder';
  iconPx: number;
  textSize: string;
  cellPad: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  return (
    <div className={`flex flex-col items-center justify-center ${cellPad} rounded-lg bg-blue-50/60 dark:bg-blue-600/10 border border-blue-300/50 dark:border-blue-500/20`}>
      {type === 'folder' ? (
        <FolderSVG size={iconPx} className="" />
      ) : (
        <FileIcon type="file" name="untitled" size={iconPx >= 50 ? 'xl' : 'lg'} />
      )}
      <input
        ref={inputRef}
        className={`${textSize} bg-white dark:bg-zinc-800 border border-blue-500 rounded px-1 py-0.5 text-gray-900 dark:text-zinc-200 outline-none text-center mt-1 w-full max-w-[90px] focus:ring-1 focus:ring-blue-500/30`}
        value={name}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(name);
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => {
          if (name.trim()) onSubmit(name);
          else onCancel();
        }}
      />
    </div>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-gray-400 dark:text-zinc-600 text-xs">
        This folder is empty
      </td>
    </tr>
  );
}

function getTypeLabel(entry: FileEntryData): string {
  if (entry.type === 'directory') return 'Folder';
  if (entry.type === 'symlink') return 'Shortcut';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext && ext !== entry.name.toLowerCase()) return `${ext.toUpperCase()} File`;
  return 'File';
}

// ── Helpers ─────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[i]}`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
