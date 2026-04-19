// Trash / Recycle Bin Dialog — view and restore trashed files
// Files are moved to /tmp/.headlessos-trash/ on the server

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
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-sm font-medium flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Recycle Bin
              {items.length > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-1">
                  {items.length}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="border-t border-border/30">
            {loading && (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Spinner className="w-4 h-4" />
                <span className="text-xs">Loading trash...</span>
              </div>
            )}

            {error && !loading && (
              <div className="flex items-center justify-center py-12 gap-2 text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs">{error}</span>
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Trash2 className="w-8 h-8 mb-2 opacity-20" />
                <span className="text-xs">Recycle Bin is empty</span>
              </div>
            )}

            {!loading && items.length > 0 && (
              <ScrollArea className="max-h-88">
                <div className="py-1">
                  {items.map(item => (
                    <div
                      key={item.name}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors group"
                    >
                      <div className="shrink-0 w-5 h-5 flex items-center justify-center opacity-60">
                        {item.isDirectory ? (
                          <FolderSVG size={20} className="w-5 h-5" />
                        ) : (
                          <FileIcon name={item.originalName} size="sm" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{item.originalName}</div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Restore to /tmp/"
                        >
                          {actionLoading === item.name ? (
                            <Spinner className="w-3.5 h-3.5" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeletePermanently(item)}
                          disabled={actionLoading === item.name}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
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
            <DialogFooter className="p-3 border-t border-border/20 mt-0">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmEmpty(true)}
                disabled={actionLoading === '__empty__'}
                className="text-xs"
              >
                {actionLoading === '__empty__' ? (
                  <Spinner className="w-3.5 h-3.5mr-1.5" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
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
