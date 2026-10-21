// M10.4: Split-Pane File Explorer — dual directory view side by side
// EX8.6: LumenOS v3 — path pills, 30px rows, hairline divider.
// @see docs/PROGRESS.md, docs/phases/phase-ex8.md

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, ArrowUp } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FileIcon } from '@/components/ui/FileIcon';
import { cn } from '@/lib/utils';
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

/** 30px row: radius 10px, hover bg-fill. */
const MINI_ROW =
  'flex h-[30px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13px] transition-colors duration-150 hover:bg-fill';

/** Read-only path pill above each pane. */
function PanePathBar({ path, className }: { path: string; className?: string }) {
  return (
    <div className={cn('mb-1.5 flex h-[30px] shrink-0 items-center rounded-full border border-edge bg-field px-3', className)}>
      <span className="truncate font-mono text-[11px] text-label-2">{path}</span>
    </div>
  );
}

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
        <Spinner size={16} className="text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-2 h-6 w-6 text-danger" strokeWidth={1.75} />
          <p className="text-[13px] text-danger">{error}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <UploadDropZone serverId={serverId} currentPath={currentPath} onUploadComplete={onRefresh}>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-px px-2 pb-2">
          {/* Navigate up */}
          {currentPath !== '/' && (
            <button
              className={cn(MINI_ROW, 'text-label-2 hover:text-foreground')}
              onClick={navigateUp}
            >
              <ArrowUp className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>..</span>
            </button>
          )}
          {entries.map(entry => (
            <button
              key={entry.name}
              className={cn(MINI_ROW, 'text-foreground')}
              onDoubleClick={() => openEntry(entry)}
              onClick={() => {
                if (entry.type === 'directory') openEntry(entry);
              }}
            >
              <FileIcon entry={entry} size="sm" className="shrink-0" />
              <span className="flex-1 truncate">{entry.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-label-3">
                {entry.type === 'directory' ? '' : formatSize(entry.size)}
              </span>
            </button>
          ))}
          {entries.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-label-3">
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
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="50%" minSize="25%">
        <div className="flex flex-col h-full">
          {/* Left path bar */}
          <PanePathBar path={leftPath} className="ml-3 mr-2" />
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

      {/* Subtle hairline divider; the primitive keeps a wider hit area */}
      <ResizableHandle className="my-1" />

      <ResizablePanel defaultSize="50%" minSize="25%">
        <div className="flex flex-col h-full">
          {/* Right path bar */}
          <PanePathBar path={rightPath} className="ml-2 mr-4" />
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
