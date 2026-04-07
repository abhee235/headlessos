// EX1.2: Widget Registry — type string → React component map
// @see docs/phases/phase-ex1.md
// Pattern source: Grafana Scenes Map<string, PanelPlugin>

import type { ComponentType } from 'react';

/**
 * A React component that renders a specific widget type.
 * Uses Record<string, unknown> for the widget prop because each concrete widget
 * component types its own widget shape — the registry does string-based dispatch
 * and Zod schemas enforce type safety at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WidgetComponent = ComponentType<{ widget: any }>;

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
