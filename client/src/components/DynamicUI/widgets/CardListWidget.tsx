// EX3-P.6: Card list widget — interface-style cards with icon, title, badge, details
// EX8.6: hairline rows, plate icon tiles, muted badges, token-coloured status dots
// @see docs/phases/phase-ex3.md

import type { z } from 'zod';
import type { CardListWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getLucideIcon } from './icon-helper';
import { WidgetCard } from './widget-card';

type CardListWidget = z.infer<typeof CardListWidgetSchema>;

const DOT_CLASS: Record<string, string> = {
  success: 'bg-success',
  destructive: 'bg-danger',
  warning: 'bg-warning',
};

export function CardListWidget({ widget }: { widget: CardListWidget }) {
  const { title, items } = widget;

  return (
    <WidgetCard title={title}>
      <div className="divide-y divide-border">
        {items.map((item, idx) => {
          const IconComp = item.icon ? getLucideIcon(item.icon) : null;

          return (
            <div
              key={idx}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              {/* Icon */}
              {IconComp && (
                <div className="lumen-plate grid h-9 w-9 shrink-0 place-items-center rounded-[11px]">
                  <IconComp className="h-[18px] w-[18px] text-label-2" strokeWidth={1.75} />
                </div>
              )}

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">
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
                            'mr-0.5 inline-block h-1.5 w-1.5 rounded-full',
                            DOT_CLASS[item.badge.variant ?? ''] ?? 'bg-current',
                          )}
                        />
                      )}
                      {item.badge.label}
                    </Badge>
                  )}
                </div>

                {item.subtitle && (
                  <p className="mt-0.5 truncate text-xs text-label-2">
                    {item.subtitle}
                  </p>
                )}

                {/* Detail key-value pairs */}
                {item.details && item.details.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {item.details.map((d, di) => (
                      <span key={di} className="text-xs">
                        <span className="text-label-3">{d.label}:</span>{' '}
                        <span className="text-label-2">{d.value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-label-3">
            No items
          </p>
        )}
      </div>
    </WidgetCard>
  );
}
