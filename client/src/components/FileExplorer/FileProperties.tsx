// File Properties Dialog — Windows 11-style properties overlay
// Shows complete file/folder metadata fetched via SFTP stat
// EX8.6: LumenOS v3 — relies on the glass AppWindow; inner text uses tokens only.

import { useState, useEffect } from 'react';
import { Info, FileText, Folder, Link2, HardDrive } from 'lucide-react';
import { AppWindow } from '@/components/ui/app-window';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { FileIcon, FolderSVG } from '@/components/ui/FileIcon';
import { fetchFileStat, type FileStatData } from '../../lib/api';

interface FilePropertiesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  /** Full path to the file/folder */
  filePath: string;
  /** File name (used as fallback while loading) */
  fileName: string;
  /** File type hint (used for icon before stat loads) */
  fileType?: 'file' | 'directory' | 'symlink' | 'other';
}

export function FileProperties({
  open,
  onOpenChange,
  serverId,
  filePath,
  fileName,
  fileType = 'file',
}: FilePropertiesProps) {
  const [stat, setStat] = useState<FileStatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setStat(null);

    fetchFileStat(serverId, filePath)
      .then(data => {
        setStat(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load file properties');
        setLoading(false);
      });
  }, [open, serverId, filePath]);

  const type = stat?.type ?? fileType;
  const isDir = type === 'directory';
  const isSymlink = type === 'symlink';

  const title = `${stat?.name ?? fileName} Properties`;

  return (
    <AppWindow
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      icon={Info}
      size="sm"
      width={420}
      height={520}
    >
      <AppWindow.Body className="flex flex-col gap-0">
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[13px] text-danger">
            {error}
          </div>
        ) : stat ? (
          <div className="space-y-4">
            {/* ── File Icon + Name ── */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                {isDir ? (
                  <FolderSVG size={40} />
                ) : (
                  <FileIcon name={stat.name} size="lg" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-foreground">
                  {stat.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {getFileTypeDescription(stat)}
                </p>
              </div>
            </div>

            <Separator />

            {/* ── General Properties ── */}
            <div className="space-y-2.5">
              <PropertyRow label="Type" value={getFileTypeDescription(stat)} icon={isDir ? Folder : isSymlink ? Link2 : FileText} />
              {!isDir && (
                <PropertyRow label="Size" value={`${formatSizeDetailed(stat.size)} (${stat.size.toLocaleString()} bytes)`} icon={HardDrive} />
              )}
              <PropertyRow label="Location" value={stat.path} />
            </div>

            <Separator />

            {/* ── Timestamps ── */}
            <div className="space-y-2.5">
              <PropertyRow label="Modified" value={formatDateTime(stat.modified)} />
              <PropertyRow label="Accessed" value={formatDateTime(stat.accessed)} />
            </div>

            <Separator />

            {/* ── Permissions & Ownership ── */}
            <div className="space-y-2.5">
              <PropertyRow label="Permissions" value={stat.permissions} />
              <PropertyRow label="Mode" value={`0${stat.mode.toString(8)}`} />
              <PropertyRow label="Owner (UID)" value={stat.owner} />
              <PropertyRow label="Group (GID)" value={stat.group} />
              {isSymlink && stat.symlinkTarget && (
                <PropertyRow label="Link Target" value={stat.symlinkTarget} />
              )}
            </div>
          </div>
        ) : null}
      </AppWindow.Body>
      <AppWindow.Footer className="justify-end gap-2 px-4 py-3">
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </AppWindow.Footer>
    </AppWindow>
  );
}

// ── Sub-components ──────────────────────────────────────

function PropertyRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-2 text-[13px]">
      {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-label-3" />}
      <span className="w-24 shrink-0 text-muted-foreground">{label}:</span>
      <span className="min-w-0 select-text break-all text-foreground">{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-[10px]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Separator />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function getFileTypeDescription(stat: FileStatData): string {
  if (stat.type === 'directory') return 'File Folder';
  if (stat.type === 'symlink') return 'Symbolic Link';
  if (stat.type === 'other') return 'Special File';
  const ext = stat.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext && ext !== stat.name.toLowerCase()) return `${ext.toUpperCase()} File`;
  return 'File';
}

function formatSizeDetailed(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size < 10 ? size.toFixed(2) : size < 100 ? size.toFixed(1) : Math.round(size)} ${units[i]}`;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
