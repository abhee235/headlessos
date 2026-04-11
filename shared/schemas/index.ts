// EX1.1: Schema exports
// @see docs/phases/phase-ex1.md

export {
  // Base widget schemas
  TableWidgetSchema,
  KeyValueWidgetSchema,
  BadgeGridWidgetSchema,
  StatCardWidgetSchema,
  ProgressBarWidgetSchema,
  CodeBlockWidgetSchema,
  AlertWidgetSchema,
  // Extended widget schemas (EX1.5)
  ChartWidgetSchema,
  TreeWidgetSchema,
  TreeNodeSchema,
  LogViewerWidgetSchema,
  // Widget union
  WidgetSchema,
  WIDGET_TYPES,
  // Layout schemas
  StackLayoutSchema,
  GridLayoutSchema,
  TabsLayoutSchema,
  LayoutSchema,
  SidebarItemSchema,
  LAYOUT_TYPES,
  // Top-level schema
  DynamicViewSchema,
  DynamicViewMetaSchema,
  // Shared enum
  BadgeVariantEnum,
} from './dynamic-view.js';

export type {
  Widget,
  WidgetType,
  Layout,
  LayoutType,
  SidebarItem,
  DynamicView,
  DynamicViewMeta,
  TreeNode,
  DeepPartial,
} from './dynamic-view.js';

// EX4-A.1: Observatory schemas
// @see docs/phases/phase-ex4.md

export {
  SpanKindSchema,
  SpanStatusSchema,
  TokenUsageSchema,
  CumulativeUsageSchema,
  TraceTriggerSchema,
  ModelRoleSchema,
  SpanSchema,
  TraceSchema,
  TraceSummarySchema,
  SpanTreeNodeSchema,
  ObservatoryStatsSchema,
  // WebSocket events
  TraceStartEventSchema,
  TraceEndEventSchema,
  SpanStartEventSchema,
  SpanEndEventSchema,
  ObservatoryEventSchema,
  // API request/response
  TraceListQuerySchema,
  TraceListResponseSchema,
  TraceDetailResponseSchema,
  SpanDetailResponseSchema,
} from './observatory.js';

export type {
  SpanKind,
  SpanStatus,
  TokenUsage,
  CumulativeUsage,
  TraceTrigger,
  ModelRole,
  Span,
  Trace,
  TraceSummary,
  SpanTreeNode,
  ObservatoryStats,
  ObservatoryEvent,
  TraceListQuery,
  TraceListResponse,
  TraceDetailResponse,
  SpanDetailResponse,
} from './observatory.js';
