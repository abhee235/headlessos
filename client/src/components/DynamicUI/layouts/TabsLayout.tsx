// EX1.6: Tabs Layout — renders widgets in tabbed panels
// @see docs/phases/phase-ex1.md

import type { DeepPartial, Layout } from 'headlessos-shared/schemas/dynamic-view';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WidgetRenderer } from '../WidgetRenderer';

type TabsLayout = DeepPartial<Layout & { layout: 'tabs' }>;

export function TabsLayout({ layout }: { layout: TabsLayout }) {
  const tabs = layout.tabs ?? [];

  if (tabs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No tabs defined</p>
    );
  }

  const defaultTab = tabs[0]?.id ?? 'tab-0';

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList>
        {tabs.map((tab, i) => (
          <TabsTrigger key={tab.id ?? `tab-${i}`} value={tab.id ?? `tab-${i}`}>
            {tab.label ?? `Tab ${i + 1}`}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab, i) => (
        <TabsContent key={tab.id ?? `tab-${i}`} value={tab.id ?? `tab-${i}`}>
          <div className="space-y-4 pt-2">
            {(tab.widgets ?? []).map((widget, wi) => (
              <WidgetRenderer key={wi} widget={widget} />
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
