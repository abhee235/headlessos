// EX3-P.8: ContentRenderer — dispatches nested layouts vs widgets
// When layouts contain children that can be either sub-layouts or widgets,
// this component checks the discriminant and routes accordingly.
// @see docs/phases/phase-ex3.md

import type { DeepPartial, Layout, Widget } from 'headlessos-shared/schemas/dynamic-view';
import { LayoutRenderer } from './LayoutRenderer';
import { WidgetRenderer } from './WidgetRenderer';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A child in a layout's `children` array can be either a Widget (has `type`)
 * or a nested Layout (has `layout`). This renderer dispatches accordingly.
 * Note: KeyValueWidget also has a `layout` field (e.g., 'grid-2'), so we
 * check `type` first — widgets always have `type`, layouts never do.
 */
export function ContentRenderer({ item }: { item: DeepPartial<Widget | Layout> }) {
  if (!item) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  // Check for widget FIRST — widgets have `type`, layouts don't
  if ('type' in item && item.type) {
    return <WidgetRenderer widget={item as DeepPartial<Widget>} />;
  }

  // Then check for layout — layouts have `layout` key
  if ('layout' in item && item.layout) {
    return <LayoutRenderer layout={item as DeepPartial<Layout>} />;
  }

  // Streaming / partial — no discriminant yet
  return <Skeleton className="h-24 w-full rounded-lg" />;
}
