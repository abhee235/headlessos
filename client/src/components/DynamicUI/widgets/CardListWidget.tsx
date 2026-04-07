// EX3-P.6: Card list widget — interface-style cards with icon, title, badge, details
// @see docs/phases/phase-ex3.md

import type { z } from 'zod';
import type { CardListWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getLucideIcon } from './icon-helper';

type CardListWidget = z.infer<typeof CardListWidgetSchema>;

export function CardListWidget({ widget }: { widget: CardListWidget }) {
  const { title, items } = widget;

  return (
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
        <div className="divide-y divide-border/40">
          {items.map((item, idx) => {
            const IconComp = item.icon ? getLucideIcon(item.icon) : null;

            return (
              <div
                key={idx}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                {/* Icon */}
                {IconComp && (
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50">
                    <IconComp size={16} className="text-foreground/50" />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {item.title}
                    </span>
                    {item.badge && (
                      <Badge
                        variant={item.badge.variant ?? 'default'}
                        className="shrink-0"
                      >
                        {item.badge.dot && (
                          <span
                            className={cn(
                              'mr-1.5 inline-block h-1.5 w-1.5 rounded-full',
                              item.badge.variant === 'success'
                                ? 'bg-emerald-400'
                                : item.badge.variant === 'destructive'
                                  ? 'bg-red-400'
                                  : item.badge.variant === 'warning'
                                    ? 'bg-amber-400'
                                    : 'bg-current',
                            )}
                          />
                        )}
                        {item.badge.label}
                      </Badge>
                    )}
                  </div>

                  {item.subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {item.subtitle}
                    </p>
                  )}

                  {/* Detail key-value pairs */}
                  {item.details && item.details.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      {item.details.map((d, di) => (
                        <span key={di} className="text-xs text-muted-foreground">
                          <span className="text-foreground/40">{d.label}:</span>{' '}
                          <span className="text-foreground/70">{d.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No items
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
