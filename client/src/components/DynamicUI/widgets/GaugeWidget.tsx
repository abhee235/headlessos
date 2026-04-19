// EX3-A.4: Gauge Widget — semicircular arc with threshold-based coloring
// Uses recharts PieChart as a semicircle (startAngle=180, endAngle=0)
// @see docs/phases/phase-ex3.md

import type { z } from 'zod';
import type { GaugeWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell } from 'recharts';
import { cn } from '@/lib/utils';

type GaugeWidgetData = z.infer<typeof GaugeWidgetSchema>;

/** Size presets: width/height in px */
const SIZE_MAP = {
  sm: { width: 120, height: 70, fontSize: 'text-lg', innerRadius: '55%', outerRadius: '80%' },
  md: { width: 180, height: 100, fontSize: 'text-2xl', innerRadius: '58%', outerRadius: '82%' },
  lg: { width: 240, height: 130, fontSize: 'text-3xl', innerRadius: '60%', outerRadius: '84%' },
} as const;

/** Default thresholds: green up to 70, yellow up to 90, red up to 100 */
const DEFAULT_THRESHOLDS = [
  { value: 70, color: 'success' as const, label: 'Normal' },
  { value: 90, color: 'warning' as const, label: 'Warning' },
  { value: 100, color: 'destructive' as const, label: 'Critical' },
];

/** Map threshold color names to CSS variable-based colors */
const COLOR_MAP: Record<string, string> = {
  success: 'rgb(var(--success))',
  warning: 'rgb(var(--warning))',
  destructive: 'rgb(var(--destructive))',
  primary: 'rgb(var(--primary))',
  secondary: 'rgb(var(--secondary))',
};

/**
 * Get the fill color for the given value based on thresholds.
 * Uses the threshold whose value is >= the current value, or the last threshold.
 */
function getThresholdColor(
  value: number,
  thresholds: Array<{ value: number; color: string }>,
): string {
  for (const t of thresholds) {
    if (value <= t.value) {
      return COLOR_MAP[t.color] ?? COLOR_MAP.primary;
    }
  }
  // Beyond all thresholds — use last one
  const last = thresholds[thresholds.length - 1];
  return last ? (COLOR_MAP[last.color] ?? COLOR_MAP.primary) : COLOR_MAP.primary;
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

  const sizeConfig = SIZE_MAP[size] ?? SIZE_MAP.md;
  const resolvedThresholds = thresholds?.length ? thresholds : DEFAULT_THRESHOLDS;

  // Clamp value to [min, max] range
  const clampedValue = Math.max(min, Math.min(max, value));
  const range = max - min || 1;
  const fillAmount = ((clampedValue - min) / range) * 100;
  const emptyAmount = 100 - fillAmount;

  const fillColor = getThresholdColor(clampedValue, resolvedThresholds);

  // Data for the semicircle: one filled slice + one empty/background slice
  const data = [
    { name: 'value', amount: fillAmount },
    { name: 'empty', amount: emptyAmount },
  ];

  return (
    <Card>
      {title && (
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn('flex flex-col items-center', title ? 'pt-0' : 'pt-4')}>
        <div className="relative" style={{ width: sizeConfig.width, height: sizeConfig.height }}>
          <PieChart width={sizeConfig.width} height={sizeConfig.height * 2}>
            <Pie
              data={data}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={sizeConfig.innerRadius}
              outerRadius={sizeConfig.outerRadius}
              dataKey="amount"
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={fillColor} />
              <Cell fill="rgb(var(--muted))" />
            </Pie>
          </PieChart>
          {/* Center value overlay */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-end pb-1"
          >
            <span className={cn('font-bold leading-none', sizeConfig.fontSize)}>
              {typeof value === 'number' ? value.toLocaleString() : value}
              {unit && <span className="text-xs text-muted-foreground ml-0.5">{unit}</span>}
            </span>
          </div>
        </div>
        {label && (
          <span className="text-xs text-muted-foreground mt-1">{label}</span>
        )}
      </CardContent>
    </Card>
  );
}
