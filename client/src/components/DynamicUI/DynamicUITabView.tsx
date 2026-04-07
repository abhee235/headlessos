// EX1.13: DynamicUITabView — renders a pinned dynamic view inside a desktop window
// @see docs/phases/phase-ex1.md

import { DynamicViewRenderer } from './DynamicViewRenderer';
import { DynamicViewProvider } from './DynamicViewContext';
import { useDynamicUIStore } from '@/store/dynamic-ui-store';
import { Sparkles } from 'lucide-react';

interface DynamicUITabViewProps {
  /** Server ID this window is connected to */
  serverId: string;
  /** Window ID — used to look up the pinned view data */
  windowId: string;
}

export function DynamicUITabView({ serverId, windowId }: DynamicUITabViewProps) {
  const pinnedView = useDynamicUIStore(s => s.getViewForWindow(windowId));

  if (!pinnedView) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Sparkles className="w-8 h-8 opacity-40" />
        <p className="text-sm">No dynamic view found for this window</p>
        <p className="text-xs opacity-60">The pinned view may have been removed</p>
      </div>
    );
  }

  return (
    <DynamicViewProvider serverId={serverId}>
      <div className="p-4 h-full overflow-auto">
        <DynamicViewRenderer view={pinnedView.view} />
      </div>
    </DynamicViewProvider>
  );
}
