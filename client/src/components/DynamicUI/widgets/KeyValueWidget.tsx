// EX1.2: KeyValue Widget — grid of key-value pairs
// EX8.6: vertical = hairline rows (label left, value right); grids = recessed chip tiles
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { KeyValueWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { cn } from '@/lib/utils';
import { WidgetCard } from './widget-card';

type KeyValueWidget = z.infer<typeof KeyValueWidgetSchema>;

const layoutClasses: Record<string, string> = {
  'vertical': 'grid-cols-1',
  'grid-2': 'grid-cols-2',
  'grid-3': 'grid-cols-3',
  'grid-4': 'grid-cols-4',
};

export function KeyValueWidget({ widget }: { widget: KeyValueWidget }) {
  const { title, pairs, layout } = widget;
  const gridCols = layoutClasses[layout] ?? 'grid-cols-2';

  if (layout === 'vertical') {
    return (
      <WidgetCard title={title}>
        <div className="divide-y divide-border">
          {pairs.map((pair, i) => (
            <div key={i} className="flex min-h-10 items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
              <p className="shrink-0 text-sm text-label-2">{pair.key}</p>
              <p className="min-w-0 truncate text-right text-[13px] font-semibold">{pair.value}</p>
            </div>
          ))}
        </div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title={title}>
      <div className={cn('grid gap-2.5', gridCols)}>
        {pairs.map((pair, i) => (
          <div key={i} className="min-w-0 rounded-[14px] bg-chip px-3.5 py-2.5">
            <p className="truncate text-xs text-label-2">{pair.key}</p>
            <p className="mt-0.5 truncate text-sm font-semibold">{pair.value}</p>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}
