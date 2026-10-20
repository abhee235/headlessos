// EX8.6: Processor Card — arc gauge with a knob + per-core load tiles
// Data comes from the Task Manager endpoint (fetchTaskManager), fetched by DashboardView.
// @see docs/phases/phase-ex8.md

import { Cpu } from 'lucide-react';
import type { CpuStatsData } from '../../lib/api';
import { cn } from '@/lib/utils';
import { loadFill } from '../TaskManager/parts';
import { DashCard } from './parts';

interface ProcessorCardProps {
  /** null until the first Task Manager sample arrives (or if it failed) */
  cpu: CpuStatsData | null;
}

export function ProcessorCard({ cpu }: ProcessorCardProps) {
  return (
    <DashCard
      icon={Cpu}
      title="Processor"
      meta={cpu ? `${cpu.coreCount} core${cpu.coreCount !== 1 ? 's' : ''}` : undefined}
    >
      <div className="mb-5 flex flex-1 items-center justify-center">
        <ArcGauge value={cpu?.overallPercent ?? 0} label={cpu ? undefined : '—'} />
      </div>

      {cpu && cpu.cores.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(18px,1fr))] gap-1.5">
          {cpu.cores.map((core) => (
            <CoreTile key={core.id} id={core.id} percent={core.percent} />
          ))}
        </div>
      ) : (
        <p className="text-center text-[12px] text-label-3">
          {cpu ? 'No per-core data' : 'CPU data unavailable'}
        </p>
      )}
    </DashCard>
  );
}

// ─── Arc gauge: 270° track, accent value arc, lit knob at the end ───────────

const SIZE = 152;
const C = SIZE / 2;
const R = 66; // value arc
const R_TICKS = 54; // tick ring
const START = -135; // degrees, 0 = 12 o'clock, clockwise
const SWEEP = 270;

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) };
}

function arcPath(r: number) {
  const a = polar(r, START);
  const b = polar(r, START + SWEEP);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 1 1 ${b.x} ${b.y}`;
}

function ArcGauge({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const knob = polar(R, START + (SWEEP * pct) / 100);

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <defs>
          <linearGradient id="cpu-arc" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--viz-violet-from)" />
            <stop offset="1" stopColor="var(--viz-violet-to)" />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d={arcPath(R)} fill="none" strokeWidth={8} strokeLinecap="round" className="stroke-fill-2" />
        {/* Value */}
        {pct > 0 && (
          <path
            d={arcPath(R)}
            fill="none"
            strokeWidth={8}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${pct} 100`}
            stroke="url(#cpu-arc)"
            className="lumen-glow-violet transition-[stroke-dasharray] duration-500"
          />
        )}
        {/* Tick ring */}
        <path
          d={arcPath(R_TICKS)}
          fill="none"
          strokeWidth={5}
          strokeDasharray="1.2 3.4"
          className="stroke-label-3 opacity-60"
        />
        {/* Inner disc */}
        <circle cx={C} cy={C} r={44} className="fill-fill" />
      </svg>

      {/* Knob — violet with a white ring, as in LumenOS */}
      <span
        className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-viz-violet shadow-[0_2px_8px_rgba(0,0,0,.4)] transition-[left,top] duration-500"
        style={{ left: knob.x, top: knob.y }}
        aria-hidden
      >
      </span>

      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        role="meter"
        aria-label="CPU load"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <span className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">
          {label ?? Math.round(pct)}
          {!label && <span className="ml-0.5 text-[14px] font-semibold">%</span>}
        </span>
        <span className="mt-1 text-[12px] text-label-2">load</span>
      </div>
    </div>
  );
}

// ─── Core tile: recessed tile, load-coloured fill rising from the bottom ────

function CoreTile({ id, percent }: { id: number; percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="relative h-10 overflow-hidden rounded-[6px] border border-edge bg-chip"
      title={`Core ${id}: ${pct.toFixed(0)}%`}
    >
      <div
        className={cn('absolute inset-x-0 bottom-0 min-h-[3px] transition-[height] duration-300', loadFill(pct))}
        style={{ height: `${pct}%` }}
      />
    </div>
  );
}
