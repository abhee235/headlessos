// EX1.2: DynamicViewRenderer — root renderer for DynamicView JSON
// @see docs/phases/phase-ex1.md

import type { DynamicView, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { LayoutRenderer } from './LayoutRenderer';
import { Skeleton } from '@/components/ui/skeleton';

interface DynamicViewRendererProps {
  view: DeepPartial<DynamicView>;
}

export function DynamicViewRenderer({ view }: DynamicViewRendererProps) {
  if (!view.root) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {view.description && (
        <p className="text-sm text-muted-foreground">{view.description}</p>
      )}
      <LayoutRenderer layout={view.root} />
    </div>
  );
}
