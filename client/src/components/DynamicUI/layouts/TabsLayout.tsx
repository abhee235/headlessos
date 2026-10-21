// EX1.6 + EX3-P.1 + EX3-P.8: Tabs Layout — nestable children with optional count badges
// EX8.6: Lumen segmented pill control (Tabs primitive) + round count chips
// @see docs/phases/phase-ex1.md, docs/phases/phase-ex3.md

import type { DeepPartial, Layout } from 'headlessos-shared/schemas/dynamic-view';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ContentRenderer } from '../ContentRenderer';
import { getLucideIcon } from '../widgets/icon-helper';

type TabsLayout = DeepPartial<Layout & { layout: 'tabs' }>;

export function TabsLayout({ layout }: { layout: TabsLayout }) {
  const rawTabs = layout.tabs ?? [];
  // Filter out undefined entries that DeepPartial allows
  const tabs = rawTabs.filter(
    (t): t is NonNullable<typeof t> => t != null,
  );

  if (tabs.length === 0) {
    return (
      <p className="text-sm italic text-label-3">No tabs defined</p>
    );
  }

  const defaultTab = tabs[0].id ?? 'tab-0';

  return (
    <Tabs defaultValue={defaultTab} className="w-full min-w-0">
      {/* The segmented control scrolls sideways when there are more tabs than fit */}
      <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
        <TabsList>
          {tabs.map((tab, i) => {
            const tabId = tab.id ?? `tab-${i}`;
            const count = (tab as Record<string, unknown>).count as number | null | undefined;
            const iconName = tab.icon as string | undefined;
            const TabIcon = iconName ? getLucideIcon(iconName) : null;
            return (
              <TabsTrigger key={tabId} value={tabId} className="gap-1.5 px-3.5">
                {TabIcon && <TabIcon className="opacity-70" strokeWidth={1.75} />}
                {tab.label ?? `Tab ${i + 1}`}
                {count != null && (
                  <span className="min-w-[20px] rounded-full bg-fill px-1.5 text-center text-[11px] font-semibold leading-5 text-label-2">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {tabs.map((tab, i) => {
        const tabId = tab.id ?? `tab-${i}`;
        const children = ((tab as Record<string, unknown>).children ?? []) as unknown[];
        return (
          <TabsContent key={tabId} value={tabId} className="mt-4 animate-tab-slide-in">
            <div className="space-y-4">
              {children.filter(Boolean).map((child, ci) => (
                <ContentRenderer key={ci} item={child as DeepPartial<Layout>} index={ci} />
              ))}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
