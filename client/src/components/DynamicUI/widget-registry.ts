// EX1.2: Widget Registry — type string → React component map
// @see docs/phases/phase-ex1.md
// Pattern source: Grafana Scenes Map<string, PanelPlugin>

import type { ComponentType } from 'react';
import type { Widget } from 'headlessos-shared/schemas/dynamic-view';

/** A React component that renders a specific widget type */
export type WidgetComponent<W extends Widget = Widget> = ComponentType<{ widget: W }>;

/** Simple Map — widget.type string → React component */
const registry = new Map<string, WidgetComponent>();

/** Register a widget renderer */
export function registerWidget(type: string, component: WidgetComponent): void {
  if (registry.has(type)) {
    console.warn(`[DynamicUI] Overwriting widget type "${type}"`);
  }
  registry.set(type, component);
}

/** Look up a widget renderer. Returns undefined if not registered. */
export function getWidget(type: string): WidgetComponent | undefined {
  return registry.get(type);
}

/** Get all registered widget types */
export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}

/** Clear registry (useful for testing) */
export function clearRegistry(): void {
  registry.clear();
}
