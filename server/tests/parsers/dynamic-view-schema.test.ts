// EX1.1: DynamicViewSchema unit tests
// @see docs/phases/phase-ex1.md

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  DynamicViewSchema,
  WidgetSchema,
  LayoutSchema,
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
  FormFieldSchema,
  FormFieldGroupSchema,
  StackLayoutSchema,
  GridLayoutSchema,
  TabsLayoutSchema,
  SidebarLayoutSchema,
  DynamicViewMetaSchema,
  DataSourceSchema,
  WidgetActionSchema,
  WIDGET_TYPES,
  LAYOUT_TYPES,
} from 'headlessos-shared/schemas/dynamic-view';

// ── Test fixtures ───────────────────────────────────────

const validStatCard = {
  type: 'stat-card' as const,
  title: 'CPU Usage',
  value: '45%',
  unit: '%',
  trend: 'up' as const,
  icon: 'Cpu',
};

const validTable = {
  type: 'table' as const,
  title: 'Disk Usage',
  columns: [
    { key: 'filesystem', label: 'Filesystem' },
    { key: 'size', label: 'Size', type: 'bytes' as const },
    { key: 'used', label: 'Used', type: 'percent' as const },
    { key: 'status', label: 'Status', type: 'badge' as const, badgeVariant: { healthy: 'success', warning: 'warning', critical: 'destructive' } },
  ],
  rows: [
    { filesystem: '/dev/sda1', size: '50G', used: '60', status: 'healthy' },
    { filesystem: '/dev/sdb1', size: '100G', used: '90', status: 'critical' },
  ],
  footer: '2 filesystems',
};

const validKeyValue = {
  type: 'key-value' as const,
  title: 'System Info',
  pairs: [
    { key: 'Hostname', value: 'web-01' },
    { key: 'OS', value: 'Ubuntu 22.04', icon: 'Monitor', copyable: true },
  ],
  layout: 'grid-2' as const,
};

const validBadgeGrid = {
  type: 'badge-grid' as const,
  title: 'Services',
  badges: [
    { label: 'nginx', value: 'running', variant: 'success' as const },
    { label: 'mysql', value: 'stopped', variant: 'destructive' as const },
  ],
};

const validProgressBar = {
  type: 'progress-bar' as const,
  title: 'Memory',
  value: 72,
  label: '72% used',
  variant: 'warning' as const,
};

const validCodeBlock = {
  type: 'code-block' as const,
  title: 'Config',
  code: 'server {\n  listen 80;\n}',
  language: 'nginx',
  maxHeight: '300px',
};

const validAlert = {
  type: 'alert' as const,
  title: 'Warning',
  message: 'Disk space running low',
  variant: 'warning' as const,
};

const validChart = {
  type: 'chart' as const,
  title: 'CPU Over Time',
  chartType: 'line' as const,
  data: [
    { time: '10:00', cpu: 45, memory: 60 },
    { time: '10:05', cpu: 52, memory: 62 },
  ],
  xKey: 'time',
  yKeys: [
    { key: 'cpu', label: 'CPU %', color: '#3b82f6' },
    { key: 'memory', label: 'Memory %' },
  ],
};

const validTree = {
  type: 'tree' as const,
  title: 'Directory',
  nodes: [
    {
      label: '/etc',
      icon: 'Folder',
      children: [
        { label: 'nginx', children: [{ label: 'nginx.conf' }] },
        { label: 'hosts', value: '10 entries' },
      ],
    },
  ],
};

const validLogViewer = {
  type: 'log-viewer' as const,
  title: 'Nginx Access Log',
  lines: [
    { timestamp: '2026-04-07T10:00:00Z', level: 'info' as const, message: 'GET /api/health 200' },
    { timestamp: '2026-04-07T10:00:01Z', level: 'error' as const, message: 'GET /api/users 500' },
    { message: 'plain line without timestamp or level' },
  ],
};

const validStackLayout = {
  layout: 'stack' as const,
  gap: 'md' as const,
  widgets: [validStatCard, validTable],
};

const validGridLayout = {
  layout: 'grid' as const,
  columns: 3,
  widgets: [validStatCard, validStatCard, validProgressBar],
};

const validTabsLayout = {
  layout: 'tabs' as const,
  tabs: [
    { id: 'overview', label: 'Overview', icon: 'LayoutDashboard', widgets: [validStatCard, validTable] },
    { id: 'logs', label: 'Logs', widgets: [validLogViewer] },
  ],
};

const validSidebarLayout = {
  layout: 'sidebar' as const,
  sidebarItems: [
    { id: 'general', label: 'General', icon: 'Settings' },
    { id: 'network', label: 'Network', icon: 'Network' },
  ],
  sections: {
    general: [validKeyValue, validProgressBar],
    network: [validTable],
  },
};

const validDynamicView = {
  title: 'Server Dashboard',
  description: 'Overview of web-01',
  icon: 'Server',
  root: validStackLayout,
  meta: {
    tool: 'dashboard',
    command: 'df -h && free -m',
    generatedAt: '2026-04-07T10:00:00Z',
    templateId: 'system-overview',
  },
};

