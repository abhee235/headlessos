// EX1.13: Helper to open a dynamic view as a desktop window
// @see docs/phases/phase-ex1.md

import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import { useDynamicUIStore } from '@/store/dynamic-ui-store';
import { useDesktopStore } from '@/store/window-store';

/**
 * Pin a dynamic view and open it as a desktop window.
 * Returns the pinned view ID.
 *
 * This is a standalone function (not a hook) that reads store state directly.
 */
export function openDynamicUIWindow(
  serverId: string,
  view: DynamicView,
  icon?: string,
): string {
  // 1. Pin the view in the dynamic UI store
  const viewId = useDynamicUIStore.getState().pinView(serverId, view, icon);

  // 2. Open a desktop window
  const title = view.title || 'Dynamic View';
  const iconName = icon ?? view.icon ?? 'Sparkles';
  useDesktopStore.getState().openWindow('dynamic-ui', serverId, title, iconName);

  // 3. Link the newest window to the pinned view
  const windows = useDesktopStore.getState().windows;
  const newestWindow = windows[windows.length - 1];
  if (newestWindow) {
    useDynamicUIStore.getState().linkWindow(newestWindow.id, viewId);
  }

  return viewId;
}
