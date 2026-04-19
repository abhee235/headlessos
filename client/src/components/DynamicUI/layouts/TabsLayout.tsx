// EX1.6 + EX3-P.1 + EX3-P.8: Tabs Layout — nestable children with optional count badges
// @see docs/phases/phase-ex1.md, docs/phases/phase-ex3.md

import type { DeepPartial, Layout } from 'headlessos-shared/schemas/dynamic-view';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
      <p className="text-sm text-muted-foreground italic">No tabs defined</p>
    );
  }

  const defaultTab = tabs[0].id ?? 'tab-0';

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="h-auto p-1 bg-muted rounded-lg gap-1 w-auto inline-flex">
        {tabs.map((tab, i) => {
          const tabId = tab.id ?? `tab-${i}`;
          const count = (tab as Record<string, unknown>).count as number | null | undefined;
          const iconName = tab.icon as string | undefined;
          const TabIcon = iconName ? getLucideIcon(iconName) : null;
          return (
            <TabsTrigger
              key={tabId}
              value={tabId}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium"
            >
              {TabIcon && <TabIcon className="h-3.5 w-3.5 mr-1.5 opacity-60" />}
              {tab.label ?? `Tab ${i + 1}`}
              {count != null && (
                <Badge variant="secondary" className="ml-1.5 px-1.5 text-muted-foreground text-[11px]">
                  {count}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {tabs.map((tab, i) => {
        const tabId = tab.id ?? `tab-${i}`;
        const children = ((tab as Record<string, unknown>).children ?? []) as unknown[];
        return (
          <TabsContent key={tabId} value={tabId} className="animate-tab-slide-in">
            <div className="space-y-4 pt-2">
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