// ── Widget Schema Tests ─────────────────────────────────

describe('Widget Schemas', () => {
  describe('TableWidget', () => {
    it('parses valid table widget', () => {
      const result = TableWidgetSchema.parse(validTable);
      expect(result.type).toBe('table');
      expect(result.columns).toHaveLength(4);
      expect(result.rows).toHaveLength(2);
      expect(result.footer).toBe('2 filesystems');
    });

    it('applies defaults for column type and sortable', () => {
      const minimal = {
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }],
        rows: [{ name: 'test' }],
      };
      const result = TableWidgetSchema.parse(minimal);
      expect(result.columns[0].type).toBe('text');
      expect(result.columns[0].sortable).toBe(false);
    });

    it('rejects table without columns', () => {
      expect(() => TableWidgetSchema.parse({ type: 'table', rows: [] })).toThrow(ZodError);
    });

    it('rejects table without rows', () => {
      expect(() => TableWidgetSchema.parse({
        type: 'table',
        columns: [{ key: 'a', label: 'A' }],
      })).toThrow(ZodError);
    });

    it('validates badge variant map', () => {
      const col = validTable.columns[3];
      expect(col.badgeVariant).toEqual({
        healthy: 'success',
        warning: 'warning',
        critical: 'destructive',
      });
    });
  });

  describe('KeyValueWidget', () => {
    it('parses valid key-value widget', () => {
      const result = KeyValueWidgetSchema.parse(validKeyValue);
      expect(result.type).toBe('key-value');
      expect(result.pairs).toHaveLength(2);
      expect(result.layout).toBe('grid-2');
    });

    it('defaults layout to grid-2', () => {
      const minimal = { type: 'key-value', pairs: [{ key: 'k', value: 'v' }] };
      const result = KeyValueWidgetSchema.parse(minimal);
      expect(result.layout).toBe('grid-2');
    });

    it('defaults copyable to false', () => {
      const minimal = { type: 'key-value', pairs: [{ key: 'k', value: 'v' }] };
      const result = KeyValueWidgetSchema.parse(minimal);
      expect(result.pairs[0].copyable).toBe(false);
    });
  });

  describe('BadgeGridWidget', () => {
    it('parses valid badge grid', () => {
      const result = BadgeGridWidgetSchema.parse(validBadgeGrid);
      expect(result.type).toBe('badge-grid');
      expect(result.badges).toHaveLength(2);
    });

    it('defaults badge variant to default', () => {
      const minimal = {
        type: 'badge-grid',
        badges: [{ label: 'test', value: 'ok' }],
      };
      const result = BadgeGridWidgetSchema.parse(minimal);
      expect(result.badges[0].variant).toBe('default');
    });
  });

  describe('StatCardWidget', () => {
    it('parses valid stat card', () => {
      const result = StatCardWidgetSchema.parse(validStatCard);
      expect(result.type).toBe('stat-card');
      expect(result.title).toBe('CPU Usage');
      expect(result.value).toBe('45%');
      expect(result.trend).toBe('up');
    });

    it('requires title and value', () => {
      expect(() => StatCardWidgetSchema.parse({ type: 'stat-card' })).toThrow(ZodError);
      expect(() => StatCardWidgetSchema.parse({ type: 'stat-card', title: 'X' })).toThrow(ZodError);
    });
  });

  describe('ProgressBarWidget', () => {
    it('parses valid progress bar', () => {
      const result = ProgressBarWidgetSchema.parse(validProgressBar);
      expect(result.type).toBe('progress-bar');
      expect(result.value).toBe(72);
    });

    it('rejects value below 0', () => {
      expect(() => ProgressBarWidgetSchema.parse({
        type: 'progress-bar', value: -1,
      })).toThrow(ZodError);
    });

    it('rejects value above 100', () => {
      expect(() => ProgressBarWidgetSchema.parse({
        type: 'progress-bar', value: 101,
      })).toThrow(ZodError);
    });

    it('defaults variant to default', () => {
      const result = ProgressBarWidgetSchema.parse({ type: 'progress-bar', value: 50 });
      expect(result.variant).toBe('default');
    });
  });

  describe('CodeBlockWidget', () => {
    it('parses valid code block', () => {
      const result = CodeBlockWidgetSchema.parse(validCodeBlock);
      expect(result.type).toBe('code-block');
      expect(result.code).toContain('listen 80');
      expect(result.language).toBe('nginx');
    });

    it('requires code field', () => {
      expect(() => CodeBlockWidgetSchema.parse({ type: 'code-block' })).toThrow(ZodError);
    });

    it('defaults language to text', () => {
      const result = CodeBlockWidgetSchema.parse({ type: 'code-block', code: 'hello' });
      expect(result.language).toBe('text');
    });
  });

  describe('AlertWidget', () => {
    it('parses valid alert', () => {
      const result = AlertWidgetSchema.parse(validAlert);
      expect(result.type).toBe('alert');
      expect(result.variant).toBe('warning');
    });

    it('requires message', () => {
      expect(() => AlertWidgetSchema.parse({ type: 'alert' })).toThrow(ZodError);
    });

    it('defaults variant to default', () => {
      const result = AlertWidgetSchema.parse({ type: 'alert', message: 'hi' });
      expect(result.variant).toBe('default');
    });
  });

  describe('ChartWidget', () => {
    it('parses valid chart', () => {
      const result = ChartWidgetSchema.parse(validChart);
      expect(result.type).toBe('chart');
      expect(result.chartType).toBe('line');
      expect(result.data).toHaveLength(2);
      expect(result.yKeys).toHaveLength(2);
    });

    it('requires chartType, data, xKey, yKeys', () => {
      expect(() => ChartWidgetSchema.parse({ type: 'chart' })).toThrow(ZodError);
    });

    it('defaults height to 300', () => {
      const minimal = {
        type: 'chart', chartType: 'bar',
        data: [{ x: 1, y: 2 }], xKey: 'x', yKeys: [{ key: 'y' }],
      };
      const result = ChartWidgetSchema.parse(minimal);
      expect(result.height).toBe(300);
    });

    it('validates chartType enum', () => {
      expect(() => ChartWidgetSchema.parse({
        type: 'chart', chartType: 'scatter',
        data: [], xKey: 'x', yKeys: [{ key: 'y' }],
      })).toThrow(ZodError);
    });
  });

  describe('TreeWidget', () => {
    it('parses valid tree with nested children', () => {
      const result = TreeWidgetSchema.parse(validTree);
      expect(result.type).toBe('tree');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].children).toHaveLength(2);
      expect(result.nodes[0].children![0].children).toHaveLength(1);
    });

    it('parses tree with no children (leaf nodes)', () => {
      const result = TreeWidgetSchema.parse({
        type: 'tree',
        nodes: [{ label: 'leaf' }],
      });
      expect(result.nodes[0].children).toBeUndefined();
    });

    it('handles deeply nested trees', () => {
      const deep = {
        type: 'tree',
        nodes: [{
          label: 'L1',
          children: [{
            label: 'L2',
            children: [{
              label: 'L3',
              children: [{ label: 'L4' }],
            }],
          }],
        }],
      };
      const result = TreeWidgetSchema.parse(deep);
      expect(result.nodes[0].children![0].children![0].children![0].label).toBe('L4');
    });
  });

  describe('LogViewerWidget', () => {
    it('parses valid log viewer', () => {
      const result = LogViewerWidgetSchema.parse(validLogViewer);
      expect(result.type).toBe('log-viewer');
      expect(result.lines).toHaveLength(3);
    });

    it('allows lines without timestamp or level', () => {
      const result = LogViewerWidgetSchema.parse({
        type: 'log-viewer',
        lines: [{ message: 'just a message' }],
      });
      expect(result.lines[0].timestamp).toBeUndefined();
      expect(result.lines[0].level).toBeUndefined();
    });

    it('defaults maxHeight to 400px', () => {
      const result = LogViewerWidgetSchema.parse({
        type: 'log-viewer', lines: [],
      });
      expect(result.maxHeight).toBe('400px');
    });
  });
});

