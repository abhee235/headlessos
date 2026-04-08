// EX1.1: DynamicViewSchema — Zod schema for LLM-generated dynamic UIs
// @see docs/phases/phase-ex1.md
//
// IMPORTANT: All optional fields use .nullable().optional() for OpenAI
// zodResponseFormat() compatibility. OpenAI structured outputs require
// optional fields to also accept null.

import { z } from 'zod';

// ── Badge variant enum (reused across widgets) ─────────

export const BadgeVariantEnum = z.enum([
  'default', 'secondary', 'destructive', 'outline', 'success', 'warning',
]);

// ── Data Source (EX1.12: Live Data Refresh) ────────────

export const DataSourceSchema = z.object({
  /** Command to run on the server for refreshing data */
  command: z.string(),
  /** Refresh interval in milliseconds (min 5000, default 30000) */
  refreshInterval: z.number().min(5000).default(30000),
  /** How to parse the output: json, text (default text) */
  parseMode: z.enum(['json', 'text']).default('text'),
}).describe('Widget-level data source for auto-refresh');

export type DataSource = z.infer<typeof DataSourceSchema>;

// ── Widget Actions (EX1.14: Action Execution) ─────────

export const WidgetActionSchema = z.object({
  /** Unique action ID within the widget */
  id: z.string(),
  /** Button label */
  label: z.string(),
  /** Command template — {placeholder} values are substituted from row data */
  command: z.string(),
  /** Whether to show a confirmation dialog before executing */
  confirm: z.boolean().nullable().optional(),
  /** Confirmation message (shown in dialog when confirm=true) */
  confirmMessage: z.string().nullable().optional(),
  /** Button variant */
  variant: z.enum(['default', 'destructive', 'outline', 'secondary', 'ghost']).nullable().optional(),
  /** Lucide icon name */
  icon: z.string().nullable().optional(),
}).describe('Action button that executes a server command');

export type WidgetAction = z.infer<typeof WidgetActionSchema>;

// ── Rich cell segments (EX3-P.3: Compound table cells) ─

export const RichCellSegmentSchema = z.discriminatedUnion('segment', [
  z.object({
    segment: z.literal('text'),
    key: z.string().describe('Row field key to display'),
    className: z.string().nullable().optional().describe('Extra CSS classes'),
  }),
  z.object({
    segment: z.literal('badge'),
    key: z.string().describe('Row field key'),
    variant: BadgeVariantEnum.nullable().optional(),
    badgeVariant: z.record(z.string(), BadgeVariantEnum)
      .nullable().optional()
      .describe('Map value → badge variant'),
  }),
  z.object({
    segment: z.literal('icon'),
    icon: z.string().describe('Lucide icon name'),
    key: z.string().nullable().optional().describe('Row field key — show icon when value is truthy'),
    className: z.string().nullable().optional(),
  }),
  z.object({
    segment: z.literal('dot'),
    key: z.string().describe('Row field key — show dot when value is truthy'),
    color: z.string().default('amber').describe('Tailwind color name, e.g. amber, emerald, red'),
  }),
]);

export type RichCellSegment = z.infer<typeof RichCellSegmentSchema>;

// ── Table filter config (EX3-P.4: Filter bar) ─────────

export const TableFilterDropdownSchema = z.object({
  key: z.string().describe('Column key to filter on'),
  label: z.string().describe('Dropdown button label, e.g. "All Protocols"'),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })),
  icon: z.string().nullable().optional().describe('Lucide icon name for button'),
});

export const TableFiltersSchema = z.object({
  search: z.boolean().default(false).describe('Show search input'),
  searchPlaceholder: z.string().nullable().optional(),
  dropdowns: z.array(TableFilterDropdownSchema).default([]),
});

export type TableFilters = z.infer<typeof TableFiltersSchema>;

// ── Base widget types ──────────────────────────────────

