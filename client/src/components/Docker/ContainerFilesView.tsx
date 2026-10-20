// EX7: Container Target — visual file manager for a Docker container's filesystem.
// @see docs/phases/phase-ex7.md
//
// Browse / view / edit / create / upload / rename / delete files INSIDE a
// container, via the /docker/containers/:id/fs API (docker exec under the hood).

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Folder, File as FileIcon, ArrowUp, FilePlus, FolderPlus, Upload, RefreshCw,
  Save, X, Trash2, Download, Pencil, CornerDownRight,
} from 'lucide-react';
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
    <div className="flex flex-col h-full text-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-[rgb(var(--chrome))]">
        <Button size="icon" variant="ghost" title="Up" disabled={cwd === '/'} onClick={() => setCwd(parentPath(cwd))}>
          <ArrowUp className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" title="Refresh" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={() => setNewItem({ kind: 'file', name: '' })}><FilePlus className="w-4 h-4 mr-1" />New File</Button>
        <Button size="sm" variant="ghost" onClick={() => setNewItem({ kind: 'folder', name: '' })}><FolderPlus className="w-4 h-4 mr-1" />New Folder</Button>
        <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-1" />Upload</Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        <div className="ml-auto text-xs text-muted-foreground truncate max-w-[40%]">{containerName ? `${containerName}` : containerId.slice(0, 12)}</div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-3 py-1 text-xs text-muted-foreground border-b border-border/50 overflow-x-auto">
        <button className="hover:text-foreground" onClick={() => setCwd('/')}>/</button>
        {segments.map((seg, i) => {
          const p = '/' + segments.slice(0, i + 1).join('/');
          return (
            <span key={p} className="flex items-center gap-1">
              <span>/</span>
              <button className="hover:text-foreground" onClick={() => setCwd(p)}>{seg}</button>
            </span>
          );
        })}
      </div>

      {/* Listing */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="p-4 text-muted-foreground">Loading…</div>}
        {error && !loading && (
          <div className="p-4 text-destructive">
            {error} <Button size="sm" variant="outline" className="ml-2" onClick={load}>Retry</Button>
          </div>
        )}
        {!loading && !error && entries?.length === 0 && <div className="p-4 text-muted-foreground">Empty directory</div>}
        {!loading && !error && entries && entries.length > 0 && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[rgb(var(--background))]">
              <tr className="text-left text-muted-foreground text-xs">
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="px-3 py-1.5 font-medium w-24">Size</th>
                <th className="px-3 py-1.5 font-medium w-40">Modified</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <ContextMenu key={e.name}>
                  <ContextMenuTrigger asChild>
                    <tr className="border-b border-border/40 hover:bg-accent/50 cursor-default" onDoubleClick={() => openEntry(e)}>
                      <td className="px-3 py-1.5 text-foreground">
                        <span className="flex items-center gap-2">
                          {e.type === 'directory'
                            ? <Folder className="w-4 h-4 text-[rgb(var(--primary))]" />
                            : e.type === 'symlink'
                              ? <CornerDownRight className="w-4 h-4 opacity-60" />
                              : <FileIcon className="w-4 h-4 opacity-60" />}
                          <span className="truncate max-w-[280px]">{e.name}</span>
                          {e.symlinkTarget && <span className="text-xs text-muted-foreground">→ {e.symlinkTarget}</span>}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{e.type === 'directory' ? '—' : fmtSize(e.size)}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{e.modified}</td>
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem onClick={() => openEntry(e)}>
                      {e.type === 'directory' ? 'Open' : 'Edit'}
                    </ContextMenuItem>
                    {e.type !== 'directory' && (
                      <ContextMenuItem onClick={() => window.open(containerDownloadUrl(serverId, containerId, joinPath(cwd, e.name)), '_blank')}>
                        <Download className="w-4 h-4 mr-2 opacity-60" />Download
                      </ContextMenuItem>
                    )}
                    <ContextMenuItem onClick={() => setRenameTarget({ entry: e, name: e.name })}>
                      <Pencil className="w-4 h-4 mr-2 opacity-60" />Rename
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-destructive" onClick={() => setDeleteTarget(e)}>
                      <Trash2 className="w-4 h-4 mr-2 opacity-60" />Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Editor overlay */}
      {editor && (
        <div className="absolute inset-0 z-20 flex flex-col bg-[rgb(var(--background))]">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-[rgb(var(--chrome))]">
            <span className="text-xs font-mono truncate flex-1">{editor.path}{editor.dirty ? ' •' : ''}</span>
            <Button size="sm" onClick={saveEditor} disabled={saving || !editor.dirty}><Save className="w-4 h-4 mr-1" />{saving ? 'Saving…' : 'Save'}</Button>
            <Button size="icon" variant="ghost" onClick={() => setEditor(null)}><X className="w-4 h-4" /></Button>
          </div>
          <textarea
            className="flex-1 w-full resize-none bg-[rgb(var(--background))] text-foreground font-mono text-xs p-3 outline-none"
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
