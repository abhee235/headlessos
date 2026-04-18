// EX3-C.1: WorkingView — mutable view structure for progressive UI generation
// Starts with a layout skeleton and supports typed mutations (addWidget,
// replaceWidget, updateMetadata, addTab). Each mutation produces a valid
// DynamicView snapshot that can be sent to the frontend.
// @see docs/phases/phase-ex3.md

import type { DynamicView, Widget, Layout } from 'headlessos-shared/schemas/dynamic-view';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';

// ── Diff Types ──

export interface ViewDiff {
  /** Which widgets were added or replaced since last snapshot */
  changedWidgetIds: string[];
  /** New tab IDs added */
  newTabIds: string[];
  /** Whether metadata changed */
  metadataChanged: boolean;
}

// ── WorkingView ──

/**
 * A mutable DynamicView wrapper for progressive UI generation.
 * The agent adds widgets incrementally; each mutation produces a
 * snapshot that can be emitted to the frontend as a `layout_update`.
 */
export class WorkingView {
  private view: DynamicView;
  private lastSnapshotJson: string;
  private changedWidgetIds: Set<string> = new Set();
  private newTabIds: Set<string> = new Set();
  private metadataChanged = false;
  private widgetCounter = 0;

  constructor(skeleton: DynamicView) {
    // Deep-clone the skeleton so mutations don't affect the original
    this.view = structuredClone(skeleton);
    this.lastSnapshotJson = JSON.stringify(this.view);
  }

  /**
   * Add a widget to a specific section.
   * The widget is appended to the section's children array.
   * Returns a generated widget ID for tracking.
   */
  addWidget(sectionId: string, widget: Widget): string {
    const section = this.view.sections[sectionId];
    if (!section) {
      throw new Error(`Section "${sectionId}" not found. Available: ${Object.keys(this.view.sections).join(', ')}`);
    }

    const widgetId = `w-${++this.widgetCounter}`;

    // Add widget to the section's children
    if ('children' in section && Array.isArray(section.children)) {
      (section.children as unknown[]).push(widget);
    } else if ('tabs' in section) {
      // For tabbed sections, add to the first tab's children by default
      const tabs = (section as { tabs: Array<{ children: unknown[] }> }).tabs;
      if (tabs.length > 0) {
        tabs[0].children.push(widget);
      }
    }

    this.changedWidgetIds.add(widgetId);
    return widgetId;
  }

  /**
   * Replace a widget at a specific position within a section.
   * `index` is the position in the children array.
   */
  replaceWidget(sectionId: string, index: number, widget: Widget): void {
    const section = this.view.sections[sectionId];
    if (!section) {
      throw new Error(`Section "${sectionId}" not found`);
    }

    if ('children' in section && Array.isArray(section.children)) {
      if (index >= 0 && index < section.children.length) {
        (section.children as unknown[])[index] = widget;
        this.changedWidgetIds.add(`w-replace-${sectionId}-${index}`);
      }
    }
  }

  /**
   * Update view metadata (title, description, icon).
   */
  updateMetadata(meta: { title?: string; description?: string; icon?: string }): void {
    if (meta.title !== undefined) this.view.title = meta.title;
    if (meta.description !== undefined) this.view.description = meta.description;
    if (meta.icon !== undefined) this.view.icon = meta.icon;
    this.metadataChanged = true;
  }

  /**
   * Add a new tab to an existing tabs layout within a section.
   */
  addTab(
    sectionId: string,
    tab: { id: string; label: string; icon?: string; count?: number; children: unknown[] },
  ): void {
    const section = this.view.sections[sectionId];
    if (!section) {
      throw new Error(`Section "${sectionId}" not found`);
    }

    // Walk the section tree to find tabs layout
    const tabsLayout = this.findTabsLayout(section);
    if (!tabsLayout) {
      throw new Error(`No tabs layout found in section "${sectionId}"`);
    }

    tabsLayout.tabs.push({
      id: tab.id,
      label: tab.label,
      icon: tab.icon ?? null,
      count: tab.count ?? null,
      children: tab.children,
    });

    this.newTabIds.add(tab.id);
  }

