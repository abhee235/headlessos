// EX9.1: Action catalog — public surface
// @see docs/phases/phase-ex9.md, docs/DECISIONS.md (ADR-024)

export type { ActionDef, ActionRisk, ActionCategory, ActionRunResult } from './types.js';
export { ActionCatalog, ALL_ACTIONS, getDefaultCatalog } from './catalog/index.js';
export { ActionRunner, actionSignature, describeParamError, type ActionSsh, type RunOptions } from './runner.js';
export { actionTool, readActionTools, selectActions, formatForModel, CORE_ACTIONS } from './tools.js';
export { quoteArg, toCommand } from './quote.js';
export { READ_ROOTS, isSecretPath } from './params.js';