// ── Widget Discriminated Union Tests ────────────────────

describe('WidgetSchema (discriminated union)', () => {
  it('accepts all valid widget types', () => {
    const widgets = [
      validStatCard, validTable, validKeyValue, validBadgeGrid,
      validProgressBar, validCodeBlock, validAlert, validChart,
      validTree, validLogViewer,
    ];
    for (const widget of widgets) {
      expect(() => WidgetSchema.parse(widget)).not.toThrow();
    }
  });

  it('rejects unknown widget type', () => {
    expect(() => WidgetSchema.parse({ type: 'unknown-widget' })).toThrow(ZodError);
  });

  it('rejects widget without type field', () => {
    expect(() => WidgetSchema.parse({ title: 'no type' })).toThrow(ZodError);
  });

  it('WIDGET_TYPES constant matches all registered types', () => {
    expect(WIDGET_TYPES).toEqual([
      'table', 'key-value', 'badge-grid', 'stat-card', 'progress-bar',
      'code-block', 'alert', 'chart', 'tree', 'log-viewer', 'form',
    ]);
    expect(WIDGET_TYPES).toHaveLength(11);
  });
});

// ── Layout Schema Tests ─────────────────────────────────

describe('Layout Schemas', () => {
  describe('StackLayout', () => {
    it('parses valid stack layout', () => {
      const result = StackLayoutSchema.parse(validStackLayout);
      expect(result.layout).toBe('stack');
      expect(result.widgets).toHaveLength(2);
      expect(result.gap).toBe('md');
    });

    it('defaults gap to md', () => {
      const result = StackLayoutSchema.parse({ layout: 'stack', widgets: [] });
      expect(result.gap).toBe('md');
    });
  });

  describe('GridLayout', () => {
    it('parses valid grid layout', () => {
      const result = GridLayoutSchema.parse(validGridLayout);
      expect(result.layout).toBe('grid');
      expect(result.columns).toBe(3);
      expect(result.widgets).toHaveLength(3);
    });

    it('defaults columns to 2', () => {
      const result = GridLayoutSchema.parse({ layout: 'grid', widgets: [] });
      expect(result.columns).toBe(2);
    });

    it('rejects columns < 1', () => {
      expect(() => GridLayoutSchema.parse({
        layout: 'grid', columns: 0, widgets: [],
      })).toThrow(ZodError);
    });

    it('rejects columns > 4', () => {
      expect(() => GridLayoutSchema.parse({
        layout: 'grid', columns: 5, widgets: [],
      })).toThrow(ZodError);
    });
  });

  describe('TabsLayout', () => {
    it('parses valid tabs layout', () => {
      const result = TabsLayoutSchema.parse(validTabsLayout);
      expect(result.layout).toBe('tabs');
      expect(result.tabs).toHaveLength(2);
      expect(result.tabs[0].widgets).toHaveLength(2);
    });

    it('requires tabs array', () => {
      expect(() => TabsLayoutSchema.parse({ layout: 'tabs' })).toThrow(ZodError);
    });

    it('each tab requires id and label', () => {
      expect(() => TabsLayoutSchema.parse({
        layout: 'tabs',
        tabs: [{ widgets: [] }],
      })).toThrow(ZodError);
    });
  });

  describe('SidebarLayout', () => {
    it('parses valid sidebar layout', () => {
      const result = SidebarLayoutSchema.parse(validSidebarLayout);
      expect(result.layout).toBe('sidebar');
      expect(result.sidebarItems).toHaveLength(2);
      expect(Object.keys(result.sections)).toHaveLength(2);
    });

    it('requires sidebarItems and sections', () => {
      expect(() => SidebarLayoutSchema.parse({ layout: 'sidebar' })).toThrow(ZodError);
    });
  });
});

