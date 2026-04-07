// EX1.6: Sidebar Layout — side navigation with section content
// @see docs/phases/phase-ex1.md

import { useState } from 'react';
import type { DeepPartial, Layout, Widget } from 'headlessos-shared/schemas/dynamic-view';
import { WidgetRenderer } from '../WidgetRenderer';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

type SidebarLayout = DeepPartial<Layout & { layout: 'sidebar' }>;

export function SidebarLayout({ layout }: { layout: SidebarLayout }) {
  const items = layout.sidebarItems ?? [];
  const sections = layout.sections ?? {};

  const [activeId, setActiveId] = useState<string>(
    items[0]?.id ?? Object.keys(sections)[0] ?? '',
  );

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No sidebar items defined</p>
    );
  }

  const activeWidgets = (sections[activeId] ?? []) as DeepPartial<Widget>[];

  return (
    <div className="flex gap-0 rounded-lg border border-border/60 overflow-hidden min-h-[200px]">
      {/* Sidebar navigation — matches AppWindow.Sidebar styling */}
      <nav className="w-[200px] shrink-0 border-r border-border/60 bg-sidebar/50">
        <ScrollArea className="h-full">
          <div className="flex flex-col py-2 px-2 space-y-0.5">
            {items.map((item, i) => {
              const id = item.id ?? `item-${i}`;
              return (
                <button
                  key={id}
                  onClick={() => setActiveId(id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] text-left transition-colors',
                    activeId === id
                      ? 'bg-primary/12 text-primary font-medium dark:bg-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <span className="truncate">{item.label ?? id}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </nav>

      {/* Content area */}
      <div className="flex-1 p-4">
        <ScrollArea className="h-full">
          {activeWidgets.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No content for this section
            </p>
          ) : (
            <div className="space-y-4">
              {activeWidgets.map((widget, wi) => (
                <WidgetRenderer key={wi} widget={widget} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
