// EX1.7: Dynamic UI module barrel
// @see docs/phases/phase-ex1.md

export type { UITemplate, TemplateMatch } from './types.js';
export {
  TemplateRegistry,
  getTemplateRegistry,
  resetTemplateRegistry,
} from './template-registry.js';
export { ALL_TEMPLATES } from './templates/index.js';
export {
  DynamicUIGenerator,
  DYNAMIC_UI_SYSTEM_PROMPT,
  type GenerateInput,
  type GenerateResult,
  type DynamicUIMessage,
} from './generator.js';
