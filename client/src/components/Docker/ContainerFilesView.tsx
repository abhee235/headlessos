// EX7: Container Target — visual file manager for a Docker container's filesystem.
// @see docs/phases/phase-ex7.md
//
// Browse / view / edit / create / upload / rename / delete files INSIDE a
// container, via the /docker/containers/:id/fs API (docker exec under the hood).
// EX8.6: LumenOS v3 look — File Explorer recipe (breadcrumb pill, 34px rows,
// sticky uppercase header, paper editor pane).

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Folder, File as FileIcon, ArrowUp, FilePlus, FolderPlus, Upload, RefreshCw,
  Save, X, Trash2, Download, Pencil, CornerDownRight, ChevronRight, FolderOpen, Box,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  listContainerFiles, readContainerFile, writeContainerFile, mkdirContainer,
  renameContainerFile, deleteContainerFile, uploadContainerFile, containerDownloadUrl,
  type ContainerFileEntry,
} from '../../lib/api';

interface Props {
  serverId: string;
  containerId: string;
  containerName?: string;
}

function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}
function parentPath(dir: string): string {
  if (dir === '/' || !dir.includes('/')) return '/';
  const p = dir.slice(0, dir.lastIndexOf('/'));
  return p || '/';
}
/** Name / Size / Modified — shared by the header and the rows */
const COLS = 'grid grid-cols-[minmax(0,1fr)_112px_176px] items-center gap-x-3 px-3';
/** Header stays outside the scroller; both reserve the scrollbar gutter so columns align */
const GUTTER = 'px-2 [scrollbar-gutter:stable]';

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ContainerFilesView({ serverId, containerId, containerName }: Props) {
  const [cwd, setCwd] = useState('/');
  const [entries, setEntries] = useState<ContainerFileEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [editor, setEditor] = useState<{ path: string; content: string; dirty: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [newItem, setNewItem] = useState<{ kind: 'file' | 'folder'; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ entry: ContainerFileEntry; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContainerFileEntry | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listContainerFiles(serverId, containerId, cwd);
      list.sort((a, b) => (a.type === 'directory' ? -1 : 1) - (b.type === 'directory' ? -1 : 1) || a.name.localeCompare(b.name));
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list files');
      setEntries(null);
    } finally {
      setLoading(false);
    }
  }, [serverId, containerId, cwd]);

  useEffect(() => { load(); }, [load]);

  const openEntry = async (e: ContainerFileEntry) => {
    if (e.type === 'directory') { setCwd(joinPath(cwd, e.name)); return; }
    try {
      const res = await readContainerFile(serverId, containerId, joinPath(cwd, e.name));
      setEditor({ path: joinPath(cwd, e.name), content: res.content, dirty: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open file');
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      await writeContainerFile(serverId, containerId, editor.path, editor.content);
      setEditor({ ...editor, dirty: false });
      toast.success('Saved');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const createItem = async () => {
    if (!newItem || !newItem.name.trim()) { setNewItem(null); return; }
    const path = joinPath(cwd, newItem.name.trim());
    try {
      if (newItem.kind === 'folder') await mkdirContainer(serverId, containerId, path);
      else await writeContainerFile(serverId, containerId, path, '');
      toast.success(`Created ${newItem.name.trim()}`);
      setNewItem(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const doRename = async () => {
    if (!renameTarget || !renameTarget.name.trim()) { setRenameTarget(null); return; }
    try {
      await renameContainerFile(serverId, containerId, joinPath(cwd, renameTarget.entry.name), joinPath(cwd, renameTarget.name.trim()));
      toast.success('Renamed');
      setRenameTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteContainerFile(serverId, containerId, joinPath(cwd, deleteTarget.name));
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
      setDeleteTarget(null);
    }
  };

  const onUpload = async (file: File) => {
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(new Error('read error'));
        reader.readAsDataURL(file);
      });
      await uploadContainerFile(serverId, containerId, joinPath(cwd, file.name), b64);
      toast.success(`Uploaded ${file.name}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  // Breadcrumb segments
  const segments = cwd === '/' ? [] : cwd.split('/').filter(Boolean);

  return (
    <div className="relative flex h-full flex-col text-[13px]">
      {/* Toolbar */}
      <div className={cn('flex shrink-0 items-center gap-1.5 px-3 pb-3', editor && 'invisible')}>
        <Button size="icon" variant="ghost" className="size-[30px]" title="Up" disabled={cwd === '/'} onClick={() => setCwd(parentPath(cwd))}>
          <ArrowUp strokeWidth={1.75} />
        </Button>
        <Button size="icon" variant="ghost" className="size-[30px]" title="Refresh" onClick={load}>
          <RefreshCw className={cn(loading && 'animate-spin')} strokeWidth={1.75} />
        </Button>

        {/* Breadcrumb */}
        <div className="mx-1 flex h-[30px] min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-full border border-edge bg-field px-1.5 [scrollbar-width:none]">
          <span className="flex shrink-0 items-center gap-1.5 px-1.5 text-label-3" title={containerId}>
            <Box className="size-4" strokeWidth={1.75} />
            <span className="max-w-[160px] truncate text-[12px]">{containerName ? `${containerName}` : containerId.slice(0, 12)}</span>
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-label-3" strokeWidth={1.75} />
          <button
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 font-mono transition-colors duration-150 hover:bg-fill',
              segments.length === 0 ? 'font-semibold text-foreground' : 'text-label-2 hover:text-foreground',
            )}
            onClick={() => setCwd('/')}
          >
            /
          </button>
          {segments.map((seg, i) => {
            const p = '/' + segments.slice(0, i + 1).join('/');
            const last = i === segments.length - 1;
            return (
              <span key={p} className="flex shrink-0 items-center gap-0.5">
                <ChevronRight className="size-3.5 text-label-3" strokeWidth={1.75} />
                <button
                  className={cn(
                    'rounded-full px-2 py-0.5 transition-colors duration-150 hover:bg-fill',
                    last ? 'font-semibold text-foreground' : 'text-label-2 hover:text-foreground',
                  )}
                  onClick={() => setCwd(p)}
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>

        <Button size="sm" variant="secondary" onClick={() => setNewItem({ kind: 'file', name: '' })}><FilePlus strokeWidth={1.75} />New File</Button>
        <Button size="sm" variant="secondary" onClick={() => setNewItem({ kind: 'folder', name: '' })}><FolderPlus strokeWidth={1.75} />New Folder</Button>
        <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}><Upload strokeWidth={1.75} />Upload</Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
      </div>

      {/* Listing */}
      <div className={cn('flex min-h-0 flex-1 flex-col', editor && 'invisible')}>
        {loading && <div className="px-5 py-4 text-label-2">Loading…</div>}
        {error && !loading && (
          <div className="flex items-center gap-3 px-5 py-4 text-danger">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={load}>Retry</Button>
          </div>
        )}
        {!loading && !error && entries?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-label-2">
            <FolderOpen className="size-8 text-label-3" strokeWidth={1.5} />
            Empty directory
          </div>
        )}
        {!loading && !error && entries && entries.length > 0 && (
          <div role="table" aria-label="Container files" className="flex min-h-0 flex-1 flex-col">
            <div role="rowgroup" className={cn('shrink-0 overflow-hidden', GUTTER)}>
              <div role="row" className={cn(COLS, 'h-[30px] text-[11px] font-bold uppercase tracking-[.06em] text-label-3')}>
                <div role="columnheader">Name</div>
                <div role="columnheader">Size</div>
                <div role="columnheader">Modified</div>
              </div>
            </div>
            <div role="rowgroup" className={cn('min-h-0 flex-1 overflow-y-auto pb-2', GUTTER)}>
              {entries.map((e) => (
                <ContextMenu key={e.name}>
                  <ContextMenuTrigger asChild>
                    <div
                      role="row"
                      aria-selected={selectedName === e.name}
                      className={cn(
                        COLS,
                        'h-[34px] cursor-default rounded-[10px] transition-colors duration-150',
                        selectedName === e.name ? 'bg-accent-soft' : 'hover:bg-fill active:bg-fill-2',
                      )}
                      onClick={() => setSelectedName(e.name)}
                      onContextMenu={() => setSelectedName(e.name)}
                      onDoubleClick={() => openEntry(e)}
                    >
                      <div role="cell" className={cn('flex min-w-0 items-center gap-2.5', selectedName === e.name ? 'text-accent-text' : 'text-foreground')}>
                        {e.type === 'directory'
                          ? <Folder className="size-[18px] shrink-0 fill-accent-solid/20 text-accent-solid" strokeWidth={1.75} />
                          : e.type === 'symlink'
                            ? <CornerDownRight className="size-[18px] shrink-0 text-label-3" strokeWidth={1.75} />
                            : <FileIcon className="size-[18px] shrink-0 text-label-3" strokeWidth={1.75} />}
                        <span className="truncate">{e.name}</span>
                        {e.symlinkTarget && <span className="min-w-0 truncate font-mono text-[12px] text-label-3">→ {e.symlinkTarget}</span>}
                      </div>
                      <div role="cell" className="truncate text-[12px] tabular-nums text-label-2">{e.type === 'directory' ? '—' : fmtSize(e.size)}</div>
                      <div role="cell" className="truncate text-[12px] tabular-nums text-label-2">{e.modified}</div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => openEntry(e)}>
                      {e.type === 'directory' ? <FolderOpen strokeWidth={1.75} /> : <Pencil strokeWidth={1.75} />}
                      {e.type === 'directory' ? 'Open' : 'Edit'}
                    </ContextMenuItem>
                    {e.type !== 'directory' && (
                      <ContextMenuItem onClick={() => window.open(containerDownloadUrl(serverId, containerId, joinPath(cwd, e.name)), '_blank')}>
                        <Download strokeWidth={1.75} />Download
                      </ContextMenuItem>
                    )}
                    <ContextMenuItem onClick={() => setRenameTarget({ entry: e, name: e.name })}>
                      <Pencil strokeWidth={1.75} />Rename
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem danger onClick={() => setDeleteTarget(e)}>
                      <Trash2 strokeWidth={1.75} />Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editor overlay — the listing beneath is made invisible while it is open */}
      {editor && (
        <div className="absolute inset-0 z-20 flex flex-col">
          <div className="mb-3 flex h-[30px] shrink-0 items-center gap-2 px-3">
            <FileIcon className="size-4 shrink-0 text-label-3" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-label-2">
              {editor.path}{editor.dirty ? ' •' : ''}
            </span>
            <Button size="sm" onClick={saveEditor} disabled={saving || !editor.dirty}><Save strokeWidth={1.75} />{saving ? 'Saving…' : 'Save'}</Button>
            <Button size="icon" variant="ghost" className="size-[30px]" title="Close" onClick={() => setEditor(null)}><X strokeWidth={1.75} /></Button>
          </div>
          <textarea
            className="mx-2 mb-2 min-h-0 flex-1 resize-none rounded-[14px] bg-paper px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            value={editor.content}
            spellCheck={false}
            onChange={(ev) => setEditor({ ...editor, content: ev.target.value, dirty: true })}
          />
        </div>
      )}

      {/* New item dialog */}
      <Dialog open={!!newItem} onOpenChange={(o) => !o && setNewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>New {newItem?.kind === 'folder' ? 'Folder' : 'File'}</DialogTitle></DialogHeader>
          <Input autoFocus placeholder="Name" value={newItem?.name ?? ''} onChange={(e) => setNewItem(newItem ? { ...newItem, name: e.target.value } : null)} onKeyDown={(e) => e.key === 'Enter' && createItem()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewItem(null)}>Cancel</Button>
            <Button onClick={createItem}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename</DialogTitle></DialogHeader>
          <Input autoFocus value={renameTarget?.name ?? ''} onChange={(e) => setRenameTarget(renameTarget ? { ...renameTarget, name: e.target.value } : null)} onKeyDown={(e) => e.key === 'Enter' && doRename()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={doRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? ''}?`}
        description={`This permanently removes it from the container${deleteTarget?.type === 'directory' ? ' (and everything inside it)' : ''}.`}
        variant="destructive"
        onConfirm={doDelete}
      />
    </div>
  );
}
