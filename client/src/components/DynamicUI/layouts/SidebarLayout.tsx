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
    <div className="flex gap-0 rounded-lg border border-border overflow-hidden min-h-[200px]">
      {/* Sidebar navigation */}
      <nav className="w-48 shrink-0 border-r border-border bg-muted/30">
        <ScrollArea className="h-full">
          <div className="flex flex-col py-1">
            {items.map((item, i) => {
              const id = item.id ?? `item-${i}`;
              return (
                <button
                  key={id}
                  onClick={() => setActiveId(id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                    'hover:bg-accent/50',
                    activeId === id
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground',
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
