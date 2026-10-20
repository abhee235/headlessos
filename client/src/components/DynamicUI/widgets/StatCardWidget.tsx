// EX1.2: StatCard Widget — card with value, trend, description
// EX8.6: Lumen card + big-number type spec
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { StatCardWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { StatBlock, WidgetCard } from './widget-card';

type StatCardWidget = z.infer<typeof StatCardWidgetSchema>;

export function StatCardWidget({ widget }: { widget: StatCardWidget }) {
  const { title, value, unit, description, trend } = widget;

  return (
    <WidgetCard>
      <StatBlock title={title} value={value} unit={unit} trend={trend} description={description} />
    </WidgetCard>
  );
}