export const TableWidgetSchema = z.object({
  type: z.literal('table'),
  title: z.string().nullable().optional(),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['text', 'number', 'badge', 'date', 'bytes', 'percent', 'code', 'mono', 'rich']).default('text'),
    sortable: z.boolean().default(false),
    width: z.string().nullable().optional(),
    badgeVariant: z.record(z.string(), BadgeVariantEnum)
      .nullable()
      .optional()
      .describe('Map value → badge variant, e.g. { running: "success", stopped: "destructive" }'),
    segments: z.array(RichCellSegmentSchema)
      .nullable()
      .optional()
      .describe('Rich cell segments — used when type="rich"'),
  })),
  rows: z.array(z.record(z.string(), z.unknown())),
  footer: z.string().nullable().optional(),
  actions: z.array(WidgetActionSchema).nullable().optional().describe('Action buttons per row'),
  /** EX3-P.5: How to display row actions */
  actionStyle: z.enum(['buttons', 'dropdown']).nullable().optional()
    .describe('buttons (default) = inline buttons, dropdown = ⋯ hover menu'),
  /** EX3-P.4: Filter bar above the table */
  filters: TableFiltersSchema.nullable().optional(),
  /** Custom empty state when rows are empty */
  emptyState: z.object({
    icon: z.string().nullable().optional().describe('Lucide icon name for empty state'),
    title: z.string().describe('Primary empty-state message'),
    message: z.string().nullable().optional().describe('Secondary helper text'),
  }).nullable().optional(),
  dataSource: DataSourceSchema.nullable().optional(),
});

export const KeyValueWidgetSchema = z.object({
  type: z.literal('key-value'),
  title: z.string().nullable().optional(),
  pairs: z.array(z.object({
    key: z.string(),
    value: z.string(),
    icon: z.string().nullable().optional().describe('Lucide icon name'),
    copyable: z.boolean().default(false),
  })),
  layout: z.enum(['vertical', 'grid-2', 'grid-3', 'grid-4']).default('grid-2'),
  dataSource: DataSourceSchema.nullable().optional(),
});

export const BadgeGridWidgetSchema = z.object({
  type: z.literal('badge-grid'),
  title: z.string().nullable().optional(),
  badges: z.array(z.object({
    label: z.string(),
    value: z.string(),
    variant: BadgeVariantEnum.default('default'),
  })),
  dataSource: DataSourceSchema.nullable().optional(),
});

export const StatCardWidgetSchema = z.object({
  type: z.literal('stat-card'),
  title: z.string(),
  value: z.string(),
  unit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  trend: z.enum(['up', 'down', 'neutral']).nullable().optional(),
  icon: z.string().nullable().optional().describe('Lucide icon name'),
  dataSource: DataSourceSchema.nullable().optional(),
});

export const ProgressBarWidgetSchema = z.object({
  type: z.literal('progress-bar'),
  title: z.string().nullable().optional(),
  value: z.number().min(0).max(100),
  label: z.string().nullable().optional(),
  variant: z.enum(['default', 'success', 'warning', 'destructive']).default('default'),
  dataSource: DataSourceSchema.nullable().optional(),
});

export const CodeBlockWidgetSchema = z.object({
  type: z.literal('code-block'),
  title: z.string().nullable().optional(),
  code: z.string(),
  language: z.string().default('text'),
  maxHeight: z.string().nullable().optional().describe('CSS max-height, e.g. "300px"'),
  dataSource: DataSourceSchema.nullable().optional(),
});

export const AlertWidgetSchema = z.object({
  type: z.literal('alert'),
  title: z.string().nullable().optional(),
  message: z.string(),
  variant: z.enum(['default', 'destructive', 'success', 'warning']).default('default'),
  dataSource: DataSourceSchema.nullable().optional(),
});

// ── Extended widget types (EX1.5) ──────────────────────

export const ChartWidgetSchema = z.object({
  type: z.literal('chart'),
  title: z.string().nullable().optional(),
  chartType: z.enum(['bar', 'line', 'area', 'pie', 'donut']),
  data: z.array(z.record(z.string(), z.unknown())),
  xKey: z.string(),
  yKeys: z.array(z.object({
    key: z.string(),
    label: z.string().nullable().optional(),
    color: z.string().nullable().optional().describe('CSS color or chart palette key'),
  })),
  height: z.number().default(300),
  dataSource: DataSourceSchema.nullable().optional(),
});

