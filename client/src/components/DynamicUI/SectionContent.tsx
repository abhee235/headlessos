// EX1: SectionContent — renders the children of an active sidebar section
// Used by DynamicAppWindow and DynamicUITabView to display content for the selected nav item.

import type { Layout, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { ContentRenderer } from './ContentRenderer';
import { Skeleton } from '@/components/ui/skeleton';

interface SectionContentProps {
  /** Array of children (widgets/layouts) to render for the active section */
  children: unknown[];
}

/**
 * Renders the content for a given sidebar section.
 * Shows skeleton placeholders when the content is still loading (empty array during progressive rendering).
 */
export function SectionContent({ children }: SectionContentProps) {
  if (children.length === 0) {
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

  return (
    <div className="space-y-4">
      {children.filter(Boolean).map((child, ci) => (
        <ContentRenderer key={ci} item={child as DeepPartial<Layout>} />
      ))}
    </div>
  );
}
