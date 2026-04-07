// M2.4: File List — table view of directory entries
// @see docs/phases/phase-2.md

import { useState } from 'react';
import {
  Folder,
  File,
  FileText,
  Link2,
  ArrowUp,
  Trash2,
  Pencil,
} from 'lucide-react';
import type { FileEntryData } from '../../lib/api';
import { deleteFile, renameFile } from '../../lib/api';
import { toast } from 'sonner';

interface FileListProps {
  entries: FileEntryData[];
  currentPath: string;
  onOpen: (entry: FileEntryData) => void;
  onNavigateUp: () => void;
  serverId: string;
  onRefresh: () => void;
}

export function FileList({
  entries,
  currentPath,
  onOpen,
  onNavigateUp,
  serverId,
  onRefresh,
}: FileListProps) {
  const [renamingEntry, setRenamingEntry] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextTarget, setContextTarget] = useState<string | null>(null);

  const handleDelete = async (entry: FileEntryData) => {
    const fullPath =
      currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;

    if (!confirm(`Delete "${entry.name}"?`)) return;

    try {
      await deleteFile(serverId, fullPath);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const startRename = (entry: FileEntryData) => {
    setRenamingEntry(entry.name);
    setRenameValue(entry.name);
    setContextTarget(null);
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

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="text-left px-3 py-2 font-medium">Name</th>
            <th className="text-right px-3 py-2 font-medium w-24">Size</th>
            <th className="text-left px-3 py-2 font-medium w-40 hidden md:table-cell">Modified</th>
            <th className="text-left px-3 py-2 font-medium w-32 hidden lg:table-cell">Permissions</th>
            <th className="w-20 px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {/* Navigate up row */}
          {currentPath !== '/' && (
            <tr
              className="border-b border-border/50 hover:bg-accent/50 cursor-pointer"
              onDoubleClick={onNavigateUp}
              onClick={onNavigateUp}
            >
              <td className="px-3 py-1.5 flex items-center gap-2 text-muted-foreground">
                <ArrowUp className="w-4 h-4" />
                <span>..</span>
              </td>
              <td />
              <td className="hidden md:table-cell" />
              <td className="hidden lg:table-cell" />
              <td />
            </tr>
          )}

          {entries.map(entry => (
            <tr
              key={entry.name}
              className="border-b border-border/30 hover:bg-accent/50 cursor-pointer group"
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={e => {
                e.preventDefault();
                setContextTarget(contextTarget === entry.name ? null : entry.name);
              }}
            >
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <FileIcon type={entry.type} />
                  {renamingEntry === entry.name ? (
                    <input
                      autoFocus
                      className="bg-background border border-primary rounded px-1 py-0.5 text-foreground text-sm outline-none focus:border-primary w-full max-w-xs"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => submitRename(entry.name)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') submitRename(entry.name);
                        if (e.key === 'Escape') setRenamingEntry(null);
                      }}
                    />
                  ) : (
                    <span className="text-foreground truncate max-w-xs">
                      {entry.name}
                    </span>
                  )}
                  {entry.type === 'symlink' && entry.symlinkTarget && (
                    <span className="text-xs text-muted-foreground">→ {entry.symlinkTarget}</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-1.5 text-right text-muted-foreground font-mono text-xs">
                {entry.type === 'directory' ? '—' : formatSize(entry.size)}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground text-xs hidden md:table-cell">
                {formatDate(entry.modified)}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground/60 font-mono text-xs hidden lg:table-cell">
                {entry.permissions.split(' ')[0]}
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      startRename(entry);
                    }}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(entry);
                    }}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">
                Empty directory
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────

function FileIcon({ type }: { type: string }) {
  switch (type) {
    case 'directory':
      return <Folder className="w-4 h-4 text-primary shrink-0" />;
    case 'symlink':
      return <Link2 className="w-4 h-4 text-primary/60 shrink-0" />;
    default:
      return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
  }
}

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
