// EX1.2: BadgeGrid Widget — grid of Badge components
// EX8.6: Lumen card + muted status badges
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { BadgeGridWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Badge } from '@/components/ui/badge';
import { WidgetCard } from './widget-card';

type BadgeGridWidget = z.infer<typeof BadgeGridWidgetSchema>;

export function BadgeGridWidget({ widget }: { widget: BadgeGridWidget }) {
  const { title, badges } = widget;

  return (
    <WidgetCard title={title}>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge, i) => (
          <Badge key={i} variant={badge.variant} className="px-2.5 py-1 text-xs">
            {badge.label}: {badge.value}
          </Badge>
        ))}
      </div>
    </WidgetCard>
  );
}
