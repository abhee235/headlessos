// EX1.2 + EX1.12: Widget Renderer — dispatches by widget.type via registry
// Wraps widgets with dataSource in RefreshableWidget for live data refresh
// @see docs/phases/phase-ex1.md

import type { Widget, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { getWidget } from './widget-registry';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshableWidget } from './RefreshableWidget';
import { useDynamicViewContext } from './DynamicViewContext';
import { useWidgetRefresh } from '@/hooks/useWidgetRefresh';

interface DataSource {
  command: string;
  refreshInterval: number;
  parseMode: 'json' | 'text';
}

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

  const ds = (widget as Record<string, unknown>).dataSource as DataSource | null | undefined;

  if (ds?.command) {
    return (
      <LiveWidgetWrapper widget={widget} dataSource={ds}>
        {(liveWidget) => (
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
            <Component widget={liveWidget as Widget} />
          </div>
        )}
      </LiveWidgetWrapper>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
      <Component widget={widget as Widget} />
    </div>
  );
}

/** Wrapper that handles auto-refresh for widgets with dataSource */
function LiveWidgetWrapper({
  widget,
  dataSource,
  children,
}: {
  widget: DeepPartial<Widget>;
  dataSource: DataSource;
  children: (widget: DeepPartial<Widget>) => React.ReactNode;
}) {
  const { serverId } = useDynamicViewContext();

  const { refreshing, paused, pause, resume, refresh } = useWidgetRefresh({
    serverId,
    dataSource,
  });

  return (
    <RefreshableWidget
      refreshing={refreshing}
      paused={paused}
      onPause={pause}
      onResume={resume}
      onRefresh={refresh}
      showControls={!!serverId}
    >
      {children(widget)}
    </RefreshableWidget>
  );
}
