// EX1: SectionContent — renders the content of an active sidebar section
// Each section is a Layout (stack/grid/tabs) rendered via LayoutRenderer.
// Used by DynamicAppWindow and DynamicUITabView to display content for the selected nav item.

import type { Layout, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { LayoutRenderer } from './LayoutRenderer';
import { Skeleton } from '@/components/ui/skeleton';

interface SectionContentProps {
  /** The Layout object to render for the active section (null = loading/empty) */
  layout: DeepPartial<Layout> | null;
}

/**
 * Renders the content for a given sidebar section.
 * Shows skeleton placeholders when the section is still loading (null during progressive rendering).
 */
export function SectionContent({ layout }: SectionContentProps) {
  if (!layout) {
    return (
      <div className="space-y-4 animate-pulse">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-8 w-5/6" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  return <LayoutRenderer layout={layout} />;
}