  /**
   * Add a sidebar navigation item.
   */
  addSidebarItem(item: { id: string; label: string; icon?: string }): void {
    this.view.sidebarItems.push({
      id: item.id,
      label: item.label,
      icon: item.icon ?? null,
    });
    this.metadataChanged = true;
  }

  /**
   * Add a new section to the view.
   */
  addSection(sectionId: string, layout: Layout): void {
    this.view.sections[sectionId] = layout;
  }

  /**
   * Get the current view snapshot (always valid DynamicView).
   */
  getSnapshot(): DynamicView {
    return structuredClone(this.view);
  }

  /**
   * Get the raw view reference (for performance-critical reads — do NOT mutate).
   */
  getView(): Readonly<DynamicView> {
    return this.view;
  }

  /**
   * Get a diff describing what changed since the last call to getDiff().
   * Resets tracking after each call.
   */
  getDiff(): ViewDiff {
    const diff: ViewDiff = {
      changedWidgetIds: [...this.changedWidgetIds],
      newTabIds: [...this.newTabIds],
      metadataChanged: this.metadataChanged,
    };

    // Reset tracking
    this.changedWidgetIds.clear();
    this.newTabIds.clear();
    this.metadataChanged = false;
    this.lastSnapshotJson = JSON.stringify(this.view);

    return diff;
  }

  /**
   * Check whether the current snapshot differs from the last one.
   */
  hasChanges(): boolean {
    return (
      this.changedWidgetIds.size > 0 ||
      this.newTabIds.size > 0 ||
      this.metadataChanged
    );
  }

  /**
   * Validate the current view against DynamicViewSchema.
   * Returns true if valid, false otherwise.
   */
  validate(): boolean {
    return DynamicViewSchema.safeParse(this.view).success;
  }

  // ── Private helpers ──

  /**
   * Walk a layout tree to find the first tabs layout.
   */
  private findTabsLayout(
    layout: unknown,
  ): { tabs: Array<{ id: string; label: string; icon?: string | null; count?: number | null; children: unknown[] }> } | null {
    if (!layout || typeof layout !== 'object') return null;

    const obj = layout as Record<string, unknown>;

    if (obj.layout === 'tabs' && Array.isArray(obj.tabs)) {
      return obj as { tabs: Array<{ id: string; label: string; icon?: string | null; count?: number | null; children: unknown[] }> };
    }

    // Walk children of stack/grid layouts
    if (Array.isArray(obj.children)) {
      for (const child of obj.children) {
        const found = this.findTabsLayout(child);
        if (found) return found;
      }
    }

    return null;
  }
}

// ── Skeleton builder helper ──

/**
 * Create an empty skeleton DynamicView with just the structural layout.
 * Used as the initial state for progressive generation.
 */
export function createSkeleton(opts: {
  title: string;
  description?: string;
  icon?: string;
  sidebarItems: Array<{ id: string; label: string; icon?: string }>;
  sectionLayouts?: Record<string, 'stack' | 'grid' | 'tabs'>;
}): DynamicView {
  const sections: Record<string, Layout> = {};

  for (const item of opts.sidebarItems) {
    const layoutType = opts.sectionLayouts?.[item.id] ?? 'stack';
    if (layoutType === 'tabs') {
      sections[item.id] = { layout: 'tabs', tabs: [] };
    } else if (layoutType === 'grid') {
      sections[item.id] = { layout: 'grid', columns: 2, children: [], autoFit: true, minChildWidth: 200 };
    } else {
      sections[item.id] = { layout: 'stack', gap: 'md', children: [] };
    }
  }

  return {
    title: opts.title,
    description: opts.description ?? null,
    icon: opts.icon ?? null,
    sidebarItems: opts.sidebarItems.map((s) => ({
      id: s.id,
      label: s.label,
      icon: s.icon ?? null,
    })),
    sections,
    meta: null,
  };
}
