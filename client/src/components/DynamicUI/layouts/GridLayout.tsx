// EX1.2: Grid Layout — CSS grid with configurable columns
// @see docs/phases/phase-ex1.md

import type { DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import type { z } from 'zod';
import type { GridLayoutSchema } from 'headlessos-shared/schemas/dynamic-view';
import { cn } from '@/lib/utils';
import { WidgetRenderer } from '../WidgetRenderer';

type GridLayoutType = z.infer<typeof GridLayoutSchema>;

const colsMap: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

export function GridLayout({ layout }: { layout: DeepPartial<GridLayoutType> }) {
  const cols = colsMap[(layout.columns as number) ?? 2] ?? 'grid-cols-2';
  const widgets = (layout.widgets ?? []) as DeepPartial<GridLayoutType>['widgets'] & Array<unknown>;

  return (
    <div className={cn('grid gap-4', cols)}>
      {widgets.map((widget, i) => (
        <WidgetRenderer key={i} widget={widget as DeepPartial<GridLayoutType['widgets'][number]>} />
      ))}
    </div>
  );
}
