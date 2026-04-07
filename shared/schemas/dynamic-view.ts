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

// ── Base widget types ──────────────────────────────────

export const TableWidgetSchema = z.object({
  type: z.literal('table'),
  title: z.string().nullable().optional(),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['text', 'number', 'badge', 'date', 'bytes', 'percent', 'code']).default('text'),
    sortable: z.boolean().default(false),
    width: z.string().nullable().optional(),
    badgeVariant: z.record(z.string(), BadgeVariantEnum)
      .nullable()
      .optional()
      .describe('Map value → badge variant, e.g. { running: "success", stopped: "destructive" }'),
  })),
  rows: z.array(z.record(z.string(), z.unknown())),
  footer: z.string().nullable().optional(),
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
});

export const BadgeGridWidgetSchema = z.object({
  type: z.literal('badge-grid'),
  title: z.string().nullable().optional(),
  badges: z.array(z.object({
    label: z.string(),
    value: z.string(),
    variant: BadgeVariantEnum.default('default'),
  })),
});

export const StatCardWidgetSchema = z.object({
  type: z.literal('stat-card'),
  title: z.string(),
  value: z.string(),
  unit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  trend: z.enum(['up', 'down', 'neutral']).nullable().optional(),
  icon: z.string().nullable().optional().describe('Lucide icon name'),
});

export const ProgressBarWidgetSchema = z.object({
  type: z.literal('progress-bar'),
  title: z.string().nullable().optional(),
  value: z.number().min(0).max(100),
  label: z.string().nullable().optional(),
  variant: z.enum(['default', 'success', 'warning', 'destructive']).default('default'),
});

export const CodeBlockWidgetSchema = z.object({
  type: z.literal('code-block'),
  title: z.string().nullable().optional(),
  code: z.string(),
  language: z.string().default('text'),
  maxHeight: z.string().nullable().optional().describe('CSS max-height, e.g. "300px"'),
});

export const AlertWidgetSchema = z.object({
  type: z.literal('alert'),
  title: z.string().nullable().optional(),
  message: z.string(),
  variant: z.enum(['default', 'destructive', 'success', 'warning']).default('default'),
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
});

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
]);

export type Widget = z.infer<typeof WidgetSchema>;

/** All supported widget type strings */
export const WIDGET_TYPES = [
  'table', 'key-value', 'badge-grid', 'stat-card', 'progress-bar',
  'code-block', 'alert', 'chart', 'tree', 'log-viewer',
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

// ── Layout containers ───────────────────────────────────

export const StackLayoutSchema = z.object({
  layout: z.literal('stack'),
  gap: z.enum(['sm', 'md', 'lg']).default('md'),
  widgets: z.array(WidgetSchema),
});

export const GridLayoutSchema = z.object({
  layout: z.literal('grid'),
  columns: z.number().min(1).max(4).default(2),
  widgets: z.array(WidgetSchema),
});

export const TabsLayoutSchema = z.object({
  layout: z.literal('tabs'),
  tabs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    icon: z.string().nullable().optional(),
    widgets: z.array(WidgetSchema),
  })),
});

export const SidebarLayoutSchema = z.object({
  layout: z.literal('sidebar'),
  sidebarItems: z.array(z.object({
    id: z.string(),
    label: z.string(),
    icon: z.string().nullable().optional(),
  })),
  sections: z.record(z.string(), z.array(WidgetSchema)),
});

export const LayoutSchema = z.discriminatedUnion('layout', [
  StackLayoutSchema,
  GridLayoutSchema,
  TabsLayoutSchema,
  SidebarLayoutSchema,
]);

export type Layout = z.infer<typeof LayoutSchema>;

/** All supported layout type strings */
export const LAYOUT_TYPES = ['stack', 'grid', 'tabs', 'sidebar'] as const;

export type LayoutType = (typeof LAYOUT_TYPES)[number];

// ── Top-level schema ────────────────────────────────────

export const DynamicViewMetaSchema = z.object({
  tool: z.string().nullable().optional().describe('CLI tool or package name'),
  command: z.string().nullable().optional().describe('Command that produced the data'),
  generatedAt: z.string().nullable().optional(),
  templateId: z.string().nullable().optional().describe('Template used, if any'),
});

export const DynamicViewSchema = z.object({
  /** Display title for the window */
  title: z.string(),
  /** Optional subtitle / description */
  description: z.string().nullable().optional(),
  /** Lucide icon name */
  icon: z.string().nullable().optional(),
  /** The root layout container */
  root: LayoutSchema,
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
