// EX1.2: Widget Renderer — dispatches by widget.type via registry
// @see docs/phases/phase-ex1.md

import type { Widget, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { getWidget } from './widget-registry';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

export function WidgetRenderer({ widget }: { widget: DeepPartial<Widget> }) {
  if (!widget.type) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  const Component = getWidget(widget.type as string);
  if (!Component) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unknown widget</AlertTitle>
        <AlertDescription>
          Widget type &ldquo;{widget.type as string}&rdquo; is not registered.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
      <Component widget={widget as Widget} />
    </div>
  );
}
