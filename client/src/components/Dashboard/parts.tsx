// EX8.6: System dashboard — shared LumenOS v3 card pieces
// DashCard (lumen-card shell with icon tile + title + meta), Ring (usage ring),
// MonoChip (OS / kernel / IP chips).
// @see docs/phases/phase-ex8.md

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

// ─── Card shell ─────────────────────────────────────────────────────────────

interface DashCardProps {
  icon: LucideIcon;
  title: string;
  /** Right-aligned 13px caption ("8 cores", "11.7 GB free") */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DashCard({ icon: Icon, title, meta, children, className }: DashCardProps) {
  return (
    <section className={cn('lumen-card flex min-w-0 flex-col rounded-[22px] p-5', className)}>
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-edge bg-fill">
          <Icon className="h-[17px] w-[17px] text-label-2" strokeWidth={1.75} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[17px] font-bold text-foreground">{title}</h3>
        {meta !== undefined && (
          <span className="shrink-0 text-[13px] text-label-2 tabular-nums">{meta}</span>
        )}
      </header>
      {children}
    </section>
  );
}

// ─── Usage ring ─────────────────────────────────────────────────────────────

interface RingProps {
  /** 0–100 */
  value: number;
  size: number;
  stroke: number;
  /** Tailwind stroke-* class for the arc */
  arcClassName: string;
  children?: ReactNode;
}

export function Ring({ value, size, stroke, arcClassName, children }: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-fill-2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className={cn('transition-[stroke-dashoffset] duration-500', arcClassName)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ─── Mono chip ──────────────────────────────────────────────────────────────

export function MonoChip({ children, title, className }: { children: ReactNode; title?: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block min-w-0 max-w-full truncate rounded-[6px] border border-edge bg-chip px-2 py-0.5 font-mono text-[12px] leading-5 text-foreground',
        className,
      )}
      title={title}
    >
      {children}
    </span>
  );
}
