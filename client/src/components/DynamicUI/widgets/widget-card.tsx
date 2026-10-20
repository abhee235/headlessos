// EX8.6: LumenOS v3 building blocks shared by the Dynamic UI widgets
//   WidgetCard  — .lumen-card (radius 22px), 20px padding, 15px bold title + 12px meta
//   StatBlock   — label / big number (28–40px bold, -0.02em) / unit / trend / caption
//   Meter       — 6px recessed track with a lit (or semantic) fill
//   LumenAlert  — .lumen-section (radius 20px) with a tinted round icon
//   PANE_CLASS  — recessed bg-paper pane (radius 14px, mono) for code, logs, trees, JSON
// @see Custom OS UI Design/handoff/HANDOFF.md §3 "DynamicUI widgets"

import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ── Shared class recipes ─────────────────────────────────────────

/** Recessed text/code pane: code blocks, log viewers, trees, raw JSON */
export const PANE_CLASS = 'rounded-[14px] border border-edge bg-paper font-mono text-foreground';

/** Multi-line field on bg-field (the Textarea primitive is not Lumen-styled yet) */
export const TEXTAREA_FIELD_CLASS =
  'rounded-[14px] border-edge bg-field px-3.5 py-2 text-[13px] shadow-none placeholder:text-label-3 ' +
  'focus-visible:border-accent-solid/60 focus-visible:ring-[3px] focus-visible:ring-accent-soft';

/** 11px uppercase group / column heading */
export const GROUP_LABEL_CLASS = 'text-[11px] font-bold uppercase tracking-[.06em] text-label-3';

// ── WidgetCard ───────────────────────────────────────────────────

interface WidgetCardProps {
  title?: React.ReactNode;
  /** Right-aligned 12px caption next to the title (counts, language, …) */
  meta?: React.ReactNode;
  /** Content runs edge to edge (tables); the title keeps its 20px inset */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function WidgetCard({ title, meta, flush = false, className, children }: WidgetCardProps) {
  return (
    <Card className={cn('h-full min-w-0 p-5', flush && 'px-0 pb-1.5', className)}>
      {(title || meta) && (
        <div className={cn('mb-3.5 flex items-baseline justify-between gap-3', flush && 'px-5')}>
          {title && <h3 className="min-w-0 truncate text-[15px] font-bold leading-tight">{title}</h3>}
          {meta && <span className="shrink-0 text-xs text-label-2">{meta}</span>}
        </div>
      )}
      {children}
    </Card>
  );
}

// ── StatBlock (StatCard + SparklineStat) ─────────────────────────

interface StatBlockProps {
  title?: string | null;
  value: React.ReactNode;
  unit?: string | null;
  trend?: 'up' | 'down' | 'neutral' | null;
  description?: string | null;
}

export function StatBlock({ title, value, unit, trend, description }: StatBlockProps) {
  return (
    <div className="min-w-0">
      {title && <p className="truncate text-[13px] font-medium text-label-2">{title}</p>}
      <div className={cn('flex items-baseline gap-1.5', title && 'mt-1.5')}>
        <span className="truncate text-[32px] font-bold leading-none tracking-[-0.02em]">{value}</span>
        {unit && <span className="text-[15px] font-semibold text-label-2">{unit}</span>}
        {trend && trend !== 'neutral' && (
          <span
            className={cn(
              'ml-0.5 inline-grid h-5 min-w-5 place-items-center self-center rounded-full px-1 text-xs font-bold',
              trend === 'up' ? 'bg-success/14 text-success' : 'bg-danger/14 text-danger',
            )}
          >
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>
      {description && <p className="mt-2 truncate text-xs text-label-3">{description}</p>}
    </div>
  );
}

// ── Meter ────────────────────────────────────────────────────────

export type MeterTone = 'accent' | 'success' | 'warning' | 'destructive';

const METER_FILL: Record<MeterTone, string> = {
  accent: 'lumen-lit',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};

/** Accent below 75%, warning from 75%, destructive from 90% (handoff meter rule) */
export function toneForPercent(pct: number): MeterTone {
  if (pct >= 90) return 'destructive';
  if (pct >= 75) return 'warning';
  return 'accent';
}

interface MeterProps {
  value: number;
  tone?: MeterTone;
  className?: string;
  'aria-label'?: string;
}

export function Meter({ value, tone = 'accent', className, ...rest }: MeterProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={rest['aria-label']}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-chip', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', METER_FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── LumenAlert ───────────────────────────────────────────────────

export type AlertTone = 'default' | 'success' | 'warning' | 'destructive';

const ALERT_TONES: Record<AlertTone, { icon: LucideIcon; chip: string }> = {
  default: { icon: Info, chip: 'border-accent-solid/30 bg-accent-solid/14 text-accent-text' },
  success: { icon: CheckCircle2, chip: 'border-success/30 bg-success/14 text-success' },
  warning: { icon: AlertTriangle, chip: 'border-warning/30 bg-warning/14 text-warning' },
  destructive: { icon: AlertCircle, chip: 'border-danger/30 bg-danger/14 text-danger' },
};

interface LumenAlertProps {
  tone?: AlertTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function LumenAlert({ tone = 'default', title, children, className }: LumenAlertProps) {
  const { icon: Icon, chip } = ALERT_TONES[tone] ?? ALERT_TONES.default;
  return (
    <div
      role="alert"
      className={cn(
        'lumen-section flex gap-3.5 rounded-[20px] px-5 py-4',
        title ? 'items-start' : 'items-center',
        className,
      )}
    >
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full border', chip)}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="pt-0.5 text-sm font-semibold leading-snug">{title}</p>}
        {children && (
          <div className={cn('text-[13px] leading-relaxed', title ? 'mt-0.5 text-label-2' : 'text-foreground')}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
