// EX1.2 + EX1.6: Layout Renderer — dispatches by layout.layout type
// @see docs/phases/phase-ex1.md

import type { Layout, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { StackLayout } from './layouts/StackLayout';
import { GridLayout } from './layouts/GridLayout';
import { TabsLayout } from './layouts/TabsLayout';
import { SidebarLayout } from './layouts/SidebarLayout';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

export function LayoutRenderer({ layout }: { layout: DeepPartial<Layout> }) {
  if (!layout.layout) {
    return <Skeleton className="h-32 w-full rounded-lg" />;
  }

  switch (layout.layout) {
    case 'stack':
      return <StackLayout layout={layout as DeepPartial<Layout & { layout: 'stack' }>} />;
    case 'grid':
      return <GridLayout layout={layout as DeepPartial<Layout & { layout: 'grid' }>} />;
    case 'tabs':
      return <TabsLayout layout={layout as DeepPartial<Layout & { layout: 'tabs' }>} />;
    case 'sidebar':
      return <SidebarLayout layout={layout as DeepPartial<Layout & { layout: 'sidebar' }>} />;
    default:
      return (
        <Alert variant="destructive">
          <AlertTitle>Unknown layout</AlertTitle>
          <AlertDescription>
            Layout type &ldquo;{(layout as { layout: string }).layout}&rdquo; is not supported.
          </AlertDescription>
        </Alert>
      );
  }
}
