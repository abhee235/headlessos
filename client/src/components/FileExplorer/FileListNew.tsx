// M6.1: File List — multi-view file display with rich SVG icons
// EX8.6: LumenOS v3 — 34px rows, 14px grid tiles, accent-soft selection.
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

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
  RotateCcw,
} from 'lucide-react';
import type { FileEntryData } from '../../lib/api';
import { deleteFile, renameFile, createDirectory, writeFile, copyFile, moveFile, trashFile } from '../../lib/api';
import type { ViewMode } from './ExplorerToolbar';
import { FileIcon, FolderSVG } from '../ui/FileIcon';
import { usePreferencesStore, type IconSize } from '../../store/preferences-store';
import { useClipboardStore, type ClipboardEntry } from '../../store/clipboard-store';
import { useSelection } from '../../hooks/useSelection';
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
import { cn } from '@/lib/utils';
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
  /** Report selection count changes to parent */
  onSelectionChange?: (count: number) => void;
  /** When true, show trash-specific context menus (Restore / Delete Permanently) */
  trashMode?: boolean;
  /** Called when user wants to restore a trash item */
  onRestoreItem?: (entry: FileEntryData) => void;
  /** Called when user wants to permanently delete a trash item */
  onDeleteItem?: (entry: FileEntryData) => void;
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
  onSelectionChange,
  trashMode,
  onRestoreItem,
  onDeleteItem,
}: FileListProps) {
  const [renamingEntry, setRenamingEntry] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FileEntryData | null>(null);
  const [permanentDelete, setPermanentDelete] = useState(false);
  const [propertiesTarget, setPropertiesTarget] = useState<FileEntryData | null>(null);
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [createName, setCreateName] = useState('');
  const sortBy = usePreferencesStore(s => s.explorerSortBy);
  const sortAsc = usePreferencesStore(s => s.explorerSortAsc);
  const setSortBy = usePreferencesStore(s => s.setExplorerSortBy);
  const setSortAsc = usePreferencesStore(s => s.setExplorerSortAsc);

  // ── Selection ──
  const { selectedKeys, isSelected, handleSelect, clearSelection, selectAll, getSelectedItems, count: selectedCount } = useSelection({
    items: entries,
    getKey: (e) => e.name,
  });

  // Report selection changes to parent
  useEffect(() => {
    onSelectionChange?.(selectedCount);
  }, [selectedCount, onSelectionChange]);

  // ── Clipboard ──
  const clipboardEntries = useClipboardStore(s => s.entries);
  const clipboardOp = useClipboardStore(s => s.operation);
  const clipboardCopy = useClipboardStore(s => s.copy);
  const clipboardCut = useClipboardStore(s => s.cut);
  const clipboardClear = useClipboardStore(s => s.clear);
  const hasClipboard = clipboardEntries.length > 0;

  const toClipboardEntries = useCallback((items: FileEntryData[]): ClipboardEntry[] => {
    return items.map(e => ({
      serverId,
      path: currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`,
      name: e.name,
      isDirectory: e.type === 'directory',
    }));
  }, [serverId, currentPath]);

  const handleCopy = useCallback(() => {
    const items = getSelectedItems();
    if (items.length === 0) return;
    clipboardCopy(toClipboardEntries(items), currentPath);
    toast.success(`${items.length} item${items.length > 1 ? 's' : ''} copied`);
  }, [getSelectedItems, clipboardCopy, toClipboardEntries, currentPath]);

  const handleCut = useCallback(() => {
    const items = getSelectedItems();
    if (items.length === 0) return;
    clipboardCut(toClipboardEntries(items), currentPath);
    toast.success(`${items.length} item${items.length > 1 ? 's' : ''} cut`);
  }, [getSelectedItems, clipboardCut, toClipboardEntries, currentPath]);

  const handlePaste = useCallback(async () => {
    if (!hasClipboard) return;
    try {
      for (const entry of clipboardEntries) {
        const destName = entry.name;
        const destPath = currentPath === '/' ? `/${destName}` : `${currentPath}/${destName}`;
        if (clipboardOp === 'copy') {
          await copyFile(entry.serverId, entry.path, destPath);
        } else {
          await moveFile(entry.serverId, entry.path, destPath);
        }
      }
      if (clipboardOp === 'cut') clipboardClear();
      toast.success(`${clipboardEntries.length} item${clipboardEntries.length > 1 ? 's' : ''} pasted`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Paste failed');
    }
  }, [hasClipboard, clipboardEntries, clipboardOp, currentPath, clipboardClear, onRefresh]);

  // Clear selection when directory changes
  useEffect(() => {
    clearSelection();
  }, [currentPath, clearSelection]);

  // ── Keyboard shortcuts for file explorer ──
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      // Don't interfere with input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const isMeta = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd+C — Copy
      if (isMeta && e.key === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }

      // Ctrl/Cmd+X — Cut
      if (isMeta && e.key === 'x') {
        e.preventDefault();
        handleCut();
        return;
      }

      // Ctrl/Cmd+V — Paste
      if (isMeta && e.key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Ctrl/Cmd+A — Select all
      if (isMeta && e.key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }

      // Delete/Backspace — Move to Trash (Shift+Delete for permanent)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCount > 0) {
        e.preventDefault();
        const items = getSelectedItems();
        if (e.shiftKey) setPermanentDelete(true);
        if (items.length === 1) {
          setDeleteTarget(items[0]);
        } else if (items.length > 1) {
          setDeleteTarget(items[0]);
        }
        return;
      }

      // F2 — Rename selected
      if (e.key === 'F2' && selectedCount === 1) {
        e.preventDefault();
        const items = getSelectedItems();
        if (items.length === 1) {
          startRename(items[0]);
        }
        return;
      }

      // F5 — Refresh
      if (e.key === 'F5') {
        e.preventDefault();
        onRefresh();
        return;
      }

      // Enter — Open selected
      if (e.key === 'Enter' && selectedCount === 1) {
        e.preventDefault();
        const items = getSelectedItems();
        if (items.length === 1) onOpen(items[0]);
        return;
      }

      // Escape — Clear selection
      if (e.key === 'Escape') {
        clearSelection();
        return;
      }
    };

    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [handleCopy, handleCut, handlePaste, selectAll, selectedCount, getSelectedItems, clearSelection, onRefresh, onOpen]);

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
      if (permanentDelete) {
        await deleteFile(serverId, fullPath);
        toast.success(`Permanently deleted "${deleteTarget.name}"`);
      } else {
        await trashFile(serverId, fullPath);
        toast.success(`Moved "${deleteTarget.name}" to Recycle Bin`);
      }
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteTarget(null);
      setPermanentDelete(false);
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
    (entry: FileEntryData) => trashMode ? (
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onRestoreItem?.(entry)}>
          <RotateCcw className="w-4 h-4 mr-2 opacity-60" />
          Restore
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem danger onClick={() => onDeleteItem?.(entry)}>
          <Trash2 className="w-4 h-4 mr-2 opacity-60" />
          Delete Permanently
          <ContextMenuShortcut>⇧⌫</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setPropertiesTarget(entry)}>
          <Info className="w-4 h-4 mr-2 opacity-60" />
          Properties
          <ContextMenuShortcut>Alt+↩</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    ) : (
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
        <ContextMenuItem onClick={() => {
          // If item not in selection, select it first
          if (!isSelected(entry.name)) {
            handleSelect(entry.name, { ctrlKey: false, metaKey: false, shiftKey: false });
          }
          // Delay to let selection update
          setTimeout(() => {
            const items: ClipboardEntry[] = [{
              serverId,
              path: currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`,
              name: entry.name,
              isDirectory: entry.type === 'directory',
            }];
            clipboardCut(items, currentPath);
            toast.success('Cut to clipboard');
          }, 0);
        }}>
          <Scissors className="w-4 h-4 mr-2 opacity-60" />
          Cut
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const items: ClipboardEntry[] = [{
            serverId,
            path: currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`,
            name: entry.name,
            isDirectory: entry.type === 'directory',
          }];
          clipboardCopy(items, currentPath);
          toast.success('Copied to clipboard');
        }}>
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
        <ContextMenuItem onClick={() => { setPermanentDelete(false); setDeleteTarget(entry); }}>
          <Trash2 className="w-4 h-4 mr-2 opacity-60" />
          Move to Trash
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem danger onClick={() => { setPermanentDelete(true); setDeleteTarget(entry); }}>
          <Trash2 className="w-4 h-4 mr-2 opacity-60" />
          Delete Permanently
          <ContextMenuShortcut>⇧⌫</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setPropertiesTarget(entry)}>
          <Info className="w-4 h-4 mr-2 opacity-60" />
          Properties
          <ContextMenuShortcut>Alt+↩</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    ),
    [onOpen, startRename, serverId, currentPath, clipboardCopy, clipboardCut, isSelected, handleSelect, trashMode, onRestoreItem, onDeleteItem],
  );

  const emptyAreaContextMenu = useCallback(
    () => (
      <ContextMenuContent>
        {!trashMode && (
          <>
            <ContextMenuItem onClick={() => startCreate('folder')}>
              <FileIcon type="directory" size="sm" />
              New Folder
              <ContextMenuShortcut>⇧⌘N</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => startCreate('file')}>
              <FileIcon type="file" size="sm" />
              New File
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handlePaste} disabled={!hasClipboard}>
              <ClipboardPaste className="w-4 h-4 mr-2 opacity-60" />
              Paste {hasClipboard ? `(${clipboardEntries.length})` : ''}
              <ContextMenuShortcut>⌘V</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <LayoutGrid className="w-4 h-4 mr-2 opacity-60" />
            View
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => changeView('large-icons')}>
              <LayoutGrid className="w-4 h-4 mr-2 opacity-60" />
              Large Icons
              {viewMode === 'large-icons' && <span className="ml-auto text-accent-text">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => changeView('small-icons')}>
              <Grid3x3 className="w-4 h-4 mr-2 opacity-60" />
              Medium Icons
              {viewMode === 'small-icons' && <span className="ml-auto text-accent-text">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => changeView('list')}>
              <List className="w-4 h-4 mr-2 opacity-60" />
              List
              {viewMode === 'list' && <span className="ml-auto text-accent-text">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => changeView('details')}>
              <Table2 className="w-4 h-4 mr-2 opacity-60" />
              Details
              {viewMode === 'details' && <span className="ml-auto text-accent-text">✓</span>}
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
              {sortBy === 'name' && <span className="ml-auto text-accent-text">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { setSortBy('size'); setSortAsc(false); }}>
              Size
              {sortBy === 'size' && <span className="ml-auto text-accent-text">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { setSortBy('date'); setSortAsc(false); }}>
              Date Modified
              {sortBy === 'date' && <span className="ml-auto text-accent-text">✓</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { setSortBy('type'); setSortAsc(true); }}>
              Type
              {sortBy === 'type' && <span className="ml-auto text-accent-text">✓</span>}
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
    [onRefresh, startCreate, changeView, viewMode, sortBy, setSortBy, setSortAsc, handlePaste, hasClipboard, clipboardEntries, trashMode],
  );

  const contextMenuProps = { fileContextMenu, emptyAreaContextMenu };
  const createProps = { creatingType, createName, setCreateName, handleCreateSubmit, cancelCreate };

  // Build a set of clipboard entry names for cut dimming (only items in same directory)
  const clipboardEntryPaths = new Set(clipboardOp === 'cut' ? clipboardEntries.map(e => e.name) : []);
  const selectionProps: SelectionProps = { isSelected, handleSelect, clearSelection, clipboardOp, clipboardEntryPaths };

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
            {...selectionProps}
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
            {...selectionProps}
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
            {...selectionProps}
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
            {...selectionProps}
          />
        );
    }
  })();

  return (
    <>
      <div ref={containerRef} tabIndex={0} className="outline-none h-full" onClick={(e) => {
        // Click on empty space clears selection
        if (e.target === e.currentTarget) clearSelection();
      }}>
        {viewContent}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setPermanentDelete(false); } }}
        title={permanentDelete ? 'Delete Permanently' : 'Move to Trash'}
        description={deleteTarget
          ? permanentDelete
            ? `Are you sure you want to permanently delete "${deleteTarget.name}"? This action cannot be undone.`
            : `Move "${deleteTarget.name}" to the Recycle Bin? You can restore it later.`
          : ''}
        confirmLabel={permanentDelete ? 'Delete Permanently' : 'Move to Trash'}
        variant={permanentDelete ? 'destructive' : 'default'}
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

interface SelectionProps {
  isSelected: (key: string) => boolean;
  handleSelect: (key: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  clearSelection: () => void;
  clipboardOp: 'copy' | 'cut' | null;
  clipboardEntryPaths: Set<string>;
}

interface ViewProps extends RenameProps, ActionProps, ContextMenuProps, CreateProps, SelectionProps {
  entries: FileEntryData[];
  canGoUp: boolean;
  onOpen: (entry: FileEntryData) => void;
  onNavigateUp: () => void;
}

// ── Shared Lumen recipes ────────────────────────────────

/** Row hover / selection — `bg-accent-soft text-accent-text` when selected. */
const rowTone = (selected: boolean) =>
  selected ? 'bg-accent-soft text-accent-text' : 'text-foreground hover:bg-fill';

/** Rename / inline-create field: 6px radius, 1px accent border, bg-mat-thick. */
const RENAME_FIELD =
  'rounded-[6px] border border-accent-solid bg-mat-thick px-1.5 py-0.5 text-[13px] text-foreground outline-none focus:ring-[3px] focus:ring-accent-soft';

/**
 * Details columns: Name | Date modified | Type | Size | Permissions.
 * Date and permissions appear as the `list` container grows.
 */
const DETAILS_COLS =
  'grid grid-cols-[minmax(0,1fr)_112px_72px] gap-x-3 @2xl/list:grid-cols-[minmax(0,1fr)_168px_112px_72px] @4xl/list:grid-cols-[minmax(0,1fr)_168px_112px_72px_96px]';
const COL_DATE = 'hidden truncate @2xl/list:block';
const COL_PERMS = 'hidden truncate @4xl/list:block';

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
  isSelected,
  handleSelect,
  clearSelection,
  clipboardEntryPaths,
}: ViewProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div role="table" className="@container/list flex h-full flex-col pl-3 pr-2">
          {/* Header stays put while the rows scroll beneath it */}
          <div role="rowgroup" className="shrink-0 overflow-hidden pr-2 [scrollbar-gutter:stable]">
            <div
              role="row"
              className={`${DETAILS_COLS} h-8 items-center px-3 text-[11px] font-bold uppercase tracking-[.06em] text-label-3`}
            >
              <div role="columnheader" className="truncate">Name</div>
              <div role="columnheader" className={COL_DATE}>Date modified</div>
              <div role="columnheader" className="truncate">Type</div>
              <div role="columnheader" className="truncate">Size</div>
              <div role="columnheader" className={COL_PERMS}>Permissions</div>
            </div>
          </div>

          <div role="rowgroup" className="min-h-0 flex-1 overflow-y-auto pb-2 pr-2 [scrollbar-gutter:stable]">
            {canGoUp && (
              <div
                role="row"
                className={`${DETAILS_COLS} h-[34px] cursor-pointer items-center rounded-[10px] px-3 text-[13px] text-label-2 transition-colors duration-150 hover:bg-fill`}
                onClick={onNavigateUp}
              >
                <div role="cell" className="flex min-w-0 items-center gap-2.5">
                  <ArrowUp className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>..</span>
                </div>
                <div role="cell" className={COL_DATE} />
                <div role="cell">Folder</div>
                <div role="cell" />
                <div role="cell" className={COL_PERMS} />
              </div>
            )}
            {entries.map(entry => {
              const selected = isSelected(entry.name);
              const isCut = clipboardEntryPaths.has(entry.name);
              return (
              <ContextMenu key={entry.name}>
                <ContextMenuTrigger asChild>
                  <div
                    role="row"
                    aria-selected={selected}
                    className={`${DETAILS_COLS} h-[34px] cursor-pointer items-center rounded-[10px] px-3 text-[13px] transition-colors duration-150 ${rowTone(selected)} ${isCut ? 'opacity-50' : ''}`}
                    onClick={(e) => handleSelect(entry.name, e)}
                    onDoubleClick={() => onOpen(entry)}
                  >
                    <div role="cell" className="flex min-w-0 items-center gap-2.5">
                      <FileIcon entry={entry} size="sm" className="shrink-0" />
                      {renamingEntry === entry.name ? (
                        <RenameInput
                          value={renameValue}
                          onChange={setRenameValue}
                          onSubmit={() => submitRename(entry.name)}
                          onCancel={() => setRenamingEntry(null)}
                        />
                      ) : (
                        <span className="truncate">{entry.name}</span>
                      )}
                      {entry.type === 'symlink' && entry.symlinkTarget && (
                        <span className="truncate text-[11px] text-label-3">→ {entry.symlinkTarget}</span>
                      )}
                    </div>
                    <div role="cell" className={`${COL_DATE} text-label-2`}>
                      {formatDate(entry.modified)}
                    </div>
                    <div role="cell" className="truncate text-label-2">{getTypeLabel(entry)}</div>
                    <div role="cell" className="truncate text-label-2">
                      {entry.type === 'directory' ? '' : formatSize(entry.size)}
                    </div>
                    <div role="cell" className={`${COL_PERMS} font-mono text-xs text-label-3`}>
                      {entry.permissions.split(' ')[0]}
                    </div>
                  </div>
                </ContextMenuTrigger>
                {fileContextMenu(entry)}
              </ContextMenu>
              );
            })}
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
            {entries.length === 0 && !canGoUp && !creatingType && <EmptyState />}
          </div>
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
  isSelected,
  handleSelect,
  clearSelection,
  clipboardEntryPaths,
}: ViewProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="h-full overflow-auto px-3 pb-2">
          <div className="flex flex-col gap-px">
            {canGoUp && (
              <button
                onClick={onNavigateUp}
                className="flex h-[30px] items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13px] text-label-2 transition-colors duration-150 hover:bg-fill hover:text-foreground"
              >
                <ArrowUp className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>..</span>
              </button>
            )}
            {entries.map(entry => {
              const selected = isSelected(entry.name);
              const isCut = clipboardEntryPaths.has(entry.name);
              return (
              <ContextMenu key={entry.name}>
                <ContextMenuTrigger asChild>
                  <div
                    className={`flex h-[30px] cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] transition-colors duration-150 ${rowTone(selected)} ${isCut ? 'opacity-50' : ''}`}
                    onClick={(e) => handleSelect(entry.name, e)}
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
                      <span className="flex-1 truncate">{entry.name}</span>
                    )}
                    <span className="shrink-0 text-xs text-label-3">
                      {entry.type === 'directory' ? '' : formatSize(entry.size)}
                    </span>
                  </div>
                </ContextMenuTrigger>
                {fileContextMenu(entry)}
              </ContextMenu>
              );
            })}
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
              <EmptyState label="Empty directory" />
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      {emptyAreaContextMenu()}
    </ContextMenu>
  );
}

// ── Icon grid (small + large) ───────────────────────────
// Tiles: radius 14px, hover bg-fill, selected bg-accent-soft + accent-glow ring.

const ICON_SIZE_CONFIG: Record<IconSize, { fileSize: 'lg' | 'xl'; iconBox: string; upIcon: string; gridCols: string; cellPad: string; textSize: string }> = {
  medium: { fileSize: 'lg', iconBox: 'h-10', upIcon: 'h-6 w-6', gridCols: 'grid-cols-[repeat(auto-fill,minmax(88px,1fr))]', cellPad: 'px-1.5 pt-2.5 pb-2', textSize: 'text-xs' },
  large:  { fileSize: 'xl', iconBox: 'h-14', upIcon: 'h-8 w-8', gridCols: 'grid-cols-[repeat(auto-fill,minmax(104px,1fr))]', cellPad: 'px-2 pt-3 pb-2.5', textSize: 'text-[13px]' },
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
  isSelected,
  handleSelect,
  clearSelection,
  clipboardEntryPaths,
}: ViewProps & { iconSize: IconSize }) {
  const cfg = ICON_SIZE_CONFIG[iconSize];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="h-full overflow-auto px-3 pb-3 pt-0.5">
          <div className={`grid ${cfg.gridCols} gap-1.5`}>
            {canGoUp && (
              <button
                onClick={onNavigateUp}
                className={`flex flex-col items-center gap-1.5 ${cfg.cellPad} rounded-[14px] text-label-2 transition-colors duration-150 hover:bg-fill hover:text-foreground`}
              >
                <span className={`flex ${cfg.iconBox} items-center justify-center`}>
                  <ArrowUp className={cfg.upIcon} strokeWidth={1.5} />
                </span>
                <span className={`${cfg.textSize} max-w-full truncate leading-tight`}>..</span>
              </button>
            )}
            {entries.map(entry => {
              const selected = isSelected(entry.name);
              const isCut = clipboardEntryPaths.has(entry.name);
              return (
              <ContextMenu key={entry.name}>
                <ContextMenuTrigger asChild>
                  <div
                    className={`flex cursor-pointer flex-col items-center gap-1.5 ${cfg.cellPad} rounded-[14px] transition-colors duration-150 ${selected ? 'bg-accent-soft ring-1 ring-accent-glow' : 'hover:bg-fill'} ${isCut ? 'opacity-50' : ''}`}
                    onClick={(e) => handleSelect(entry.name, e)}
                    onDoubleClick={() => onOpen(entry)}
                  >
                    <FileIcon entry={entry} size={cfg.fileSize} />
                    {renamingEntry === entry.name ? (
                      <RenameInput
                        value={renameValue}
                        onChange={setRenameValue}
                        onSubmit={() => submitRename(entry.name)}
                        onCancel={() => setRenamingEntry(null)}
                        centered
                      />
                    ) : (
                      <span className={`${cfg.textSize} max-w-full truncate text-center font-medium leading-tight text-foreground`}>
                        {entry.name}
                      </span>
                    )}
                  </div>
                </ContextMenuTrigger>
                {fileContextMenu(entry)}
              </ContextMenu>
              );
            })}
            {/* Inline create card — Windows-like */}
            {creatingType && (
              <GridCreateCard
                name={createName}
                onChange={setCreateName}
                onSubmit={handleCreateSubmit}
                onCancel={cancelCreate}
                type={creatingType}
                fileSize={cfg.fileSize}
                textSize={cfg.textSize}
                cellPad={cfg.cellPad}
              />
            )}
          </div>
          {entries.length === 0 && !canGoUp && !creatingType && (
            <EmptyState />
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
      className={cn(RENAME_FIELD, 'w-full max-w-30', centered && 'text-center')}
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
    <div className="flex h-[34px] items-center gap-2.5 rounded-[10px] bg-accent-soft px-3">
      {type === 'folder' ? (
        <FolderSVG size={16} className="shrink-0" />
      ) : (
        <FileIcon type="file" name="untitled" size="sm" className="shrink-0" />
      )}
      <input
        ref={inputRef}
        className={`${RENAME_FIELD} w-48`}
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
  fileSize,
  textSize,
  cellPad,
}: {
  name: string;
  onChange: (v: string) => void;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
  type: 'file' | 'folder';
  fileSize: 'lg' | 'xl';
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
    <div className={`flex flex-col items-center gap-1.5 ${cellPad} rounded-[14px] bg-accent-soft ring-1 ring-accent-glow`}>
      {type === 'folder' ? (
        <FileIcon type="directory" size={fileSize} />
      ) : (
        <FileIcon type="file" name="untitled" size={fileSize} />
      )}
      <input
        ref={inputRef}
        className={cn(RENAME_FIELD, textSize, 'w-full max-w-[90px] px-1 text-center')}
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

function EmptyState({ label = 'This folder is empty' }: { label?: string }) {
  return (
    <div className="py-12 text-center text-[13px] text-label-3">
      {label}
    </div>
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