describe('LayoutSchema (discriminated union)', () => {
  it('accepts all layout types', () => {
    const layouts = [validStackLayout, validGridLayout, validTabsLayout, validSidebarLayout];
    for (const layout of layouts) {
      expect(() => LayoutSchema.parse(layout)).not.toThrow();
    }
  });

  it('rejects unknown layout type', () => {
    expect(() => LayoutSchema.parse({ layout: 'unknown' })).toThrow(ZodError);
  });

  it('LAYOUT_TYPES constant matches all registered types', () => {
    expect(LAYOUT_TYPES).toEqual(['stack', 'grid', 'tabs', 'sidebar']);
    expect(LAYOUT_TYPES).toHaveLength(4);
  });
});

// ── DynamicViewSchema Tests ─────────────────────────────

describe('DynamicViewSchema', () => {
  it('parses a complete valid dynamic view', () => {
    const result = DynamicViewSchema.parse(validDynamicView);
    expect(result.title).toBe('Server Dashboard');
    expect(result.description).toBe('Overview of web-01');
    expect(result.icon).toBe('Server');
    expect(result.root.layout).toBe('stack');
    expect(result.meta?.tool).toBe('dashboard');
    expect(result.meta?.templateId).toBe('system-overview');
  });

  it('accepts minimal view (title + root only)', () => {
    const minimal = {
      title: 'Test',
      root: { layout: 'stack', widgets: [] },
    };
    const result = DynamicViewSchema.parse(minimal);
    expect(result.title).toBe('Test');
    expect(result.description).toBeUndefined();
    expect(result.icon).toBeUndefined();
    expect(result.meta).toBeUndefined();
  });

  it('rejects view without title', () => {
    expect(() => DynamicViewSchema.parse({
      root: { layout: 'stack', widgets: [] },
    })).toThrow(ZodError);
  });

  it('rejects view without root', () => {
    expect(() => DynamicViewSchema.parse({ title: 'Test' })).toThrow(ZodError);
  });

  it('parses view with grid layout root', () => {
    const view = {
      title: 'Grid View',
      root: validGridLayout,
    };
    const result = DynamicViewSchema.parse(view);
    expect(result.root.layout).toBe('grid');
  });

  it('parses view with tabs layout root', () => {
    const view = {
      title: 'Tabbed View',
      root: validTabsLayout,
    };
    const result = DynamicViewSchema.parse(view);
    expect(result.root.layout).toBe('tabs');
  });

  it('parses view with sidebar layout root', () => {
    const view = {
      title: 'Sidebar View',
      root: validSidebarLayout,
    };
    const result = DynamicViewSchema.parse(view);
    expect(result.root.layout).toBe('sidebar');
  });

  it('validates nested widgets within layouts', () => {
    const view = {
      title: 'Nested',
      root: {
        layout: 'tabs' as const,
        tabs: [{
          id: 'tab1',
          label: 'Tab 1',
          widgets: [
            validStatCard,
            validTable,
            validChart,
            validCodeBlock,
          ],
        }],
      },
    };
    const result = DynamicViewSchema.parse(view);
    expect(result.root.layout).toBe('tabs');
    const tabs = result.root as { tabs: Array<{ widgets: unknown[] }> };
    expect(tabs.tabs[0].widgets).toHaveLength(4);
  });
});

