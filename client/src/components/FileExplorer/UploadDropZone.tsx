// M10.3: File Upload Drop Zone — drag-and-drop file upload for File Explorer
// @see docs/PROGRESS.md

import { useState, useCallback, useRef, type DragEvent } from 'react';
import { Upload, CheckCircle, XCircle } from 'lucide-react';
import { uploadFiles } from '../../lib/api';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { notify } from '../../store/notification-store';
import { Spinner } from '@/components/ui/spinner';

interface UploadDropZoneProps {
  serverId: string;
  currentPath: string;
  onUploadComplete: () => void;
  children: React.ReactNode;
}

interface UploadState {
  uploading: boolean;
  progress: number;
  fileName?: string;
}

export function UploadDropZone({
  serverId,
  currentPath,
  onUploadComplete,
  children,
}: UploadDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [upload, setUpload] = useState<UploadState>({ uploading: false, progress: 0 });
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setUpload({
      uploading: true,
      progress: 0,
      fileName: files.length === 1 ? files[0].name : `${files.length} files`,
    });

    try {
      const result = await uploadFiles(
        serverId,
        currentPath,
        files,
        (loaded, total) => {
          setUpload(prev => ({ ...prev, progress: Math.round((loaded / total) * 100) }));
        },
      );

      const successCount = result.files.filter(f => f.success).length;
      const failCount = result.files.filter(f => !f.success).length;

      if (failCount === 0) {
        toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
        notify({
          type: 'success',
          title: `Upload complete`,
          message: `${successCount} file${successCount > 1 ? 's' : ''} uploaded to ${currentPath}`,
          source: 'File Explorer',
        });
      } else {
        toast.warning(`${successCount} uploaded, ${failCount} failed`);
        notify({
          type: 'warning',
          title: 'Upload partially failed',
          message: `${successCount} uploaded, ${failCount} failed in ${currentPath}`,
          source: 'File Explorer',
        });
      }

      onUploadComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
      notify({
        type: 'error',
        title: 'Upload failed',
        message: msg,
        source: 'File Explorer',
      });
    } finally {
      setUpload({ uploading: false, progress: 0 });
    }
  }, [serverId, currentPath, onUploadComplete]);

  return (
    <div
      className="relative h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 backdrop-blur-sm border-2 border-dashed border-primary/40 rounded-lg pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-10 h-10 text-primary/60" />
            <p className="text-sm font-medium text-primary/80">Drop files to upload</p>
            <p className="text-xs text-muted-foreground">
              Files will be uploaded to {currentPath}
            </p>
          </div>
        </div>
      )}

      {/* Upload progress overlay */}
      {upload.uploading && (
        <div className="absolute bottom-4 right-4 z-50 w-64 p-3 rounded-lg bg-background/95 backdrop-blur-xl border border-border shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Spinner className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-foreground truncate">
              Uploading {upload.fileName}…
            </span>
          </div>
          <Progress value={upload.progress} className="h-1.5" />
          <span className="text-[10px] text-muted-foreground mt-1 block">
            {upload.progress}%
          </span>
        </div>
      )}
    </div>
  );
}
