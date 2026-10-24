// EX3-A.4: Gauge Widget — arc gauge with threshold-based coloring
// EX8.6: LumenOS "Processor" arc — 240° sweep, dotted tick ring, track arc,
// accent value arc with rounded caps, white knob, big centred number.
// @see docs/phases/phase-ex3.md, docs/phases/phase-ex8.md

import { useId } from 'react';
import type { z } from 'zod';
import type { GaugeWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { cn } from '@/lib/utils';
import { WidgetCard } from './widget-card';

type GaugeWidgetData = z.infer<typeof GaugeWidgetSchema>;

/** Size presets — geometry is the 180px reference gauge scaled */
const SIZE_MAP = {
  sm: { box: 132, stroke: 7, value: 'text-[22px]', unit: 'text-xs', knob: 'h-4 w-4 -ml-2 -mt-2 border-[3px]' },
  md: { box: 180, stroke: 9, value: 'text-[30px]', unit: 'text-base', knob: 'h-5 w-5 -ml-2.5 -mt-2.5 border-4' },
  lg: { box: 220, stroke: 10, value: 'text-[38px]', unit: 'text-lg', knob: 'h-[22px] w-[22px] -ml-[11px] -mt-[11px] border-4' },
} as const;

/** Arc sweep in degrees, 0° = 12 o'clock */
const A0 = -120;
const A1 = 120;

/** Default thresholds (when none are given): accent up to 70, warning up to 90, destructive up to 100 */
const DEFAULT_THRESHOLDS = [
  { value: 70, color: 'primary' as const, label: 'Normal' },
  { value: 90, color: 'warning' as const, label: 'Warning' },
  { value: 100, color: 'destructive' as const, label: 'Critical' },
];

/** Threshold color names → theme tokens. `null` = accent gradient. */
const COLOR_MAP: Record<string, string | null> = {
  primary: null,
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  secondary: 'var(--lumen-label3)',
};

/**
 * Get the fill color for the given value based on thresholds.
 * Uses the threshold whose value is >= the current value, or the last threshold.
 */
function getThresholdColor(
  value: number,
  thresholds: Array<{ value: number; color: string }>,
): string | null {
  for (const t of thresholds) {
    if (value <= t.value) {
      return COLOR_MAP[t.color] ?? null;
    }
  }
  // Beyond all thresholds — use last one
  const last = thresholds[thresholds.length - 1];
  return last ? (COLOR_MAP[last.color] ?? null) : null;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function GaugeWidget({ widget }: { widget: GaugeWidgetData }) {
  const {
    title,
    value,
    min = 0,
    max = 100,
    unit,
    label,
    thresholds,
    size = 'md',
  } = widget;

  const gradientId = `gauge-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const cfg = SIZE_MAP[size] ?? SIZE_MAP.md;
  const resolvedThresholds = thresholds?.length ? thresholds : DEFAULT_THRESHOLDS;

  // Clamp value to [min, max] range
  const clampedValue = Math.max(min, Math.min(max, value));
  const range = max - min || 1;
  const fraction = (clampedValue - min) / range;

  const thresholdColor = getThresholdColor(clampedValue, resolvedThresholds);
  const arcStroke = thresholdColor ?? `url(#${gradientId})`;

  // Geometry (reference: 180×150 box, centre 90/90, r 76, tick ring r 58, centre disc 88)
  const s = cfg.box / 180;
  const cx = 90 * s;
  const cy = 90 * s;
  const r = 76 * s;
  const height = 150 * s;
  const disc = 88 * s;
  const knobAngle = A0 + (A1 - A0) * fraction;
  const [kx, ky] = polar(cx, cy, r, knobAngle);

  return (
    <WidgetCard title={title}>
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: cfg.box, height }}>
          <svg
            width={cfg.box}
            height={height}
            viewBox={`0 0 ${cfg.box} ${height}`}
            className="absolute inset-0 overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="var(--lumen-accent)" />
                <stop offset="1" stopColor="var(--lumen-accent-hi)" />
              </linearGradient>
            </defs>
            {/* Dotted tick ring */}
            <path
              d={arcPath(cx, cy, 58 * s, A0, A1)}
              fill="none"
              stroke="var(--lumen-label3)"
              strokeOpacity={0.7}
              strokeWidth={6 * s}
              strokeDasharray={`${1.2 * s} ${4 * s}`}
            />
            {/* Track */}
            <path
              d={arcPath(cx, cy, r, A0, A1)}
              fill="none"
              stroke="var(--lumen-track)"
              strokeWidth={cfg.stroke}
              strokeLinecap="round"
            />
            {/* Value */}
            <path
              d={arcPath(cx, cy, r, A0, Math.max(A0 + 0.5, knobAngle))}
              fill="none"
              stroke={arcStroke}
              strokeWidth={cfg.stroke}
              strokeLinecap="round"
            />
          </svg>

          {/* Knob — white thumb like the Slider primitive */}
          <div
            className={cn('absolute rounded-full border-white shadow-lg', cfg.knob, !thresholdColor && 'bg-accent-solid')}
            style={{ left: kx, top: ky, backgroundColor: thresholdColor ?? undefined }}
          />

          {/* Centre disc with the big number */}
          <div
            className="absolute flex flex-col items-center justify-center rounded-full bg-chip shadow-[var(--lumen-spec)]"
            style={{ left: cx - disc / 2, top: cy - disc / 2, width: disc, height: disc }}
          >
            <span className={cn('font-bold leading-none tracking-[-0.02em]', cfg.value)}>
              {typeof value === 'number' ? value.toLocaleString() : value}
              {unit && <span className={cn('ml-0.5 font-semibold text-label-2', cfg.unit)}>{unit}</span>}
            </span>
            {label && (
              <span className="mt-1 max-w-[85%] truncate text-xs text-label-2">{label}</span>
            )}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
