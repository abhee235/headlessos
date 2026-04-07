// EX1.2: Stack Layout — vertical list of widgets
// @see docs/phases/phase-ex1.md

import type { DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import type { z } from 'zod';
import type { StackLayoutSchema } from 'headlessos-shared/schemas/dynamic-view';
import { cn } from '@/lib/utils';
import { WidgetRenderer } from '../WidgetRenderer';

type StackLayoutType = z.infer<typeof StackLayoutSchema>;

const gapMap: Record<string, string> = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

export function StackLayout({ layout }: { layout: DeepPartial<StackLayoutType> }) {
  const gap = gapMap[(layout.gap as string) ?? 'md'] ?? 'gap-4';
  const widgets = (layout.widgets ?? []) as DeepPartial<StackLayoutType>['widgets'] & Array<unknown>;

  return (
    <div className={cn('flex flex-col', gap)}>
      {widgets.map((widget, i) => (
        <WidgetRenderer key={i} widget={widget as DeepPartial<StackLayoutType['widgets'][number]>} />
      ))}
    </div>
  );
}
