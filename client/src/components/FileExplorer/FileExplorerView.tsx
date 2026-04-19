// M2.5: File Explorer View — Windows-style layout with nav pane, address bar, multi-view
// @see docs/phases/phase-2.md

import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, AlertCircle, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';
import type { FileEntryData } from '../../lib/api';
import { fetchFiles, listTrash, restoreFromTrash, deleteFromTrash, emptyTrash, type TrashItem } from '../../lib/api';
import { FileList } from './FileListNew';
import { FileViewer } from './FileViewer';
import { AddressBar } from './AddressBar';
import { NavigationPane } from './NavigationPane';
import { ExplorerToolbar, type ViewMode } from './ExplorerToolbar';
import { usePreferencesStore } from '../../store/preferences-store';
import { DisconnectedState } from '@/components/ui/disconnected-state';
import { UploadDropZone } from './UploadDropZone';
import { SplitPaneExplorer } from './SplitPaneExplorer';
import { FileSearchDialog } from './FileSearchDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

/** Special virtual path for the Recycle Bin */
export const TRASH_PATH = '__trash__';

interface FileExplorerViewProps {
  serverId: string;
  /** If set, navigate to this path on mount (e.g. '__trash__') */
  initialPath?: string;
}

export function FileExplorerView({ serverId, initialPath }: FileExplorerViewProps) {
  const [currentPath, setCurrentPath] = useState(initialPath ?? '/');
  const [entries, setEntries] = useState<FileEntryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => usePreferencesStore.getState().explorerViewMode);
  const [selectedCount, setSelectedCount] = useState(0);
  const [splitPane, setSplitPane] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);

  // Whether we're currently viewing the trash virtual folder
  const isTrash = currentPath === TRASH_PATH;

  // Track trash items separately so we can map names for restore/delete
  const trashItemsRef = useRef<TrashItem[]>([]);

  // Ref to expose FileList's startCreate to the toolbar
  const startCreateRef = useRef<((type: 'file' | 'folder') => void) | null>(null);
  const handleStartCreate = useCallback((type: 'file' | 'folder') => {
    startCreateRef.current?.(type);
  }, []);

  // History for back/forward navigation
  const [historyBack, setHistoryBack] = useState<string[]>([]);
  const [historyForward, setHistoryForward] = useState<string[]>([]);
  const isNavigating = useRef(false);

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      setViewingFile(null);

      try {
        if (path === TRASH_PATH) {
          // Fetch trash items and map to FileEntryData
          const trashItems = await listTrash(serverId);
          trashItemsRef.current = trashItems;
          const fakeEntries: FileEntryData[] = trashItems.map(item => ({
            name: item.originalName,
            type: item.isDirectory ? 'directory' as const : 'file' as const,
            permissions: '----------',
            owner: '',
            group: '',
            size: item.size ?? 0,
            modified: item.trashedAt,
          }));
          setEntries(fakeEntries);
          setCurrentPath(TRASH_PATH);
        } else {
          const files = await fetchFiles(serverId, path);
          setEntries(files);
          setCurrentPath(path);
          trashItemsRef.current = [];
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directory');
      } finally {
        setLoading(false);
      }
    },
    [serverId],
  );

  useEffect(() => {
    loadDirectory(initialPath ?? '/');
  }, [loadDirectory, initialPath]);

  const navigateTo = useCallback(
    (path: string) => {
      if (!isNavigating.current) {
        setHistoryBack(prev => [...prev, currentPath]);
        setHistoryForward([]);
      }
      isNavigating.current = false;
      loadDirectory(path);
    },
    [loadDirectory, currentPath],
  );

  const goBack = useCallback(() => {
    if (historyBack.length === 0) return;
    const prev = historyBack[historyBack.length - 1];
    setHistoryBack(h => h.slice(0, -1));
    setHistoryForward(h => [...h, currentPath]);
    isNavigating.current = true;
    loadDirectory(prev);
  }, [historyBack, currentPath, loadDirectory]);

  const goForward = useCallback(() => {
    if (historyForward.length === 0) return;
    const next = historyForward[historyForward.length - 1];
    setHistoryForward(h => h.slice(0, -1));
    setHistoryBack(h => [...h, currentPath]);
    isNavigating.current = true;
    loadDirectory(next);
  }, [historyForward, currentPath, loadDirectory]);

  const openEntry = useCallback(
    (entry: FileEntryData) => {
      // In trash mode, double-click doesn't navigate or open files
      if (currentPath === TRASH_PATH) return;

      const fullPath =
        currentPath === '/'
          ? `/${entry.name}`
          : `${currentPath}/${entry.name}`;

      if (entry.type === 'directory') {
        navigateTo(fullPath);
      } else {
        setViewingFile(fullPath);
      }
    },
    [currentPath, navigateTo],
  );

  const navigateUp = useCallback(() => {
    if (currentPath === '/' || currentPath === TRASH_PATH) return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigateTo(parent);
  }, [currentPath, navigateTo]);

  const handleRefresh = useCallback(() => {
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  const handleActionComplete = useCallback(() => {
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    usePreferencesStore.getState().setExplorerViewMode(mode);
  }, []);

  // ── Trash-specific actions ──
  const handleRestoreItem = useCallback(async (entry: FileEntryData) => {
    // Find the matching trash item by originalName
    const trashItem = trashItemsRef.current.find(t => t.originalName === entry.name);
    if (!trashItem) return;
    try {
      const restorePath = `/tmp/${trashItem.originalName}`;
      await restoreFromTrash(serverId, trashItem.name, restorePath);
      toast.success(`Restored "${trashItem.originalName}" to /tmp/`);
      loadDirectory(TRASH_PATH);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed');
    }
  }, [serverId, loadDirectory]);

  const handleDeleteTrashItem = useCallback(async (entry: FileEntryData) => {
    const trashItem = trashItemsRef.current.find(t => t.originalName === entry.name);
    if (!trashItem) return;
    try {
      await deleteFromTrash(serverId, trashItem.name);
      toast.success(`Permanently deleted "${trashItem.originalName}"`);
      loadDirectory(TRASH_PATH);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [serverId, loadDirectory]);

  const handleEmptyTrash = useCallback(async () => {
    try {
      await emptyTrash(serverId);
      toast.success('Recycle Bin emptied');
      loadDirectory(TRASH_PATH);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to empty trash');
    } finally {
      setConfirmEmptyTrash(false);
    }
  }, [serverId, loadDirectory]);

  // Ctrl+F to open search within the file explorer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearchNavigate = useCallback((path: string) => {
    navigateTo(path);
  }, [navigateTo]);

  const handleSearchOpenFile = useCallback((path: string) => {
    setViewingFile(path);
  }, []);

  // If viewing a file, show the file viewer with full-height sidebar
  if (viewingFile) {
    return (
      <div className="flex h-full">
        {/* Full-height sidebar */}
        <NavigationPane currentPath={currentPath} onNavigate={navigateTo} />
        {/* Right: file viewer */}
        <div className="flex flex-col flex-1 min-w-0 bg-background">
          <FileViewer
            serverId={serverId}
            filePath={viewingFile}
            onClose={() => setViewingFile(null)}
            onSave={handleActionComplete}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Full-height sidebar — flows from the window title bar sidebar header */}
      <NavigationPane currentPath={currentPath} onNavigate={navigateTo} />

      {/* Right column: address bar + toolbar + files + status bar */}
      <div className="flex flex-col flex-1 min-w-0 bg-background">
        {/* Address bar */}
        <AddressBar
          currentPath={currentPath}
          onNavigate={navigateTo}
          onRefresh={handleRefresh}
          loading={loading}
          historyBack={historyBack}
          historyForward={historyForward}
          onBack={goBack}
          onForward={goForward}
          onUp={navigateUp}
        />

        {/* Toolbar */}
        <ExplorerToolbar
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          serverId={serverId}
          currentPath={currentPath}
          onActionComplete={handleActionComplete}
          onStartCreate={handleStartCreate}
          splitPane={splitPane}
          onToggleSplitPane={isTrash ? undefined : () => setSplitPane(s => !s)}
          onOpenSearch={isTrash ? undefined : () => setSearchOpen(true)}
          trashMode={isTrash}
          onEmptyTrash={() => setConfirmEmptyTrash(true)}
        />

        {/* File content area */}
        {splitPane && !isTrash ? (
          <SplitPaneExplorer
            serverId={serverId}
            initialPath={currentPath}
          />
        ) : (
        <UploadDropZone
          serverId={serverId}
          currentPath={currentPath}
          onUploadComplete={handleRefresh}
        >
          <div className="flex-1 min-h-0 bg-background h-full">
          {loading && <LoadingView />}

          {error && !loading && /not connected/i.test(error) && (
            <DisconnectedState
              serverId={serverId}
              onReconnected={handleRefresh}
              message="The SSH connection to this server was lost. Reconnect to browse files."
            />
          )}

          {error && !loading && !/not connected/i.test(error) && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <AlertCircle className="w-6 h-6 text-destructive mx-auto mb-2" />
                <p className="text-xs text-destructive mb-3">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="px-3 py-1.5 text-xs bg-accent hover:bg-accent/80 text-foreground rounded-lg transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && isTrash && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Trash2 className="w-12 h-12 mb-3 opacity-15" />
              <span className="text-sm">Recycle Bin is empty</span>
              <span className="text-xs text-muted-foreground/60 mt-1">Deleted files will appear here</span>
            </div>
          )}

          {!loading && !error && !(isTrash && entries.length === 0) && (
            <FileList
              entries={entries}
              currentPath={currentPath}
              onOpen={openEntry}
              onNavigateUp={navigateUp}
              serverId={serverId}
              onRefresh={handleRefresh}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              onStartCreateRef={startCreateRef}
              onSelectionChange={setSelectedCount}
              trashMode={isTrash}
              onRestoreItem={handleRestoreItem}
              onDeleteItem={handleDeleteTrashItem}
            />
          )}
          </div>
        </UploadDropZone>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-border/20 text-[11px] text-foreground/40">
          <span className="truncate max-w-[40%]">{isTrash ? 'Recycle Bin' : currentPath}</span>
          <span className="shrink-0">
            {entries.length} {entries.length === 1 ? 'item' : 'items'}
            {selectedCount > 0 && ` | ${selectedCount} selected`}
          </span>
        </div>
      </div>

      {/* Search Dialog */}
      {!isTrash && (
        <FileSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          serverId={serverId}
          currentPath={currentPath}
          onNavigate={handleSearchNavigate}
          onOpenFile={handleSearchOpenFile}
        />
      )}

      {/* Confirm Empty Trash */}
      <ConfirmDialog
        open={confirmEmptyTrash}
        onOpenChange={setConfirmEmptyTrash}
        title="Empty Recycle Bin"
        description={`Permanently delete all ${entries.length} item${entries.length !== 1 ? 's' : ''} in the Recycle Bin? This cannot be undone.`}
        confirmLabel="Empty"
        variant="destructive"
        onConfirm={handleEmptyTrash}
      />

    </div>
  );
}
