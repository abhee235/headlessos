// EX1.2 + EX1.13: DynamicUI — public API / barrel exports
// @see docs/phases/phase-ex1.md

// Side-effect: registers all widgets
import './register-widgets';

export { DynamicViewRenderer } from './DynamicViewRenderer';
export { DynamicAppWindow } from './DynamicAppWindow';
export { SaveAsAppDialog } from './SaveAsAppDialog';
export { DynamicUIPlayground } from './DynamicUIPlayground';
export { DynamicUITabView } from './DynamicUITabView';
export { DynamicViewProvider, useDynamicViewContext } from './DynamicViewContext';
export { RefreshableWidget } from './RefreshableWidget';
export { LayoutRenderer } from './LayoutRenderer';
export { WidgetRenderer } from './WidgetRenderer';
export { registerWidget, getWidget, getRegisteredTypes, clearRegistry } from './widget-registry';
export { openDynamicUIWindow } from './open-dynamic-ui-window';
