// EX1.2: KeyValue Widget — grid of key-value pairs
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { KeyValueWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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

  return (
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
        <div className={cn('grid gap-3', gridCols)}>
          {pairs.map((pair, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs text-muted-foreground">{pair.key}</p>
              <p className="text-sm font-medium">{pair.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
