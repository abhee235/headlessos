// EX1: SectionContent — renders the content of an active sidebar section
// Each section is a Layout (stack/grid/tabs) rendered via LayoutRenderer.
// Used by DynamicAppWindow and DynamicUITabView to display content for the selected nav item.

import type { Layout, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { LayoutRenderer } from './LayoutRenderer';
import { Skeleton } from '@/components/ui/skeleton';

interface SectionContentProps {
  /** The Layout object to render for the active section (null = loading/empty) */
  layout: DeepPartial<Layout> | null;
  /** Whether the parent view is still loading (progressive generation) */
  loading?: boolean;
}

/** Check whether a layout has meaningful renderable content */
function isLayoutEmpty(layout: DeepPartial<Layout>): boolean {
  if (!layout.layout) return true;
  const children = (layout as Record<string, unknown>).children;
  if (Array.isArray(children) && children.length === 0) return true;
  return false;
}

/**
 * Renders the content for a given sidebar section.
 * Shows skeleton placeholders when the section is still loading (null during progressive rendering).
 */
export function SectionContent({ layout, loading }: SectionContentProps) {
  if (!layout || (loading && isLayoutEmpty(layout))) {
    return (
      <div className="space-y-4 animate-pulse">
        <Skeleton className="h-5 w-32 rounded-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 w-full rounded-[22px]" />
          <Skeleton className="h-24 w-full rounded-[22px]" />
          <Skeleton className="h-24 w-full rounded-[22px]" />
        </div>
        <Skeleton className="h-[34px] w-full rounded-[10px]" />
        <Skeleton className="h-[34px] w-3/4 rounded-[10px]" />
        <Skeleton className="h-[34px] w-5/6 rounded-[10px]" />
        <Skeleton className="h-32 w-full rounded-[22px]" />
      </div>
    );
  }

  return <LayoutRenderer layout={layout} />;
}
