// M2.2: Disk Card — disk usage display
// @see docs/phases/phase-2.md

import { HardDrive } from 'lucide-react';

interface DiskEntry {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: number;
  mountPoint: string;
}

interface DiskCardProps {
  disks: DiskEntry[];
}

export function DiskCard({ disks }: DiskCardProps) {
  // Filter out tiny/virtual filesystems, show meaningful ones
  const meaningful = disks.filter(
    d => !d.mountPoint.startsWith('/dev/shm') &&
         !d.mountPoint.startsWith('/proc') &&
         !d.mountPoint.startsWith('/sys') &&
         d.size !== '0',
  );

  const toShow = meaningful.length > 0 ? meaningful : disks;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <HardDrive className="w-4 h-4 text-green-400" />
        <h3 className="text-sm font-medium text-card-foreground">Disk Usage</h3>
      </div>

      <div className="space-y-3">
        {toShow.map((disk, i) => (
          <DiskRow key={`${disk.mountPoint}-${i}`} disk={disk} />
        ))}
      </div>
    </div>
  );
}

function DiskRow({ disk }: { disk: DiskEntry }) {
  const color =
    disk.usePercent >= 90
      ? 'bg-red-500'
      : disk.usePercent >= 70
        ? 'bg-amber-500'
        : 'bg-green-500';

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-foreground font-mono truncate max-w-[200px]" title={disk.mountPoint}>
          {disk.mountPoint}
        </span>
        <span className="text-muted-foreground font-mono shrink-0 ml-2">
          {disk.used} / {disk.size} ({disk.usePercent}%)
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${Math.min(disk.usePercent, 100)}%` }}
        />
      </div>
    </div>
  );
}
