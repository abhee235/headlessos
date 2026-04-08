// EX1: useDynamicSidebar — extracts window-level sidebar navigation from DynamicView
// Reads top-level sidebarItems + sections from the schema.
// Sidebar is always window chrome — the LLM never generates sidebar layout.

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
  /** Layout to render for the active section (null if section not yet filled) */
  activeLayout: DeepPartial<Layout> | null;
  /** Whether the view has multiple sidebar sections */
  hasMultipleSections: boolean;
}

/**
 * Extract sidebar navigation from a DynamicView's top-level sidebarItems + sections.
 * Each section maps to a Layout (stack/grid/tabs) rendered in the content area.
 */
export function useDynamicSidebar(view: DeepPartial<DynamicView>): DynamicSidebarResult {
  const extracted = useMemo(() => {
    const rawItems = (view.sidebarItems ?? []) as DeepPartial<{ id?: string; label?: string; icon?: string }>[];
    const items: SidebarNavItem[] = rawItems
      .filter((it): it is NonNullable<typeof it> => it != null)
      .map((item, i) => ({
        id: (item.id as string) ?? `section-${i}`,
        label: (item.label as string) ?? `Section ${i + 1}`,
        icon: item.icon as string | undefined,
      }));

    const sections = (view.sections ?? {}) as Record<string, DeepPartial<Layout>>;

    return {
      items,
      sections,
      hasMultipleSections: items.length > 1,
    };
  }, [view.sidebarItems, view.sections]);

  const [activeId, setActiveId] = useState<string>('');

  // Default to first item if activeId is not set or no longer valid
  const effectiveActiveId = extracted.items.find(i => i.id === activeId)
    ? activeId
    : (extracted.items[0]?.id ?? '');

  const activeLayout = extracted.sections[effectiveActiveId] ?? null;

  return {
    items: extracted.items,
    activeId: effectiveActiveId,
    setActiveId,
    activeLayout,
    hasMultipleSections: extracted.hasMultipleSections,
  };
}
