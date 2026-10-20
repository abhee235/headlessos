// EX1.13: DynamicUITabView — renders a pinned dynamic view inside a desktop window
// Window chrome always includes a sidebar for consistent navigation.
// EX3-C.3: Supports loading state with skeleton for early window opening.
// EX8.6: left nav = PaneSidebar; content column px-4 pb-4 on the window glass.
// @see docs/phases/phase-ex1.md

import { DynamicViewProvider } from './DynamicViewContext';
import { SectionContent } from './SectionContent';
import { useDynamicSidebar } from './useDynamicSidebar';
import { useDynamicUIStore } from '@/store/dynamic-ui-store';
import { Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PaneSidebar, PaneSidebarItem } from '@/components/ui/pane-sidebar';
import { Skeleton } from '@/components/ui/skeleton';
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
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 pb-4 text-label-2">
        <div className="lumen-plate grid h-12 w-12 place-items-center rounded-[14px]">
          <Sparkles className="h-6 w-6 text-label-3" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-semibold text-foreground">No dynamic view found for this window</p>
        <p className="text-xs text-label-3">The pinned view may have been removed</p>
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
    <div className="flex min-h-9 shrink-0 items-center gap-2 border-t border-border px-4 py-1.5">
      <Spinner className="h-3.5 w-3.5 text-accent-solid" />
      <span className="text-xs font-medium text-accent-text">
        {hasContent ? 'Building view…' : 'Preparing layout…'}
      </span>
      <span className="ml-auto truncate text-xs text-label-3">{title}</span>
    </div>
  );
}

/** EX3-C.3: Skeleton placeholder during initial loading */
function TabViewSkeleton() {
  return (
    <div className="flex-1 space-y-4 px-4 pb-4 animate-in fade-in duration-300">
      {/* Title skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-[11px]" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-5 w-48 rounded-full" />
          <Skeleton className="h-3 w-80 rounded-full" />
        </div>
      </div>
      {/* Stat card skeletons */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-[22px]" />
        <Skeleton className="h-24 rounded-[22px]" />
        <Skeleton className="h-24 rounded-[22px]" />
      </div>
      {/* Table skeleton */}
      <div className="mt-2 space-y-2">
        <Skeleton className="h-4 w-32 rounded-full" />
        <Skeleton className="h-[34px] w-full rounded-[10px]" />
        <Skeleton className="h-[34px] w-full rounded-[10px]" />
        <Skeleton className="h-[34px] w-full rounded-[10px]" />
        <Skeleton className="h-[34px] w-full rounded-[10px]" />
        <Skeleton className="h-[34px] w-[80%] rounded-[10px]" />
      </div>
    </div>
  );
}

/** Inner content with sidebar — separated so useDynamicSidebar gets a stable view */
function DynamicUITabViewContent({ view, loading }: { view: Parameters<typeof useDynamicSidebar>[0]; loading?: boolean }) {
  const { items, activeId, setActiveId, activeLayout } = useDynamicSidebar(view);

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Window-level sidebar navigation */}
      {items.length > 0 && (
        <PaneSidebar width={208} aria-label="View sections">
          {items.map((item) => (
            <PaneSidebarItem
              key={item.id}
              icon={item.icon ? getLucideIcon(item.icon) : undefined}
              label={item.label}
              active={activeId === item.id}
              onClick={() => setActiveId(item.id)}
            />
          ))}
        </PaneSidebar>
      )}

      {/* Content area */}
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="px-4 pb-4">
          <SectionContent layout={activeLayout} loading={loading} />
        </div>
      </ScrollArea>
    </div>
  );
}
