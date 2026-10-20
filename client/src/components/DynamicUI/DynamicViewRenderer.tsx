// EX1.2: DynamicViewRenderer — root renderer for DynamicView JSON
// Renders all sections vertically. Used by the playground for previewing views.
// @see docs/phases/phase-ex1.md

import type { DynamicView, DeepPartial, Layout } from 'headlessos-shared/schemas/dynamic-view';
import { LayoutRenderer } from './LayoutRenderer';
import { Skeleton } from '@/components/ui/skeleton';

interface DynamicViewRendererProps {
  view: DeepPartial<DynamicView>;
}

export function DynamicViewRenderer({ view }: DynamicViewRendererProps) {
  const sections = (view.sections ?? {}) as Record<string, DeepPartial<Layout>>;
  const sectionEntries = Object.entries(sections);

  if (sectionEntries.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48 rounded-full" />
        <Skeleton className="h-32 w-full rounded-[22px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {view.description && (
        <p className="text-sm text-label-2">{view.description}</p>
      )}
      {sectionEntries.map(([id, layout]) => (
        <div key={id}>
          {sectionEntries.length > 1 && (
            <h3 className="mb-3 text-[15px] font-bold capitalize">{id}</h3>
          )}
          <LayoutRenderer layout={layout} />
        </div>
      ))}
    </div>
  );
}
