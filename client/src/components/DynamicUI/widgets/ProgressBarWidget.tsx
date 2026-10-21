// EX1.2: ProgressBar Widget — progress bar with label and variant
// EX8.6: Lumen card + 6px meter (lit accent, or the semantic variant colour)
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { ProgressBarWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Meter, WidgetCard, type MeterTone } from './widget-card';

type ProgressBarWidget = z.infer<typeof ProgressBarWidgetSchema>;

const variantTones: Record<string, MeterTone> = {
  default: 'accent',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
};

export function ProgressBarWidget({ widget }: { widget: ProgressBarWidget }) {
  const { title, value, label, variant } = widget;

  return (
    <WidgetCard title={title}>
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          {label && <span className="min-w-0 truncate text-label-2">{label}</span>}
          <span className="ml-auto font-semibold">{value}%</span>
        </div>
        <Meter value={value} tone={variantTones[variant] ?? 'accent'} aria-label={title ?? label ?? undefined} />
      </div>
    </WidgetCard>
  );
}