// TreeNodeSchema needs z.lazy for recursive children
const TreeNodeSchema: z.ZodType<TreeNode> = z.object({
  label: z.string(),
  value: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  children: z.lazy(() => z.array(TreeNodeSchema)).nullable().optional(),
});

export { TreeNodeSchema };

export interface TreeNode {
  label: string;
  value?: string | null;
  icon?: string | null;
  children?: TreeNode[] | null;
}

export const TreeWidgetSchema = z.object({
  type: z.literal('tree'),
  title: z.string().nullable().optional(),
  nodes: z.array(TreeNodeSchema),
  dataSource: DataSourceSchema.nullable().optional(),
});

export const LogViewerWidgetSchema = z.object({
  type: z.literal('log-viewer'),
  title: z.string().nullable().optional(),
  lines: z.array(z.object({
    timestamp: z.string().nullable().optional(),
    level: z.enum(['debug', 'info', 'warn', 'error']).nullable().optional(),
    message: z.string(),
  })),
  maxHeight: z.string().default('400px'),
  dataSource: DataSourceSchema.nullable().optional(),
});

// ── Form widget (EX1.15) ───────────────────────────────

/** Individual form field definition */
export const FormFieldSchema = z.object({
  /** Unique field key (used as form data key) */
  key: z.string(),
  /** Display label for the field */
  label: z.string(),
  /** Field input type */
  type: z.enum(['text', 'number', 'boolean', 'select', 'textarea']).default('text'),
  /** Current/default value */
  value: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
  /** Placeholder text for text/number/textarea */
  placeholder: z.string().nullable().optional(),
  /** Help text displayed below the field */
  description: z.string().nullable().optional(),
  /** Whether this field is required */
  required: z.boolean().default(false),
  /** Options for select fields */
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).nullable().optional(),
  /** Validation: minimum value (number) or min length (text) */
  min: z.number().nullable().optional(),
  /** Validation: maximum value (number) or max length (text) */
  max: z.number().nullable().optional(),
  /** Validation: regex pattern for text fields */
  pattern: z.string().nullable().optional(),
}).describe('A form field definition');

export type FormField = z.infer<typeof FormFieldSchema>;

/** Group of form fields rendered as a section */
export const FormFieldGroupSchema = z.object({
  label: z.string(),
  fieldKeys: z.array(z.string()),
}).describe('A group of form fields rendered as a card section');

export type FormFieldGroup = z.infer<typeof FormFieldGroupSchema>;

export const FormWidgetSchema = z.object({
  type: z.literal('form'),
  title: z.string().nullable().optional(),
  fields: z.array(FormFieldSchema),
  groups: z.array(FormFieldGroupSchema).nullable().optional(),
  submitLabel: z.string().default('Save'),
  readOnly: z.boolean().default(false),
  dataSource: DataSourceSchema.nullable().optional(),
}).describe('Editable form widget for configuration');

// ── Card list widget (EX3-P.6) ─────────────────────────

export const CardListItemSchema = z.object({
  icon: z.string().nullable().optional().describe('Lucide icon name'),
  title: z.string().describe('Primary label'),
  subtitle: z.string().nullable().optional(),
  badge: z.object({
    label: z.string(),
    variant: BadgeVariantEnum.default('default'),
    dot: z.boolean().default(false).describe('Show colored dot before label'),
  }).nullable().optional(),
  details: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).nullable().optional(),
});

export type CardListItem = z.infer<typeof CardListItemSchema>;

export const CardListWidgetSchema = z.object({
  type: z.literal('card-list'),
  title: z.string().nullable().optional(),
  items: z.array(CardListItemSchema),
  actions: z.array(WidgetActionSchema).nullable().optional(),
  dataSource: DataSourceSchema.nullable().optional(),
}).describe('Card list widget — renders items as horizontal card rows');