// ── Meta Schema Tests ───────────────────────────────────

describe('DynamicViewMetaSchema', () => {
  it('parses complete meta', () => {
    const result = DynamicViewMetaSchema.parse({
      tool: 'nginx',
      command: 'nginx -T',
      generatedAt: '2026-04-07T10:00:00Z',
      templateId: 'nginx-config',
    });
    expect(result.tool).toBe('nginx');
    expect(result.templateId).toBe('nginx-config');
  });

  it('all fields are optional', () => {
    const result = DynamicViewMetaSchema.parse({});
    expect(result.tool).toBeUndefined();
    expect(result.command).toBeUndefined();
  });
});

// ── Edge Cases ──────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles empty widgets array in stack', () => {
    const result = DynamicViewSchema.parse({
      title: 'Empty',
      root: { layout: 'stack', widgets: [] },
    });
    expect((result.root as { widgets: unknown[] }).widgets).toHaveLength(0);
  });

  it('handles empty tabs array', () => {
    const result = DynamicViewSchema.parse({
      title: 'No Tabs',
      root: { layout: 'tabs', tabs: [] },
    });
    expect((result.root as { tabs: unknown[] }).tabs).toHaveLength(0);
  });

  it('handles table with empty rows', () => {
    const result = TableWidgetSchema.parse({
      type: 'table',
      columns: [{ key: 'a', label: 'A' }],
      rows: [],
    });
    expect(result.rows).toHaveLength(0);
  });

  it('handles log viewer with empty lines', () => {
    const result = LogViewerWidgetSchema.parse({
      type: 'log-viewer',
      lines: [],
    });
    expect(result.lines).toHaveLength(0);
  });

  it('rejects completely invalid input', () => {
    expect(() => DynamicViewSchema.parse(null)).toThrow();
    expect(() => DynamicViewSchema.parse(undefined)).toThrow();
    expect(() => DynamicViewSchema.parse('string')).toThrow();
    expect(() => DynamicViewSchema.parse(42)).toThrow();
  });

  it('strips extra properties (Zod default behavior)', () => {
    const withExtra = {
      type: 'stat-card' as const,
      title: 'Test',
      value: '42',
      extraField: 'should be stripped',
    };
    const result = StatCardWidgetSchema.parse(withExtra);
    expect('extraField' in result).toBe(false);
  });

  it('handles large data sets in table', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `item-${i}` }));
    const result = TableWidgetSchema.parse({
      type: 'table',
      columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }],
      rows,
    });
    expect(result.rows).toHaveLength(1000);
  });

  it('accepts null for optional fields (OpenAI compatibility)', () => {
    const result = DynamicViewSchema.parse({
      title: 'Test',
      description: null,
      icon: null,
      meta: null,
      root: { layout: 'stack', widgets: [] },
    });
    expect(result.description).toBeNull();
    expect(result.icon).toBeNull();
    expect(result.meta).toBeNull();
  });

  it('accepts null for nested optional fields', () => {
    const result = StatCardWidgetSchema.parse({
      type: 'stat-card',
      title: 'CPU',
      value: '42%',
      unit: null,
      description: null,
      trend: null,
      icon: null,
    });
    expect(result.unit).toBeNull();
    expect(result.trend).toBeNull();
    expect(result.icon).toBeNull();
  });
});

// ── zodResponseFormat Compatibility ─────────────────────

describe('OpenAI zodResponseFormat compatibility', () => {
  it('schema converts to zodResponseFormat without error', async () => {
    const { zodResponseFormat } = await import('openai/helpers/zod');
    const format = zodResponseFormat(DynamicViewSchema, 'dynamic_view');

    expect(format.type).toBe('json_schema');
    expect(format.json_schema.name).toBe('dynamic_view');
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.schema).toBeDefined();
  });

  it('JSON schema has correct top-level properties', async () => {
    const { zodResponseFormat } = await import('openai/helpers/zod');
    const format = zodResponseFormat(DynamicViewSchema, 'dynamic_view');
    const props = Object.keys(format.json_schema.schema?.properties ?? {});

    expect(props).toContain('title');
    expect(props).toContain('root');
    expect(props).toContain('description');
    expect(props).toContain('icon');
    expect(props).toContain('meta');
  });
});

// ── EX1.12: DataSource Schema ───────────────────────────

