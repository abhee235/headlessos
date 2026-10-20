// EX1.2 + EX1.12 + EX5-A.2: Widget Renderer — dispatches by widget.type via registry
// Wraps widgets with dataSource in RefreshableWidget for live data refresh
// Wires FormWidget onSubmit when commandTemplate is defined
// @see docs/phases/phase-ex1.md, docs/phases/phase-ex5.md

import { useState, useCallback } from 'react';
import type { Widget, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { getWidget } from './widget-registry';
import { LumenAlert } from './widgets/widget-card';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshableWidget } from './RefreshableWidget';
import { useDynamicViewContext } from './DynamicViewContext';
import { useWidgetRefresh } from '@/hooks/useWidgetRefresh';
import { FormWidget } from './widgets/FormWidget';
import { composeCommand } from '@/lib/command-template';
import { executeWidgetAction } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

interface DataSource {
  command: string;
  refreshInterval: number;
  parseMode: 'json' | 'text';
}

export function WidgetRenderer({ widget, index = 0 }: { widget: DeepPartial<Widget>; index?: number }) {
  if (!widget.type) {
    return <Skeleton className="h-24 w-full rounded-[22px]" />;
  }

  // EX3-D.3: Stagger delay via CSS custom property
  const staggerStyle = { '--stagger-index': index } as React.CSSProperties;

  // EX5-A.2: Special-case form widgets with commandTemplate
  const formWidget = widget as Record<string, unknown>;
  if (widget.type === 'form' && formWidget.commandTemplate) {
    return (
      <div className="h-full animate-widget-enter" style={staggerStyle}>
        <FormCommandWrapper widget={widget} />
      </div>
    );
  }

  const Component = getWidget(widget.type as string);
  if (!Component) {
    return (
      <LumenAlert tone="destructive" title="Unknown widget">
        Widget type &ldquo;{widget.type as string}&rdquo; is not registered.
      </LumenAlert>
    );
  }

  const ds = formWidget.dataSource as DataSource | null | undefined;

  if (ds?.command) {
    return (
      <LiveWidgetWrapper widget={widget} dataSource={ds}>
        {(liveWidget) => (
          <div className="h-full animate-widget-enter" style={staggerStyle}>
            <Component widget={liveWidget as Widget} />
          </div>
        )}
      </LiveWidgetWrapper>
    );
  }

  return (
    <div className="h-full animate-widget-enter" style={staggerStyle}>
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

// ── EX5-A.2: Form + CommandTemplate Wrapper ─────────────

interface FormCommandWrapperProps {
  widget: DeepPartial<Widget>;
}

function FormCommandWrapper({ widget }: FormCommandWrapperProps) {
  const { serverId } = useDynamicViewContext();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<Record<string, string | number | boolean> | null>(null);
  const [executing, setExecuting] = useState(false);

  const formData = widget as Record<string, unknown>;
  const commandTemplate = formData.commandTemplate as string;
  const confirmSubmit = (formData.confirmSubmit as boolean) ?? false;
  const confirmMessage = (formData.confirmMessage as string) ?? undefined;

  const executeCommand = useCallback(
    async (values: Record<string, string | number | boolean>) => {
      if (!serverId) {
        toast.error('No server connected');
        return;
      }

      const command = composeCommand(commandTemplate, values);
      setExecuting(true);

      try {
        const result = await executeWidgetAction(serverId, command);
        if (result.error) {
          toast.error(`Command failed: ${result.error}`);
        } else {
          toast.success(`Command executed successfully`);
        }
      } catch (err) {
        toast.error(`Execution error: ${(err as Error).message}`);
      } finally {
        setExecuting(false);
      }
    },
    [serverId, commandTemplate],
  );

  const handleSubmit = useCallback(
    (values: Record<string, string | number | boolean>) => {
      if (confirmSubmit) {
        setPendingValues(values);
        setConfirmOpen(true);
      } else {
        void executeCommand(values);
      }
    },
    [confirmSubmit, executeCommand],
  );

  const handleConfirm = useCallback(() => {
    if (pendingValues) {
      void executeCommand(pendingValues);
      setPendingValues(null);
    }
    setConfirmOpen(false);
  }, [pendingValues, executeCommand]);

  return (
    <>
      <FormWidget
        widget={widget as Parameters<typeof FormWidget>[0]['widget']}
        onSubmit={handleSubmit}
      />
      {confirmSubmit && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Confirm Command Execution"
          description={
            confirmMessage ??
            `Execute this command?\n\n${pendingValues ? composeCommand(commandTemplate, pendingValues) : ''}`
          }
          confirmLabel="Execute"
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
