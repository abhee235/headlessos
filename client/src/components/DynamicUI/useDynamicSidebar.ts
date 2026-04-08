// EX1: useDynamicSidebar — extracts window-level sidebar navigation from DynamicView
// Lifts sidebar/tabs navigation from the LLM schema to the window chrome,
// so every DynamicUI window always has a consistent sidebar regardless of layout type.

import { useState, useMemo } from 'react';
import type { DynamicView, DeepPartial, Layout } from 'headlessos-shared/schemas/dynamic-view';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon?: string;
}

interface DynamicSidebarResult {
  /** Navigation items for the window sidebar */
  items: SidebarNavItem[];
  /** Active section ID */
  activeId: string;
  /** Set active section */
  setActiveId: (id: string) => void;
  /** Children to render for the active section */
  activeChildren: unknown[];
  /** Whether the root layout was sidebar or tabs (navigable sections) */
  hasMultipleSections: boolean;
}

/**
 * Extract sidebar navigation items from a DynamicView based on root layout:
 * - sidebar layout → sidebarItems become nav items, sections become content
 * - tabs layout → tabs become nav items, tab children become content
 * - stack/grid → single nav item (view title), entire layout is the content
 */
export function useDynamicSidebar(view: DeepPartial<DynamicView>): DynamicSidebarResult {
  const root = view.root;

  const extracted = useMemo(() => {
    if (!root?.layout) {
      return {
        items: [] as SidebarNavItem[],
        sections: {} as Record<string, unknown[]>,
        hasMultipleSections: false,
      };
    }

    switch (root.layout) {
      case 'sidebar': {
        const sidebarRoot = root as DeepPartial<Layout & { layout: 'sidebar' }>;
        const rawItems = sidebarRoot.sidebarItems ?? [];
        const items = rawItems
          .filter((it): it is NonNullable<typeof it> => it != null)
          .map((item, i) => ({
            id: (item.id as string) ?? `section-${i}`,
            label: (item.label as string) ?? `Section ${i + 1}`,
            icon: item.icon as string | undefined,
          }));
        return {
          items,
          sections: (sidebarRoot.sections ?? {}) as Record<string, unknown[]>,
          hasMultipleSections: items.length > 1,
        };
      }
      case 'tabs': {
        const tabsRoot = root as DeepPartial<Layout & { layout: 'tabs' }>;
        const rawTabs = tabsRoot.tabs ?? [];
        const tabs = rawTabs.filter((t): t is NonNullable<typeof t> => t != null);
        const items = tabs.map((tab, i) => ({
          id: (tab.id as string) ?? `tab-${i}`,
          label: (tab.label as string) ?? `Tab ${i + 1}`,
          icon: tab.icon as string | undefined,
        }));
        const sections: Record<string, unknown[]> = {};
        tabs.forEach((tab, i) => {
          const id = (tab.id as string) ?? `tab-${i}`;
          sections[id] = ((tab as Record<string, unknown>).children ?? []) as unknown[];
        });
        return { items, sections, hasMultipleSections: items.length > 1 };
      }
      default: {
        // stack/grid — single item, content is the entire layout
        const label = (view.title as string) ?? 'Overview';
        const icon = view.icon as string | undefined;
        return {
          items: [{ id: 'main', label, icon }],
          sections: { main: [root] } as Record<string, unknown[]>,
          hasMultipleSections: false,
        };
      }
    }
  }, [root, view.title, view.icon]);

  const [activeId, setActiveId] = useState<string>('');

  // Default to first item if activeId is not set or no longer valid
  const effectiveActiveId = extracted.items.find(i => i.id === activeId)
    ? activeId
    : (extracted.items[0]?.id ?? '');

  const activeChildren = (extracted.sections[effectiveActiveId] ?? []) as unknown[];

  return {
    items: extracted.items,
    activeId: effectiveActiveId,
    setActiveId,
    activeChildren,
    hasMultipleSections: extracted.hasMultipleSections,
  };
}
