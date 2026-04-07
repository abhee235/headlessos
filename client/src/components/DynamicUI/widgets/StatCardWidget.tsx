// EX1.2: StatCard Widget — card with value, trend, description
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { StatCardWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type StatCardWidget = z.infer<typeof StatCardWidgetSchema>;

export function StatCardWidget({ widget }: { widget: StatCardWidget }) {
  const { title, value, unit, description, trend } = widget;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{value}</span>
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
            {trend && trend !== 'neutral' && (
              <span
                className={cn(
                  'ml-1 text-xs font-medium',
                  trend === 'up' && 'text-success',
                  trend === 'down' && 'text-destructive',
                )}
              >
                {trend === 'up' ? '↑' : '↓'}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
