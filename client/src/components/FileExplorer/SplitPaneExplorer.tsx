// M10.4: Split-Pane File Explorer — dual directory view side by side
// @see docs/PROGRESS.md

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertCircle, ArrowRight } from 'lucide-react';
import type { FileEntryData } from '../../lib/api';
import { fetchFiles } from '../../lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UploadDropZone } from './UploadDropZone';

// ── Minimal file list for the split pane ─────────────────

function MiniFileList({
  entries,
  currentPath,
  onNavigate,
  serverId,
  loading,
  error,
  onRefresh,
}: {
  entries: FileEntryData[];
  currentPath: string;
  onNavigate: (path: string) => void;
  serverId: string;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const openEntry = (entry: FileEntryData) => {
    const fullPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    if (entry.type === 'directory') {
      onNavigate(fullPath);
    }
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    onNavigate(parent);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-5 h-5 text-destructive mx-auto mb-2" />
          <p className="text-xs text-destructive">{error}</p>
          <button
            onClick={onRefresh}
            className="mt-2 px-2 py-1 text-xs bg-accent hover:bg-accent/80 text-foreground rounded-md"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <UploadDropZone serverId={serverId} currentPath={currentPath} onUploadComplete={onRefresh}>
      <ScrollArea className="h-full">
        <div className="divide-y divide-border/20">
          {/* Navigate up */}
          {currentPath !== '/' && (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-accent/30 transition-colors text-muted-foreground"
              onClick={navigateUp}
            >
              <ArrowRight className="w-3 h-3 rotate-180" />
              <span className="text-xs">..</span>
            </button>
          )}
          {entries.map(entry => (
            <button
              key={entry.name}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-accent/30 transition-colors"
              onDoubleClick={() => openEntry(entry)}
              onClick={() => {
                if (entry.type === 'directory') openEntry(entry);
              }}
            >
              <span className={`text-xs shrink-0 ${entry.type === 'directory' ? 'text-blue-400' : 'text-muted-foreground'}`}>
                {entry.type === 'directory' ? '📁' : '📄'}
              </span>
              <span className="text-[13px] text-foreground truncate flex-1">{entry.name}</span>
              <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
                {entry.type === 'directory' ? '' : formatSize(entry.size)}
              </span>
            </button>
          ))}
          {entries.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Empty directory
            </div>
          )}
        </div>
      </ScrollArea>
    </UploadDropZone>
  );
}

// ── Split Pane Explorer ──────────────────────────────────

interface SplitPaneExplorerProps {
  serverId: string;
  initialPath: string;
}

export function SplitPaneExplorer({ serverId, initialPath }: SplitPaneExplorerProps) {
  // Left pane state
  const [leftPath, setLeftPath] = useState(initialPath);
  const [leftEntries, setLeftEntries] = useState<FileEntryData[]>([]);
  const [leftLoading, setLeftLoading] = useState(true);
  const [leftError, setLeftError] = useState<string | null>(null);

  // Right pane state
  const [rightPath, setRightPath] = useState(initialPath);
  const [rightEntries, setRightEntries] = useState<FileEntryData[]>([]);
  const [rightLoading, setRightLoading] = useState(true);
  const [rightError, setRightError] = useState<string | null>(null);

  const loadLeft = useCallback(async (path: string) => {
    setLeftLoading(true);
    setLeftError(null);
    try {
      const files = await fetchFiles(serverId, path);
      setLeftEntries(files);
      setLeftPath(path);
    } catch (err) {
      setLeftError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLeftLoading(false);
    }
  }, [serverId]);

  const loadRight = useCallback(async (path: string) => {
    setRightLoading(true);
    setRightError(null);
    try {
      const files = await fetchFiles(serverId, path);
      setRightEntries(files);
      setRightPath(path);
    } catch (err) {
      setRightError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setRightLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    loadLeft(initialPath);
    loadRight(initialPath);
  }, [loadLeft, loadRight, initialPath]);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={50} minSize={25}>
        <div className="flex flex-col h-full">
          {/* Left path bar */}
          <div className="flex items-center px-3 py-1.5 border-b border-border/30 bg-muted/30">
            <span className="text-[11px] text-muted-foreground truncate font-mono">
              {leftPath}
            </span>
          </div>
          {/* Left file list */}
          <div className="flex-1 min-h-0">
            <MiniFileList
              entries={leftEntries}
              currentPath={leftPath}
              onNavigate={loadLeft}
              serverId={serverId}
              loading={leftLoading}
              error={leftError}
              onRefresh={() => loadLeft(leftPath)}
            />
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={50} minSize={25}>
        <div className="flex flex-col h-full">
          {/* Right path bar */}
          <div className="flex items-center px-3 py-1.5 border-b border-border/30 bg-muted/30">
            <span className="text-[11px] text-muted-foreground truncate font-mono">
              {rightPath}
            </span>
          </div>
          {/* Right file list */}
          <div className="flex-1 min-h-0">
            <MiniFileList
              entries={rightEntries}
              currentPath={rightPath}
              onNavigate={loadRight}
              serverId={serverId}
              loading={rightLoading}
              error={rightError}
              onRefresh={() => loadRight(rightPath)}
            />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

// ── Helpers ──────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[i]}`;
}
