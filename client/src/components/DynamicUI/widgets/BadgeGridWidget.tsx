// EX1.2: BadgeGrid Widget — grid of Badge components
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { BadgeGridWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type BadgeGridWidget = z.infer<typeof BadgeGridWidgetSchema>;

export function BadgeGridWidget({ widget }: { widget: BadgeGridWidget }) {
  const { title, badges } = widget;

  return (
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
        <div className="flex flex-wrap gap-2">
          {badges.map((badge, i) => (
            <Badge key={i} variant={badge.variant}>
              {badge.label}: {badge.value}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