// ── Union of all widgets ────────────────────────────────

export const WidgetSchema = z.discriminatedUnion('type', [
  TableWidgetSchema,
  KeyValueWidgetSchema,
  BadgeGridWidgetSchema,
  StatCardWidgetSchema,
  ProgressBarWidgetSchema,
  CodeBlockWidgetSchema,
  AlertWidgetSchema,
  ChartWidgetSchema,
  TreeWidgetSchema,
  LogViewerWidgetSchema,
  FormWidgetSchema,
  CardListWidgetSchema,
]);

export type Widget = z.infer<typeof WidgetSchema>;

/** All supported widget type strings */
export const WIDGET_TYPES = [
  'table', 'key-value', 'badge-grid', 'stat-card', 'progress-bar',
  'code-block', 'alert', 'chart', 'tree', 'log-viewer', 'form', 'card-list',
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

// ── Layout containers (nestable — EX3-P.8) ─────────────
//
// Each layout's children array accepts either a Widget or a nested Layout.
// This enables compositions like "grid of stat cards above tabs" in one view.
// Maximum nesting depth is enforced by the renderer (default: 4 levels).

/** Lazy ref so layouts can contain sub-layouts without circular issues */
const LayoutOrWidgetSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([WidgetSchema, StackLayoutSchema, GridLayoutSchema, TabsLayoutSchema]),
);

export const StackLayoutSchema = z.object({
  layout: z.literal('stack'),
  gap: z.enum(['sm', 'md', 'lg']).default('md'),
  children: z.array(LayoutOrWidgetSchema),
});

export const GridLayoutSchema = z.object({
  layout: z.literal('grid'),
  columns: z.number().min(1).max(4).default(2),
  children: z.array(LayoutOrWidgetSchema),
});

export const TabsLayoutSchema = z.object({
  layout: z.literal('tabs'),
  tabs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    icon: z.string().nullable().optional(),
    /** EX3-P.1: Count badge shown next to tab label */
    count: z.number().nullable().optional(),
    children: z.array(LayoutOrWidgetSchema),
  })),
});

export const LayoutSchema = z.discriminatedUnion('layout', [
  StackLayoutSchema,
  GridLayoutSchema,
  TabsLayoutSchema,
]);

export type Layout = z.infer<typeof LayoutSchema>;

/** All supported layout type strings */
export const LAYOUT_TYPES = ['stack', 'grid', 'tabs'] as const;

export type LayoutType = (typeof LAYOUT_TYPES)[number];

// ── Top-level schema ────────────────────────────────────

export const DynamicViewMetaSchema = z.object({
  tool: z.string().nullable().optional().describe('CLI tool or package name'),
  command: z.string().nullable().optional().describe('Command that produced the data'),
  generatedAt: z.string().nullable().optional(),
  templateId: z.string().nullable().optional().describe('Template used, if any'),
});

/** Sidebar navigation item — always rendered in window chrome */
export const SidebarItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().nullable().optional(),
});

export type SidebarItem = z.infer<typeof SidebarItemSchema>;

export const DynamicViewSchema = z.object({
  /** Display title for the window */
  title: z.string(),
  /** Optional subtitle / description */
  description: z.string().nullable().optional(),
  /** Lucide icon name */
  icon: z.string().nullable().optional(),
  /** Sidebar navigation items — always present, rendered in window chrome */
  sidebarItems: z.array(SidebarItemSchema),
  /** Content sections keyed by sidebar item ID — each section is a layout (stack/grid/tabs) */
  sections: z.record(z.string(), LayoutSchema),
  /** Metadata about generation */
  meta: DynamicViewMetaSchema.nullable().optional(),
});

export type DynamicView = z.infer<typeof DynamicViewSchema>;
export type DynamicViewMeta = z.infer<typeof DynamicViewMetaSchema>;

// ── DeepPartial type for streaming/progressive rendering ─

/** DeepPartial makes all fields optional recursively — used during streaming */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
