// Trash / Recycle Bin Dialog — view and restore trashed files
// Files are moved to /tmp/.headlessos-trash/ on the server
// EX8.6: LumenOS v3 — relies on the glass Dialog; inner rows use tokens only.

import { useState, useCallback, useEffect } from 'react';
import {
  Trash2, RotateCcw, X as XIcon, AlertCircle, Folder, File } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { listTrash, restoreFromTrash, deleteFromTrash, emptyTrash, type TrashItem } from '../../lib/api';
import { FileIcon, FolderSVG } from '../ui/FileIcon';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';

interface TrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  onRestored?: () => void;
}

export function TrashDialog({
  open,
  onOpenChange,
  serverId,
  onRestored,
}: TrashDialogProps) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTrash(serverId);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (open) loadTrash();
  }, [open, loadTrash]);

  const handleRestore = useCallback(async (item: TrashItem) => {
    setActionLoading(item.name);
    try {
      // Restore to original parent directory with original name
      // We derive the original path from the currentPath context
      // For now, restore to the root with original name
      const underscoreIdx = item.name.indexOf('_');
      const originalName = underscoreIdx > 0 ? item.name.substring(underscoreIdx + 1) : item.name;
      // Try restoring to common location: /tmp for safety, user can move
      const restorePath = `/tmp/${originalName}`;
      await restoreFromTrash(serverId, item.name, restorePath);
      toast.success(`Restored "${item.originalName}" to /tmp/`);
      setItems(prev => prev.filter(i => i.name !== item.name));
      onRestored?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setActionLoading(null);
    }
  }, [serverId, onRestored]);

  const handleDeletePermanently = useCallback(async (item: TrashItem) => {
    setActionLoading(item.name);
    try {
      await deleteFromTrash(serverId, item.name);
      toast.success(`Permanently deleted "${item.originalName}"`);
      setItems(prev => prev.filter(i => i.name !== item.name));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActionLoading(null);
    }
  }, [serverId]);

  const handleEmptyTrash = useCallback(async () => {
    setActionLoading('__empty__');
    try {
      await emptyTrash(serverId);
      toast.success('Trash emptied');
      setItems([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to empty trash');
    } finally {
      setActionLoading(null);
      setConfirmEmpty(false);
    }
  }, [serverId]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <Trash2 className="h-[18px] w-[18px] text-accent-solid" strokeWidth={1.75} />
              Recycle Bin
              {items.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {items.length}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="border-t border-border">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Spinner className="h-4 w-4" />
                <span className="text-[13px]">Loading trash...</span>
              </div>
            )}

            {error && !loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-danger">
                <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
                <span className="text-[13px]">{error}</span>
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Trash2 className="mb-2 h-8 w-8 text-label-3 opacity-60" strokeWidth={1.25} />
                <span className="text-[13px]">Recycle Bin is empty</span>
              </div>
            )}

            {!loading && items.length > 0 && (
              <ScrollArea className="max-h-88">
                <div className="flex flex-col gap-px p-2">
                  {items.map(item => (
                    <div
                      key={item.name}
                      className="group flex items-center gap-3 rounded-[10px] px-3 py-2 transition-colors duration-150 hover:bg-fill"
                    >
                      <div className="shrink-0 w-5 h-5 flex items-center justify-center opacity-60">
                        {item.isDirectory ? (
                          <FolderSVG size={20} className="w-5 h-5" />
                        ) : (
                          <FileIcon name={item.originalName} size="sm" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-[13px] font-medium text-foreground">{item.originalName}</div>
                        <div className="flex items-center gap-2 text-[11px] text-label-3">
                          <span>Deleted {formatDate(item.trashedAt)}</span>
                          {item.size !== undefined && item.size > 0 && (
                            <>
                              <span className="opacity-30">·</span>
                              <span>{formatSize(item.size)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleRestore(item)}
                          disabled={actionLoading === item.name}
                          className="grid h-7 w-7 place-items-center rounded-full text-label-2 transition-colors duration-150 hover:bg-fill-2 hover:text-foreground"
                          title="Restore to /tmp/"
                        >
                          {actionLoading === item.name ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeletePermanently(item)}
                          disabled={actionLoading === item.name}
                          className="grid h-7 w-7 place-items-center rounded-full text-label-2 transition-colors duration-150 hover:bg-danger/12 hover:text-danger"
                          title="Delete permanently"
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {items.length > 0 && (
            <DialogFooter className="mt-0 border-t border-border px-4 py-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmEmpty(true)}
                disabled={actionLoading === '__empty__'}
              >
                {actionLoading === '__empty__' ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <Trash2 strokeWidth={1.75} />
                )}
                Empty Recycle Bin
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title="Empty Recycle Bin"
        description={`Permanently delete all ${items.length} item${items.length !== 1 ? 's' : ''} in the Recycle Bin? This cannot be undone.`}
        confirmLabel="Empty"
        variant="destructive"
        onConfirm={handleEmptyTrash}
      />
    </>
  );
}
