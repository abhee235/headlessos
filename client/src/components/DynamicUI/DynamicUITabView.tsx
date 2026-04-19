// EX1.13: DynamicUITabView — renders a pinned dynamic view inside a desktop window
// Window chrome always includes a sidebar for consistent navigation.
// EX3-C.3: Supports loading state with skeleton for early window opening.
// @see docs/phases/phase-ex1.md

import { DynamicViewProvider } from './DynamicViewContext';
import { SectionContent } from './SectionContent';
import { useDynamicSidebar } from './useDynamicSidebar';
import { useDynamicUIStore } from '@/store/dynamic-ui-store';
import { Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getLucideIcon } from './widgets/icon-helper';
import { Spinner } from '@/components/ui/spinner';

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

  // EX3-C.3: Show loading skeleton when view is being generated
  if (pinnedView.loading) {
    // Use partialView if available, otherwise show skeleton
    const viewToRender = pinnedView.partialView ?? pinnedView.view;
    const hasRealContent = viewToRender && Object.keys(viewToRender.sections ?? {}).length > 0;

    if (hasRealContent) {
      // Progressive: we have partial data — render it with sidebar + loading flag
      return (
        <DynamicViewProvider serverId={serverId}>
          <div className="flex flex-col h-full">
            <DynamicUITabViewContent view={viewToRender as Parameters<typeof useDynamicSidebar>[0]} loading />
            <LoadingFooter title={pinnedView.title} hasContent />
          </div>
        </DynamicViewProvider>
      );
    }

    // No content yet — show pure skeleton
    return (
      <div className="flex flex-col h-full">
        <TabViewSkeleton />
        <LoadingFooter title={pinnedView.title} hasContent={false} />
      </div>
    );
  }

  return (
    <DynamicViewProvider serverId={serverId}>
      <DynamicUITabViewContent view={pinnedView.view} />
    </DynamicViewProvider>
  );
}

/** EX3-C.3: Loading footer shown during generation */
function LoadingFooter({ title, hasContent }: { title: string; hasContent: boolean }) {
  return (
    <div className="border-t border-border/40 px-4 py-2 flex items-center gap-2">
      <Spinner className="w-3.5 h-3.5text-emerald-500" />
      <span className="text-xs text-emerald-600 dark:text-emerald-400">
        {hasContent ? 'Building view…' : 'Preparing layout…'}
      </span>
      <span className="text-[11px] text-muted-foreground ml-auto">{title}</span>
    </div>
  );
}

/** EX3-C.3: Skeleton placeholder during initial loading */
function TabViewSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-4 animate-in fade-in duration-300">
      {/* Title skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-md" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-80" />
        </div>
      </div>
      {/* Stat card skeletons */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <Skeleton className="h-[72px] rounded-lg" />
        <Skeleton className="h-[72px] rounded-lg" />
        <Skeleton className="h-[72px] rounded-lg" />
      </div>
      {/* Table skeleton */}
      <div className="space-y-2 mt-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-[80%]" />
      </div>
    </div>
  );
}

/** Inner content with sidebar — separated so useDynamicSidebar gets a stable view */
function DynamicUITabViewContent({ view, loading }: { view: Parameters<typeof useDynamicSidebar>[0]; loading?: boolean }) {
  const { items, activeId, setActiveId, activeLayout } = useDynamicSidebar(view);

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
          <SectionContent layout={activeLayout} loading={loading} />
        </div>
      </ScrollArea>
    </div>
  );
}