describe('DataSourceSchema', () => {
  it('accepts valid dataSource', () => {
    const result = DataSourceSchema.parse({
      command: 'df -h',
      refreshInterval: 10000,
      parseMode: 'text',
    });
    expect(result.command).toBe('df -h');
    expect(result.refreshInterval).toBe(10000);
    expect(result.parseMode).toBe('text');
  });

  it('applies defaults for refreshInterval and parseMode', () => {
    const result = DataSourceSchema.parse({
      command: 'free -m',
    });
    expect(result.refreshInterval).toBe(30000);
    expect(result.parseMode).toBe('text');
  });

  it('rejects refreshInterval below 5000ms', () => {
    expect(() =>
      DataSourceSchema.parse({
        command: 'uptime',
        refreshInterval: 1000,
      }),
    ).toThrow();
  });

  it('rejects missing command', () => {
    expect(() =>
      DataSourceSchema.parse({
        refreshInterval: 10000,
      }),
    ).toThrow();
  });

  it('accepts json parseMode', () => {
    const result = DataSourceSchema.parse({
      command: 'docker stats --no-stream --format json',
      parseMode: 'json',
    });
    expect(result.parseMode).toBe('json');
  });

  it('rejects invalid parseMode', () => {
    expect(() =>
      DataSourceSchema.parse({
        command: 'ls',
        parseMode: 'xml',
      }),
    ).toThrow();
  });
});

describe('Widgets with dataSource', () => {
  it('table widget accepts optional dataSource', () => {
    const result = TableWidgetSchema.parse({
      type: 'table',
      columns: [{ key: 'name', label: 'Name', type: 'text', sortable: false }],
      rows: [{ name: 'test' }],
      dataSource: {
        command: 'ps aux',
        refreshInterval: 10000,
        parseMode: 'text',
      },
    });
    expect(result.dataSource?.command).toBe('ps aux');
  });

  it('stat-card widget accepts optional dataSource', () => {
    const result = StatCardWidgetSchema.parse({
      type: 'stat-card',
      title: 'CPU',
      value: '42%',
      dataSource: {
        command: "top -bn1 | grep Cpu",
        refreshInterval: 5000,
        parseMode: 'text',
      },
    });
    expect(result.dataSource?.command).toContain('top');
  });

  it('widgets work without dataSource', () => {
    const result = AlertWidgetSchema.parse({
      type: 'alert',
      severity: 'info',
      message: 'All good',
    });
    expect(result.dataSource).toBeUndefined();
  });

  it('widgets accept null dataSource', () => {
    const result = CodeBlockWidgetSchema.parse({
      type: 'code-block',
      code: 'echo hello',
      language: 'bash',
      dataSource: null,
    });
    expect(result.dataSource).toBeNull();
  });

  it('all widget types support dataSource field', () => {
    const widgetSchemas = [
      { schema: TableWidgetSchema, base: { type: 'table', columns: [{ key: 'a', label: 'A', type: 'text', sortable: false }], rows: [] } },
      { schema: KeyValueWidgetSchema, base: { type: 'key-value', pairs: [{ key: 'a', value: 'b', copyable: false }], layout: 'vertical' } },
      { schema: BadgeGridWidgetSchema, base: { type: 'badge-grid', badges: [{ label: 'a', value: 'b', variant: 'default' }] } },
      { schema: StatCardWidgetSchema, base: { type: 'stat-card', title: 'X', value: '1' } },
      { schema: ProgressBarWidgetSchema, base: { type: 'progress-bar', label: 'X', value: 50, max: 100 } },
      { schema: CodeBlockWidgetSchema, base: { type: 'code-block', code: 'x', language: 'bash' } },
      { schema: AlertWidgetSchema, base: { type: 'alert', severity: 'info', message: 'ok' } },
      { schema: ChartWidgetSchema, base: { type: 'chart', chartType: 'bar', xKey: 'name', data: [{ name: 'a', v: 1 }], yKeys: [{ key: 'v' }] } },
      { schema: TreeWidgetSchema, base: { type: 'tree', nodes: [{ label: 'root', children: [] }] } },
      { schema: LogViewerWidgetSchema, base: { type: 'log-viewer', lines: [{ message: 'ok' }] } },
      { schema: FormWidgetSchema, base: { type: 'form', fields: [{ key: 'name', label: 'Name' }] } },
    ];

    for (const { schema, base } of widgetSchemas) {
      const withDS = schema.parse({
        ...base,
        dataSource: { command: 'test', refreshInterval: 5000, parseMode: 'text' },
      });
      expect(withDS.dataSource).toBeDefined();
      expect(withDS.dataSource?.command).toBe('test');
    }
  });
});

// ── EX1.14: WidgetActionSchema & Table Actions ──────────────────

