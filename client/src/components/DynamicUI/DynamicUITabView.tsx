// EX1.13: DynamicUITabView — renders a pinned dynamic view inside a desktop window
// Window chrome always includes a sidebar for consistent navigation.
// @see docs/phases/phase-ex1.md

import { DynamicViewProvider } from './DynamicViewContext';
import { SectionContent } from './SectionContent';
import { useDynamicSidebar } from './useDynamicSidebar';
import { useDynamicUIStore } from '@/store/dynamic-ui-store';
import { Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getLucideIcon } from './widgets/icon-helper';

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
      <DynamicUITabViewContent view={pinnedView.view} />
    </DynamicViewProvider>
  );
}

/** Inner content with sidebar — separated so useDynamicSidebar gets a stable view */
function DynamicUITabViewContent({ view }: { view: Parameters<typeof useDynamicSidebar>[0] }) {
  const { items, activeId, setActiveId, activeChildren } = useDynamicSidebar(view);

  return (
    <div className="flex h-full">
      {/* Window-level sidebar navigation */}
      {items.length > 0 && (
        <nav className="w-50 shrink-0 border-r border-border/60 bg-sidebar/50">
          <ScrollArea className="h-full">
            <div className="flex flex-col py-2 px-2 space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon ? getLucideIcon(item.icon) : null;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveId(item.id)}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-3 py-1.75 rounded-lg text-[13px] transition-colors text-left',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      activeId === item.id
                        ? 'bg-primary/12 text-primary font-medium dark:bg-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                  >
                    {Icon && <Icon className="w-4 h-4 shrink-0 opacity-70" />}
                    <span className="truncate flex-1">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </nav>
      )}

      {/* Content area */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          <SectionContent>{activeChildren}</SectionContent>
        </div>
      </ScrollArea>
    </div>
  );
}
