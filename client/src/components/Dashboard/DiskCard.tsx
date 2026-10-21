// M2.2: Disk Card — disk usage display
// EX8.6: LumenOS v3 — a small usage ring per mount, in recessed tiles
// @see docs/phases/phase-2.md, docs/phases/phase-ex8.md

import { HardDrive } from 'lucide-react';
import { DashCard, Ring } from './parts';

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
    <DashCard
      icon={HardDrive}
      title="Disk usage"
      meta={`${toShow.length} mount${toShow.length !== 1 ? 's' : ''}`}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5">
        {toShow.map((disk, i) => (
          <DiskTile key={`${disk.mountPoint}-${i}`} disk={disk} />
        ))}
      </div>
    </DashCard>
  );
}

function DiskTile({ disk }: { disk: DiskEntry }) {
  const arc =
    disk.usePercent >= 90
      ? 'stroke-destructive'
      : disk.usePercent >= 70
        ? 'stroke-warning'
        : 'stroke-viz-green lumen-glow-green';

  return (
    <div className="flex min-w-0 flex-col items-center rounded-[16px] border border-edge bg-chip px-3 pb-3 pt-3.5 text-center">
      <Ring value={disk.usePercent} size={64} stroke={6} arcClassName={arc}>
        <span className="text-[14px] font-bold tabular-nums text-foreground">{disk.usePercent}%</span>
      </Ring>
      <span className="mt-2.5 w-full truncate font-mono text-[13px] text-foreground" title={disk.mountPoint}>
        {disk.mountPoint}
      </span>
      <span className="w-full truncate text-[12px] text-label-2 tabular-nums">
        {disk.used} / {disk.size}
      </span>
    </div>
  );
}