describe('WidgetActionSchema (EX1.14)', () => {
  it('parses a valid action with all fields', () => {
    const result = WidgetActionSchema.parse({
      id: 'stop-container',
      label: 'Stop',
      command: 'docker stop {id}',
      confirm: true,
      confirmMessage: 'Stop this container?',
      variant: 'destructive',
      icon: 'Square',
    });
    expect(result.id).toBe('stop-container');
    expect(result.label).toBe('Stop');
    expect(result.command).toBe('docker stop {id}');
    expect(result.confirm).toBe(true);
    expect(result.confirmMessage).toBe('Stop this container?');
    expect(result.variant).toBe('destructive');
    expect(result.icon).toBe('Square');
  });

  it('applies defaults for confirm and variant', () => {
    const result = WidgetActionSchema.parse({
      id: 'restart',
      label: 'Restart',
      command: 'systemctl restart {name}',
    });
    expect(result.confirm).toBe(false);
    expect(result.variant).toBe('default');
    expect(result.confirmMessage).toBeUndefined();
    expect(result.icon).toBeUndefined();
  });

  it('accepts null for optional fields', () => {
    const result = WidgetActionSchema.parse({
      id: 'test',
      label: 'Test',
      command: 'echo test',
      confirmMessage: null,
      icon: null,
    });
    expect(result.confirmMessage).toBeNull();
    expect(result.icon).toBeNull();
  });

  it('rejects action without required fields', () => {
    expect(() => WidgetActionSchema.parse({ id: 'x' })).toThrow(ZodError);
    expect(() => WidgetActionSchema.parse({ id: 'x', label: 'Y' })).toThrow(ZodError);
  });

  it('validates variant enum values', () => {
    const validVariants = ['default', 'destructive', 'outline', 'secondary', 'ghost'];
    for (const v of validVariants) {
      const result = WidgetActionSchema.parse({
        id: 'test', label: 'Test', command: 'echo hi', variant: v,
      });
      expect(result.variant).toBe(v);
    }
    expect(() => WidgetActionSchema.parse({
      id: 'test', label: 'Test', command: 'echo hi', variant: 'invalid',
    })).toThrow(ZodError);
  });
});

describe('TableWidgetSchema with actions (EX1.14)', () => {
  const baseTable = {
    type: 'table' as const,
    columns: [{ key: 'name', label: 'Name', type: 'text' as const, sortable: false }],
    rows: [{ name: 'my-container' }],
  };

  it('parses table without actions', () => {
    const result = TableWidgetSchema.parse(baseTable);
    expect(result.actions).toBeUndefined();
  });

  it('parses table with null actions', () => {
    const result = TableWidgetSchema.parse({ ...baseTable, actions: null });
    expect(result.actions).toBeNull();
  });

  it('parses table with empty actions array', () => {
    const result = TableWidgetSchema.parse({ ...baseTable, actions: [] });
    expect(result.actions).toEqual([]);
  });

  it('parses table with one action', () => {
    const result = TableWidgetSchema.parse({
      ...baseTable,
      actions: [{
        id: 'stop',
        label: 'Stop',
        command: 'docker stop {name}',
        confirm: true,
        confirmMessage: 'Stop container {name}?',
        variant: 'destructive',
      }],
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions![0]!.id).toBe('stop');
    expect(result.actions![0]!.variant).toBe('destructive');
  });

  it('parses table with multiple actions', () => {
    const result = TableWidgetSchema.parse({
      ...baseTable,
      actions: [
        { id: 'restart', label: 'Restart', command: 'docker restart {name}' },
        { id: 'stop', label: 'Stop', command: 'docker stop {name}', confirm: true, variant: 'destructive' },
        { id: 'logs', label: 'Logs', command: 'docker logs --tail 50 {name}', variant: 'outline' },
      ],
    });
    expect(result.actions).toHaveLength(3);
  });

  it('full DynamicView with table actions validates', () => {
    const view = DynamicViewSchema.parse({
      title: 'Docker Containers',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          ...baseTable,
          actions: [
            { id: 'stop', label: 'Stop', command: 'docker stop {name}', confirm: true, variant: 'destructive' },
          ],
        }],
      },
    });
    expect(view.root.widgets).toHaveLength(1);
    const table = view.root.widgets[0] as { actions?: unknown[] };
    expect(table.actions).toHaveLength(1);
  });
});

// ── EX1.15: FormFieldSchema & FormWidgetSchema ──────────────────

