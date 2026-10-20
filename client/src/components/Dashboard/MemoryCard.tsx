// M2.2: Memory Card — memory usage display
// EX8.6: LumenOS v3 — usage ring + used/total, Swap bar underneath
// @see docs/phases/phase-2.md, docs/phases/phase-ex8.md

import { MemoryStick } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { DashCard, Ring } from './parts';

interface MemoryCardProps {
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    availableMb: number;
    swapTotalMb: number;
    swapUsedMb: number;
  };
}

export function MemoryCard({ memory }: MemoryCardProps) {
  const usedPercent = memory.totalMb > 0
    ? Math.round((memory.usedMb / memory.totalMb) * 100)
    : 0;

  const swapPercent = memory.swapTotalMb > 0
    ? Math.round((memory.swapUsedMb / memory.swapTotalMb) * 100)
    : 0;

  return (
    <DashCard icon={MemoryStick} title="Memory" meta={`${formatMb(memory.availableMb)} available`}>
      {/* RAM */}
      <div className={cn('flex flex-1 items-center gap-5', memory.swapTotalMb > 0 && 'mb-5')}>
        <Ring value={usedPercent} size={112} stroke={10} arcClassName="stroke-chart-3">
          <span className="text-[26px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">
            {usedPercent}
            <span className="ml-0.5 text-[14px] font-semibold">%</span>
          </span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-[.06em] text-label-3">RAM</span>
        </Ring>
        <div className="min-w-0">
          <p className="truncate text-[24px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-foreground">
            {formatMb(memory.usedMb)}
          </p>
          <p className="truncate text-[13px] text-label-2 tabular-nums">
            of {formatMb(memory.totalMb)} in use
          </p>
        </div>
      </div>

      {/* Swap */}
      {memory.swapTotalMb > 0 && (
        <div className="border-t border-border pt-4">
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="text-label-2">Swap</span>
            <span className="tabular-nums text-foreground">
              {formatMb(memory.swapUsedMb)} / {formatMb(memory.swapTotalMb)}
            </span>
          </div>
          <Progress value={swapPercent} aria-label="Swap usage" />
        </div>
      )}
    </DashCard>
  );
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}
