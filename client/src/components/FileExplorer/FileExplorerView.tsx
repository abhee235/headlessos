// M2.5: File Explorer View — Windows-style layout with nav pane, address bar, multi-view
// @see docs/phases/phase-2.md

import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import type { FileEntryData } from '../../lib/api';
import { fetchFiles } from '../../lib/api';
import { FileList } from './FileListNew';
import { FileViewer } from './FileViewer';
import { AddressBar } from './AddressBar';
import { NavigationPane } from './NavigationPane';
import { ExplorerToolbar, type ViewMode } from './ExplorerToolbar';
import { usePreferencesStore } from '../../store/preferences-store';
import { DisconnectedState } from '@/components/ui/disconnected-state';

interface FileExplorerViewProps {
  serverId: string;
}

export function FileExplorerView({ serverId }: FileExplorerViewProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FileEntryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => usePreferencesStore.getState().explorerViewMode);
  const [selectedCount, setSelectedCount] = useState(0);

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
        const files = await fetchFiles(serverId, path);
        setEntries(files);
        setCurrentPath(path);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directory');
      } finally {
        setLoading(false);
      }
    },
    [serverId],
  );

  useEffect(() => {
    loadDirectory('/');
  }, [loadDirectory]);

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
    if (currentPath === '/') return;
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
          entryCount={entries.length}
          onStartCreate={handleStartCreate}
        />

        {/* File content area */}
        <div className="flex-1 min-h-0 bg-background">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            </div>
          )}

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

          {!loading && !error && (
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
            />
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-border/20 text-[11px] text-foreground/40">
          <span className="truncate max-w-[40%]">{currentPath}</span>
          <span className="shrink-0">
            {entries.length} {entries.length === 1 ? 'item' : 'items'}
            {selectedCount > 0 && ` | ${selectedCount} selected`}
          </span>
        </div>
      </div>
    </div>
  );
}