describe('FormFieldSchema (EX1.15)', () => {
  it('parses a text field with all properties', () => {
    const result = FormFieldSchema.parse({
      key: 'hostname',
      label: 'Hostname',
      type: 'text',
      value: 'server-01',
      placeholder: 'Enter hostname',
      description: 'Server hostname',
      required: true,
      min: 1,
      max: 64,
      pattern: '^[a-z0-9-]+$',
    });
    expect(result.key).toBe('hostname');
    expect(result.type).toBe('text');
    expect(result.value).toBe('server-01');
    expect(result.required).toBe(true);
    expect(result.pattern).toBe('^[a-z0-9-]+$');
  });

  it('applies default type (text) and required (false)', () => {
    const result = FormFieldSchema.parse({ key: 'name', label: 'Name' });
    expect(result.type).toBe('text');
    expect(result.required).toBe(false);
  });

  it('parses a number field', () => {
    const result = FormFieldSchema.parse({
      key: 'port',
      label: 'Port',
      type: 'number',
      value: 8080,
      min: 1,
      max: 65535,
    });
    expect(result.type).toBe('number');
    expect(result.value).toBe(8080);
    expect(result.min).toBe(1);
    expect(result.max).toBe(65535);
  });

  it('parses a boolean field', () => {
    const result = FormFieldSchema.parse({
      key: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      value: true,
    });
    expect(result.type).toBe('boolean');
    expect(result.value).toBe(true);
  });

  it('parses a select field with options', () => {
    const result = FormFieldSchema.parse({
      key: 'env',
      label: 'Environment',
      type: 'select',
      value: 'production',
      options: [
        { label: 'Production', value: 'production' },
        { label: 'Staging', value: 'staging' },
        { label: 'Dev', value: 'dev' },
      ],
    });
    expect(result.type).toBe('select');
    expect(result.options).toHaveLength(3);
  });

  it('parses a textarea field', () => {
    const result = FormFieldSchema.parse({
      key: 'notes',
      label: 'Notes',
      type: 'textarea',
      value: 'Some notes here',
    });
    expect(result.type).toBe('textarea');
  });

  it('accepts null for optional fields', () => {
    const result = FormFieldSchema.parse({
      key: 'test',
      label: 'Test',
      value: null,
      placeholder: null,
      description: null,
      options: null,
      min: null,
      max: null,
      pattern: null,
    });
    expect(result.value).toBeNull();
    expect(result.placeholder).toBeNull();
  });

  it('rejects invalid field type', () => {
    expect(() =>
      FormFieldSchema.parse({ key: 'x', label: 'X', type: 'invalid' }),
    ).toThrow(ZodError);
  });

  it('rejects missing key or label', () => {
    expect(() => FormFieldSchema.parse({ label: 'X' })).toThrow(ZodError);
    expect(() => FormFieldSchema.parse({ key: 'x' })).toThrow(ZodError);
  });
});

describe('FormFieldGroupSchema (EX1.15)', () => {
  it('parses a valid group', () => {
    const result = FormFieldGroupSchema.parse({
      label: 'Network Settings',
      fieldKeys: ['hostname', 'port', 'protocol'],
    });
    expect(result.label).toBe('Network Settings');
    expect(result.fieldKeys).toHaveLength(3);
  });

  it('rejects missing label', () => {
    expect(() =>
      FormFieldGroupSchema.parse({ fieldKeys: ['a'] }),
    ).toThrow(ZodError);
  });
});

describe('FormWidgetSchema (EX1.15)', () => {
  const baseFormWidget = {
    type: 'form' as const,
    fields: [
      { key: 'hostname', label: 'Hostname', type: 'text' as const, value: 'srv-1' },
      { key: 'port', label: 'Port', type: 'number' as const, value: 8080 },
    ],
  };

  it('parses a minimal form widget', () => {
    const result = FormWidgetSchema.parse(baseFormWidget);
    expect(result.type).toBe('form');
    expect(result.fields).toHaveLength(2);
    expect(result.submitLabel).toBe('Save');
    expect(result.readOnly).toBe(false);
  });

  it('parses form with title and custom submit label', () => {
    const result = FormWidgetSchema.parse({
      ...baseFormWidget,
      title: 'Server Config',
      submitLabel: 'Apply Changes',
    });
    expect(result.title).toBe('Server Config');
    expect(result.submitLabel).toBe('Apply Changes');
  });

  it('parses form with groups', () => {
    const result = FormWidgetSchema.parse({
      ...baseFormWidget,
      groups: [
        { label: 'Network', fieldKeys: ['hostname', 'port'] },
      ],
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups![0]!.label).toBe('Network');
  });

  it('parses read-only form', () => {
    const result = FormWidgetSchema.parse({
      ...baseFormWidget,
      readOnly: true,
    });
    expect(result.readOnly).toBe(true);
  });

  it('parses form with dataSource', () => {
    const result = FormWidgetSchema.parse({
      ...baseFormWidget,
      dataSource: { command: 'cat /etc/config.json', refreshInterval: 10000, parseMode: 'json' },
    });
    expect(result.dataSource?.command).toBe('cat /etc/config.json');
  });

  it('accepts null for optional fields', () => {
    const result = FormWidgetSchema.parse({
      ...baseFormWidget,
      title: null,
      groups: null,
      dataSource: null,
    });
    expect(result.title).toBeNull();
    expect(result.groups).toBeNull();
  });

  it('rejects form without fields', () => {
    expect(() => FormWidgetSchema.parse({ type: 'form' })).toThrow(ZodError);
  });

  it('form widget in WidgetSchema union validates', () => {
    const result = WidgetSchema.parse(baseFormWidget);
    expect(result.type).toBe('form');
  });

  it('form widget in full DynamicView validates', () => {
    const view = DynamicViewSchema.parse({
      title: 'Config Editor',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [baseFormWidget],
      },
    });
    expect(view.root.widgets).toHaveLength(1);
    expect(view.root.widgets[0]!.type).toBe('form');
  });
});
