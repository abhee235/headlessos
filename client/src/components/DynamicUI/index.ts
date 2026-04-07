// EX1.2: DynamicUI — public API / barrel exports
// @see docs/phases/phase-ex1.md

// Side-effect: registers all widgets
import './register-widgets';

export { DynamicViewRenderer } from './DynamicViewRenderer';
export { DynamicAppWindow } from './DynamicAppWindow';
export { LayoutRenderer } from './LayoutRenderer';
export { WidgetRenderer } from './WidgetRenderer';
export { registerWidget, getWidget, getRegisteredTypes, clearRegistry } from './widget-registry';
