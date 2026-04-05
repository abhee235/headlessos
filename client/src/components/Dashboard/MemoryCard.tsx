// M2.2: Memory Card — memory usage display
// @see docs/phases/phase-2.md

import { MemoryStick } from 'lucide-react';

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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MemoryStick className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-medium text-zinc-200">Memory</h3>
      </div>

      <div className="space-y-3">
        {/* RAM */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-zinc-500">RAM</span>
            <span className="text-zinc-300 font-mono">
              {formatMb(memory.usedMb)} / {formatMb(memory.totalMb)} ({usedPercent}%)
            </span>
          </div>
          <ProgressBar percent={usedPercent} color="purple" />
        </div>

        {/* Swap */}
        {memory.swapTotalMb > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-zinc-500">Swap</span>
              <span className="text-zinc-300 font-mono">
                {formatMb(memory.swapUsedMb)} / {formatMb(memory.swapTotalMb)} ({swapPercent}%)
              </span>
            </div>
            <ProgressBar percent={swapPercent} color="amber" />
          </div>
        )}

        {/* Details */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800">
          <span className="text-zinc-500">Available</span>
          <span className="text-zinc-400 font-mono">{formatMb(memory.availableMb)}</span>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const barColor =
    color === 'purple'
      ? 'bg-purple-500'
      : color === 'amber'
        ? 'bg-amber-500'
        : 'bg-blue-500';

  return (
    <div className="w-full bg-zinc-800 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-300 ${barColor}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}
