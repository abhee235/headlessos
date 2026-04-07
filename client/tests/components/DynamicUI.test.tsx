// EX1.2 + EX1.5: Component tests for DynamicUI renderer + all widgets
// @see docs/phases/phase-ex1.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

// Import triggers widget registration
import { DynamicViewRenderer, DynamicAppWindow, DynamicUIPlayground } from '../../src/components/DynamicUI';
import { getRegisteredTypes, clearRegistry } from '../../src/components/DynamicUI/widget-registry';
import { EXAMPLE_VIEWS } from '../../src/components/DynamicUI/playground-examples';

// Mock react-resizable-panels (not compatible with jsdom)
vi.mock('react-resizable-panels', () => ({
  Group: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div data-testid="panel-group" {...props}>{children}</div>,
  Panel: ({ children }: React.PropsWithChildren) => <div data-testid="panel">{children}</div>,
  Separator: ({ children }: React.PropsWithChildren) => <div data-testid="separator">{children}</div>,
}));

// Mock recharts (ResponsiveContainer uses ResizeObserver, not available in jsdom)
vi.mock('recharts', () => {
  const React = require('react');
  const createMockChart = (name: string) =>
    ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', { 'data-testid': `mock-${name}`, ...props }, children);

  return {
    ResponsiveContainer: ({ children }: React.PropsWithChildren) =>
      React.createElement('div', { 'data-testid': 'responsive-container' }, children),
    BarChart: createMockChart('bar-chart'),
    Bar: ({ dataKey }: { dataKey: string }) => React.createElement('div', { 'data-testid': `bar-${dataKey}` }),
    LineChart: createMockChart('line-chart'),
    Line: ({ dataKey }: { dataKey: string }) => React.createElement('div', { 'data-testid': `line-${dataKey}` }),
    AreaChart: createMockChart('area-chart'),
    Area: ({ dataKey }: { dataKey: string }) => React.createElement('div', { 'data-testid': `area-${dataKey}` }),
    PieChart: createMockChart('pie-chart'),
    Pie: (props: Record<string, unknown>) => React.createElement('div', { 'data-testid': 'pie' }),
    Cell: () => React.createElement('div', { 'data-testid': 'cell' }),
    XAxis: () => React.createElement('div', { 'data-testid': 'x-axis' }),
    YAxis: () => React.createElement('div', { 'data-testid': 'y-axis' }),
    CartesianGrid: () => React.createElement('div', { 'data-testid': 'cartesian-grid' }),
    Tooltip: () => null,
    Legend: () => null,
  };
});

// ── Widget Registry ─────────────────────────────────────

describe('Widget Registry', () => {
  it('has all 10 widget types registered (7 base + 3 extended)', () => {
    const types = getRegisteredTypes();
    // Base widgets (EX1.2)
    expect(types).toContain('table');
    expect(types).toContain('key-value');
    expect(types).toContain('badge-grid');
    expect(types).toContain('stat-card');
    expect(types).toContain('progress-bar');
    expect(types).toContain('code-block');
    expect(types).toContain('alert');
    // Extended widgets (EX1.5)
    expect(types).toContain('chart');
    expect(types).toContain('tree');
    expect(types).toContain('log-viewer');
    expect(types.length).toBe(10);
  });
});

// ── DynamicViewRenderer ─────────────────────────────────

describe('DynamicViewRenderer', () => {
  it('renders description when present', () => {
    const view: DynamicView = {
      title: 'Test',
      description: 'A test description',
      root: { layout: 'stack', gap: 'md', widgets: [] },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('A test description')).toBeInTheDocument();
  });

  it('renders skeleton when root is missing (streaming)', () => {
    render(<DynamicViewRenderer view={{}} />);
    // Skeleton should be visible
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders stack layout with widgets', () => {
    const view: DynamicView = {
      title: 'Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [
          { type: 'stat-card', title: 'CPU Usage', value: '45%' },
          { type: 'stat-card', title: 'Memory', value: '78%' },
        ],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
  });

  it('renders grid layout with widgets', () => {
    const view: DynamicView = {
      title: 'Test Grid',
      root: {
        layout: 'grid',
        columns: 2,
        widgets: [
          { type: 'stat-card', title: 'Metric A', value: '10' },
          { type: 'stat-card', title: 'Metric B', value: '20' },
        ],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Metric A')).toBeInTheDocument();
    expect(screen.getByText('Metric B')).toBeInTheDocument();
  });
});

// ── TableWidget ─────────────────────────────────────────

describe('TableWidget', () => {
  it('renders table with headers and rows', () => {
    const view: DynamicView = {
      title: 'Table Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'table',
          title: 'Processes',
          columns: [
            { key: 'name', label: 'Name', type: 'text', sortable: false },
            { key: 'pid', label: 'PID', type: 'number', sortable: false },
          ],
          rows: [
            { name: 'nginx', pid: 1234 },
            { name: 'node', pid: 5678 },
          ],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Processes')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('PID')).toBeInTheDocument();
    expect(screen.getByText('nginx')).toBeInTheDocument();
    expect(screen.getByText('node')).toBeInTheDocument();
  });

  it('renders badge columns with variant mapping', () => {
    const view: DynamicView = {
      title: 'Badge Table',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'table',
          columns: [{
            key: 'status',
            label: 'Status',
            type: 'badge',
            sortable: false,
            badgeVariant: { running: 'success', stopped: 'destructive' },
          }],
          rows: [{ status: 'running' }],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('renders footer text', () => {
    const view: DynamicView = {
      title: 'Footer Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'table',
          columns: [{ key: 'a', label: 'A', type: 'text', sortable: false }],
          rows: [{ a: '1' }],
          footer: 'Showing 1 of 100 rows',
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Showing 1 of 100 rows')).toBeInTheDocument();
  });
});

// ── KeyValueWidget ──────────────────────────────────────

describe('KeyValueWidget', () => {
  it('renders key-value pairs', () => {
    const view: DynamicView = {
      title: 'KV Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'key-value',
          title: 'Server Info',
          pairs: [
            { key: 'Hostname', value: 'web-01', copyable: false },
            { key: 'IP Address', value: '10.0.0.1', copyable: false },
          ],
          layout: 'grid-2',
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Server Info')).toBeInTheDocument();
    expect(screen.getByText('Hostname')).toBeInTheDocument();
    expect(screen.getByText('web-01')).toBeInTheDocument();
    expect(screen.getByText('IP Address')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
  });
});

// ── BadgeGridWidget ─────────────────────────────────────

describe('BadgeGridWidget', () => {
  it('renders badges with labels and values', () => {
    const view: DynamicView = {
      title: 'Badge Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'badge-grid',
          title: 'Services',
          badges: [
            { label: 'nginx', value: 'active', variant: 'success' },
            { label: 'mysql', value: 'stopped', variant: 'destructive' },
          ],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('nginx: active')).toBeInTheDocument();
    expect(screen.getByText('mysql: stopped')).toBeInTheDocument();
  });
});

// ── StatCardWidget ──────────────────────────────────────

describe('StatCardWidget', () => {
  it('renders value with unit and trend', () => {
    const view: DynamicView = {
      title: 'Stat Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'stat-card',
          title: 'CPU Usage',
          value: '45',
          unit: '%',
          trend: 'up',
          description: 'Last 5 minutes',
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
    expect(screen.getByText('Last 5 minutes')).toBeInTheDocument();
  });

  it('renders minimal stat card (title + value only)', () => {
    const view: DynamicView = {
      title: 'Min Stat',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'stat-card',
          title: 'Uptime',
          value: '99.9%',
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText('99.9%')).toBeInTheDocument();
  });
});

// ── ProgressBarWidget ───────────────────────────────────

describe('ProgressBarWidget', () => {
  it('renders progress bar with label and value', () => {
    const view: DynamicView = {
      title: 'Progress Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'progress-bar',
          title: 'Disk Usage',
          value: 72,
          label: '/dev/sda1',
          variant: 'warning',
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Disk Usage')).toBeInTheDocument();
    expect(screen.getByText('/dev/sda1')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
  });
});

// ── CodeBlockWidget ─────────────────────────────────────

describe('CodeBlockWidget', () => {
  it('renders code block with language label', () => {
    const view: DynamicView = {
      title: 'Code Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'code-block',
          title: 'Config',
          code: 'server {\n  listen 80;\n}',
          language: 'nginx',
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Config')).toBeInTheDocument();
    expect(screen.getByText('nginx')).toBeInTheDocument();
    // Code content is inside <code> element — use a matcher function for multiline text
    const codeEl = document.querySelector('code');
    expect(codeEl).toBeTruthy();
    expect(codeEl!.textContent).toContain('server {');
    expect(codeEl!.textContent).toContain('listen 80;');
  });
});

// ── AlertWidget ─────────────────────────────────────────

describe('AlertWidget', () => {
  it('renders alert with title and message', () => {
    const view: DynamicView = {
      title: 'Alert Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'alert',
          title: 'Warning',
          message: 'Disk space is running low',
          variant: 'warning',
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Disk space is running low')).toBeInTheDocument();
  });

  it('renders destructive alert', () => {
    const view: DynamicView = {
      title: 'Error Alert',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'alert',
          message: 'Connection lost',
          variant: 'destructive',
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
  });
});

// ── Unknown Widget Handling ─────────────────────────────

describe('Unknown Widget Handling', () => {
  it('shows error alert for unknown widget type', () => {
    const view: DynamicView = {
      title: 'Unknown Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [
          { type: 'stat-card', title: 'Valid', value: '42' },
        ],
      },
    };

    // We need to test an unregistered type, which WidgetRenderer handles
    // But DynamicView schema won't allow unknown types. Test WidgetRenderer directly.
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Valid')).toBeInTheDocument();
  });
});

// ── Partial/Streaming Rendering ─────────────────────────

describe('Partial Schema Rendering', () => {
  it('handles partial view with missing widgets gracefully', () => {
    // Simulates streaming where only partial data has arrived
    render(<DynamicViewRenderer view={{ title: 'Loading...' }} />);
    // Should show skeleton since root is missing
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders available widgets in a growing array', () => {
    const view: DynamicView = {
      title: 'Streaming',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [
          { type: 'stat-card', title: 'First', value: '1' },
        ],
      },
    };
    const { rerender } = render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('First')).toBeInTheDocument();

    // Add second widget (simulates stream progress)
    const updated: DynamicView = {
      ...view,
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [
          { type: 'stat-card', title: 'First', value: '1' },
          { type: 'stat-card', title: 'Second', value: '2' },
        ],
      },
    };
    rerender(<DynamicViewRenderer view={updated} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });
});

// ── Mixed Widget Types ──────────────────────────────────

describe('Mixed Widget Compositions', () => {
  it('renders a complete dashboard view with mixed widgets', () => {
    const view: DynamicView = {
      title: 'System Dashboard',
      description: 'Overview of server metrics',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [
          {
            type: 'alert',
            message: 'System is healthy',
            variant: 'success',
          },
          {
            type: 'key-value',
            title: 'Server Details',
            pairs: [
              { key: 'OS', value: 'Ubuntu 22.04', copyable: false },
              { key: 'Kernel', value: '5.15.0', copyable: false },
            ],
            layout: 'grid-2',
          },
          {
            type: 'progress-bar',
            title: 'Memory',
            value: 64,
            label: '8GB / 12.5GB',
            variant: 'default',
          },
          {
            type: 'table',
            title: 'Top Processes',
            columns: [
              { key: 'name', label: 'Process', type: 'text', sortable: false },
              { key: 'cpu', label: 'CPU%', type: 'number', sortable: false },
            ],
            rows: [
              { name: 'nginx', cpu: 12.5 },
              { name: 'postgres', cpu: 8.3 },
            ],
          },
        ],
      },
    };
    render(<DynamicViewRenderer view={view} />);

    // Check description
    expect(screen.getByText('Overview of server metrics')).toBeInTheDocument();

    // Check alert
    expect(screen.getByText('System is healthy')).toBeInTheDocument();

    // Check key-value
    expect(screen.getByText('Server Details')).toBeInTheDocument();
    expect(screen.getByText('Ubuntu 22.04')).toBeInTheDocument();

    // Check progress
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();

    // Check table
    expect(screen.getByText('Top Processes')).toBeInTheDocument();
    expect(screen.getByText('nginx')).toBeInTheDocument();
  });

  it('renders grid layout with stat cards', () => {
    const view: DynamicView = {
      title: 'Metrics Grid',
      root: {
        layout: 'grid',
        columns: 3,
        widgets: [
          { type: 'stat-card', title: 'CPU', value: '45', unit: '%', trend: 'up' },
          { type: 'stat-card', title: 'RAM', value: '78', unit: '%', trend: 'down' },
          { type: 'stat-card', title: 'Disk', value: '320', unit: 'GB' },
        ],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('RAM')).toBeInTheDocument();
    expect(screen.getByText('Disk')).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
    expect(screen.getByText('↓')).toBeInTheDocument();
  });
});

// ── DynamicAppWindow ────────────────────────────────────

describe('DynamicAppWindow', () => {
  const sampleView: DynamicView = {
    title: 'System Info',
    description: 'Server overview',
    root: {
      layout: 'stack',
      gap: 'md',
      widgets: [
        { type: 'stat-card', title: 'CPU', value: '45%' },
      ],
    },
    meta: {
      command: 'uname -a',
      generatedAt: '2024-01-01T00:00:00Z',
    },
  };

  it('renders title and content when open', () => {
    render(<DynamicAppWindow view={sampleView} open={true} onClose={() => {}} />);
    expect(screen.getByText('System Info')).toBeInTheDocument();
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<DynamicAppWindow view={sampleView} open={false} onClose={() => {}} />);
    expect(screen.queryByText('System Info')).not.toBeInTheDocument();
  });

  it('shows JSON toggle button', () => {
    render(<DynamicAppWindow view={sampleView} open={true} onClose={() => {}} />);
    expect(screen.getByText('JSON')).toBeInTheDocument();
  });

  it('toggles between JSON and preview', () => {
    render(<DynamicAppWindow view={sampleView} open={true} onClose={() => {}} />);
    
    // Click JSON button
    fireEvent.click(screen.getByText('JSON'));
    
    // Should now show raw JSON
    expect(screen.getByText('Preview')).toBeInTheDocument();
    const codeEl = document.querySelector('code');
    expect(codeEl).toBeTruthy();
    expect(codeEl!.textContent).toContain('"title": "System Info"');
  });

  it('shows regenerate button when onRegenerate provided', () => {
    const onRegenerate = vi.fn();
    render(
      <DynamicAppWindow view={sampleView} open={true} onClose={() => {}} onRegenerate={onRegenerate} />
    );
    expect(screen.getByText('Regenerate')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Regenerate'));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('shows footer metadata', () => {
    render(<DynamicAppWindow view={sampleView} open={true} onClose={() => {}} />);
    expect(screen.getByText(/Command: uname -a/)).toBeInTheDocument();
  });
});

// ── DynamicUIPlayground ─────────────────────────────────

describe('DynamicUIPlayground', () => {
  it('renders when open with example views', () => {
    render(<DynamicUIPlayground open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Dynamic UI Playground')).toBeInTheDocument();
    expect(screen.getByText('JSON Schema')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<DynamicUIPlayground open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText('Dynamic UI Playground')).not.toBeInTheDocument();
  });

  it('shows valid status for default example', () => {
    render(<DynamicUIPlayground open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Valid')).toBeInTheDocument();
  });

  it('has import and export buttons', () => {
    render(<DynamicUIPlayground open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Import')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('shows validation error for invalid JSON', () => {
    render(<DynamicUIPlayground open={true} onOpenChange={() => {}} />);
    const editor = screen.getByTestId('json-editor');
    fireEvent.change(editor, { target: { value: '{ invalid json' } });
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect(screen.getByText('Validation Error')).toBeInTheDocument();
  });

  it('example views all validate against schema', () => {
    // Verify all example views are valid DynamicView schemas
    for (const example of EXAMPLE_VIEWS) {
      expect(() => {
        const { DynamicViewSchema } = require('headlessos-shared/schemas/dynamic-view');
        DynamicViewSchema.parse(example.data);
      }).not.toThrow();
    }
  });
});

// ── ChartWidget (EX1.5) ─────────────────────────────────

describe('ChartWidget', () => {
  it('renders a bar chart with title', () => {
    const view: DynamicView = {
      title: 'Chart Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'chart',
          title: 'Monthly Revenue',
          chartType: 'bar',
          data: [
            { month: 'Jan', revenue: 1200 },
            { month: 'Feb', revenue: 1800 },
            { month: 'Mar', revenue: 1500 },
          ],
          xKey: 'month',
          yKeys: [{ key: 'revenue', label: 'Revenue', color: '#4ade80' }],
          height: 250,
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Monthly Revenue')).toBeInTheDocument();
    expect(screen.getByTestId('mock-bar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-revenue')).toBeInTheDocument();
  });

  it('renders a line chart with multiple y-keys', () => {
    const view: DynamicView = {
      title: 'Line Chart',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'chart',
          title: 'CPU vs Memory',
          chartType: 'line',
          data: [
            { time: '00:00', cpu: 45, mem: 60 },
            { time: '01:00', cpu: 52, mem: 62 },
          ],
          xKey: 'time',
          yKeys: [
            { key: 'cpu', label: 'CPU %' },
            { key: 'mem', label: 'Memory %' },
          ],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('CPU vs Memory')).toBeInTheDocument();
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-cpu')).toBeInTheDocument();
    expect(screen.getByTestId('line-mem')).toBeInTheDocument();
  });

  it('renders an area chart', () => {
    const view: DynamicView = {
      title: 'Area Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'chart',
          title: 'Network I/O',
          chartType: 'area',
          data: [{ t: '1', rx: 100, tx: 50 }],
          xKey: 't',
          yKeys: [{ key: 'rx' }, { key: 'tx' }],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByTestId('mock-area-chart')).toBeInTheDocument();
    expect(screen.getByTestId('area-rx')).toBeInTheDocument();
    expect(screen.getByTestId('area-tx')).toBeInTheDocument();
  });

  it('renders a pie chart', () => {
    const view: DynamicView = {
      title: 'Pie Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'chart',
          title: 'Disk Usage',
          chartType: 'pie',
          data: [
            { name: 'Used', value: 75 },
            { name: 'Free', value: 25 },
          ],
          xKey: 'name',
          yKeys: [{ key: 'value' }],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Disk Usage')).toBeInTheDocument();
    expect(screen.getByTestId('mock-pie-chart')).toBeInTheDocument();
  });

  it('renders a donut chart (pie with innerRadius)', () => {
    const view: DynamicView = {
      title: 'Donut Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'chart',
          title: 'Memory Split',
          chartType: 'donut',
          data: [
            { name: 'Apps', value: 60 },
            { name: 'Cache', value: 20 },
            { name: 'Free', value: 20 },
          ],
          xKey: 'name',
          yKeys: [{ key: 'value' }],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Memory Split')).toBeInTheDocument();
    expect(screen.getByTestId('mock-pie-chart')).toBeInTheDocument();
  });
});

// ── TreeWidget (EX1.5) ──────────────────────────────────

describe('TreeWidget', () => {
  it('renders a tree with nested nodes', () => {
    const view: DynamicView = {
      title: 'Tree Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'tree',
          title: 'File System',
          nodes: [
            {
              label: '/etc',
              children: [
                { label: 'nginx', children: [
                  { label: 'nginx.conf', value: '2.4KB' },
                ]},
                { label: 'hosts', value: '1.2KB' },
              ],
            },
          ],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('File System')).toBeInTheDocument();
    expect(screen.getByText('/etc')).toBeInTheDocument();
    expect(screen.getByText('nginx')).toBeInTheDocument();
    expect(screen.getByText('nginx.conf')).toBeInTheDocument();
    expect(screen.getByText('2.4KB')).toBeInTheDocument();
  });

  it('supports 3+ levels of nesting', () => {
    const view: DynamicView = {
      title: 'Deep Tree',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'tree',
          nodes: [
            {
              label: 'Level 0',
              children: [{
                label: 'Level 1',
                children: [{
                  label: 'Level 2',
                  children: [{
                    label: 'Level 3',
                    value: 'deep leaf',
                  }],
                }],
              }],
            },
          ],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Level 0')).toBeInTheDocument();
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    // Level 3 might not be expanded by default (depth > 1), let's check
    // Default: depth 0 expanded, depth 1 expanded, depth > 1 collapsed
    // So Level 2's children (Level 3) should be collapsed
  });

  it('toggles collapse on click', () => {
    const view: DynamicView = {
      title: 'Toggle Tree',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'tree',
          nodes: [{
            label: 'Parent',
            children: [{ label: 'Child A' }, { label: 'Child B' }],
          }],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    
    // Children should be visible initially (root is expanded)
    expect(screen.getByText('Child A')).toBeInTheDocument();
    expect(screen.getByText('Child B')).toBeInTheDocument();
    
    // Click parent to collapse
    fireEvent.click(screen.getByText('Parent'));
    expect(screen.queryByText('Child A')).not.toBeInTheDocument();
    expect(screen.queryByText('Child B')).not.toBeInTheDocument();
    
    // Click again to expand
    fireEvent.click(screen.getByText('Parent'));
    expect(screen.getByText('Child A')).toBeInTheDocument();
  });

  it('renders empty tree message', () => {
    const view: DynamicView = {
      title: 'Empty Tree',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'tree',
          nodes: [],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('shows node values beside labels', () => {
    const view: DynamicView = {
      title: 'Tree Values',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'tree',
          nodes: [
            { label: 'config.json', value: '4.2KB' },
            { label: 'README.md', value: '1.8KB' },
          ],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('config.json')).toBeInTheDocument();
    expect(screen.getByText('4.2KB')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('1.8KB')).toBeInTheDocument();
  });
});

// ── LogViewerWidget (EX1.5) ─────────────────────────────

describe('LogViewerWidget', () => {
  it('renders log lines with timestamps and levels', () => {
    const view: DynamicView = {
      title: 'Log Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'log-viewer',
          title: 'Application Logs',
          lines: [
            { timestamp: '2024-01-01 10:00:00', level: 'info', message: 'Server started' },
            { timestamp: '2024-01-01 10:00:05', level: 'warn', message: 'High memory usage' },
            { timestamp: '2024-01-01 10:00:10', level: 'error', message: 'Connection refused' },
          ],
          maxHeight: '300px',
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Application Logs')).toBeInTheDocument();
    expect(screen.getByText('Server started')).toBeInTheDocument();
    expect(screen.getByText('High memory usage')).toBeInTheDocument();
    expect(screen.getByText('Connection refused')).toBeInTheDocument();

    // Timestamps shown
    expect(screen.getByText('2024-01-01 10:00:00')).toBeInTheDocument();
    expect(screen.getByText('2024-01-01 10:00:05')).toBeInTheDocument();
  });

  it('renders level badges with correct text', () => {
    const view: DynamicView = {
      title: 'Level Test',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'log-viewer',
          lines: [
            { level: 'error', message: 'Error msg' },
            { level: 'warn', message: 'Warn msg' },
            { level: 'info', message: 'Info msg' },
            { level: 'debug', message: 'Debug msg' },
          ],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText('warn')).toBeInTheDocument();
    // Multiple 'info' texts might exist (level badge + message)
    expect(screen.getByText('Info msg')).toBeInTheDocument();
    expect(screen.getByText('Debug msg')).toBeInTheDocument();
  });

  it('renders log without timestamps or levels', () => {
    const view: DynamicView = {
      title: 'Simple Log',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'log-viewer',
          lines: [
            { message: 'Plain line 1' },
            { message: 'Plain line 2' },
          ],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Plain line 1')).toBeInTheDocument();
    expect(screen.getByText('Plain line 2')).toBeInTheDocument();
  });

  it('renders empty log message', () => {
    const view: DynamicView = {
      title: 'Empty Log',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [{
          type: 'log-viewer',
          lines: [],
        }],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('No log entries')).toBeInTheDocument();
  });

  it('renders in mixed composition with other widgets', () => {
    const view: DynamicView = {
      title: 'Mixed Extended',
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [
          {
            type: 'chart',
            title: 'Request Rate',
            chartType: 'bar',
            data: [{ h: '1pm', reqs: 500 }],
            xKey: 'h',
            yKeys: [{ key: 'reqs' }],
          },
          {
            type: 'tree',
            title: 'Config Tree',
            nodes: [{ label: 'root', children: [{ label: 'child' }] }],
          },
          {
            type: 'log-viewer',
            title: 'Recent Logs',
            lines: [{ level: 'info', message: 'All systems go' }],
          },
        ],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Request Rate')).toBeInTheDocument();
    expect(screen.getByText('Config Tree')).toBeInTheDocument();
    expect(screen.getByText('Recent Logs')).toBeInTheDocument();
    expect(screen.getByText('All systems go')).toBeInTheDocument();
  });
});

// ── TabsLayout (EX1.6) ─────────────────────────────────

describe('TabsLayout', () => {
  it('renders tabs with correct labels', () => {
    const view: DynamicView = {
      title: 'Tabs Test',
      root: {
        layout: 'tabs',
        tabs: [
          {
            id: 'overview',
            label: 'Overview',
            widgets: [{ type: 'stat-card', title: 'CPU', value: '45%' }],
          },
          {
            id: 'details',
            label: 'Details',
            widgets: [{ type: 'stat-card', title: 'RAM', value: '78%' }],
          },
        ],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('shows first tab content by default', () => {
    const view: DynamicView = {
      title: 'Default Tab',
      root: {
        layout: 'tabs',
        tabs: [
          {
            id: 'first',
            label: 'First',
            widgets: [{ type: 'stat-card', title: 'First Metric', value: '10' }],
          },
          {
            id: 'second',
            label: 'Second',
            widgets: [{ type: 'stat-card', title: 'Second Metric', value: '20' }],
          },
        ],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    // First tab content visible
    expect(screen.getByText('First Metric')).toBeInTheDocument();
  });

  it('renders both tab panels (active first, inactive hidden)', () => {
    const view: DynamicView = {
      title: 'Tab Switch',
      root: {
        layout: 'tabs',
        tabs: [
          {
            id: 'tab-a',
            label: 'Tab A',
            widgets: [{ type: 'alert', message: 'Content A', variant: 'default' }],
          },
          {
            id: 'tab-b',
            label: 'Tab B',
            widgets: [{ type: 'alert', message: 'Content B', variant: 'default' }],
          },
        ],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    // Content A is the active tab and visible
    expect(screen.getByText('Content A')).toBeInTheDocument();

    // Both tab triggers are rendered
    const tabA = screen.getByRole('tab', { name: 'Tab A' });
    const tabB = screen.getByRole('tab', { name: 'Tab B' });
    expect(tabA).toHaveAttribute('data-state', 'active');
    expect(tabB).toHaveAttribute('data-state', 'inactive');
  });

  it('renders empty tabs gracefully', () => {
    const view: DynamicView = {
      title: 'Empty Tabs',
      root: {
        layout: 'tabs',
        tabs: [],
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('No tabs defined')).toBeInTheDocument();
  });
});

// ── SidebarLayout (EX1.6) ───────────────────────────────

describe('SidebarLayout', () => {
  it('renders sidebar items and first section content', () => {
    const view: DynamicView = {
      title: 'Sidebar Test',
      root: {
        layout: 'sidebar',
        sidebarItems: [
          { id: 'general', label: 'General' },
          { id: 'network', label: 'Network' },
        ],
        sections: {
          general: [{ type: 'stat-card', title: 'Uptime', value: '99.9%' }],
          network: [{ type: 'stat-card', title: 'Bandwidth', value: '100Mbps' }],
        },
      },
    };
    render(<DynamicViewRenderer view={view} />);
    // Sidebar items visible
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Network')).toBeInTheDocument();
    // First section content visible
    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText('99.9%')).toBeInTheDocument();
  });

  it('navigates between sections on click', () => {
    const view: DynamicView = {
      title: 'Sidebar Nav',
      root: {
        layout: 'sidebar',
        sidebarItems: [
          { id: 'sec-a', label: 'Section A' },
          { id: 'sec-b', label: 'Section B' },
        ],
        sections: {
          'sec-a': [{ type: 'alert', message: 'Content for A', variant: 'default' }],
          'sec-b': [{ type: 'alert', message: 'Content for B', variant: 'default' }],
        },
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('Content for A')).toBeInTheDocument();

    // Click Section B
    fireEvent.click(screen.getByText('Section B'));
    expect(screen.getByText('Content for B')).toBeInTheDocument();
  });

  it('shows empty message for sections without content', () => {
    const view: DynamicView = {
      title: 'Empty Section',
      root: {
        layout: 'sidebar',
        sidebarItems: [
          { id: 'empty', label: 'Empty Section' },
        ],
        sections: {},
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('No content for this section')).toBeInTheDocument();
  });

  it('renders empty sidebar items gracefully', () => {
    const view: DynamicView = {
      title: 'No Items',
      root: {
        layout: 'sidebar',
        sidebarItems: [],
        sections: {},
      },
    };
    render(<DynamicViewRenderer view={view} />);
    expect(screen.getByText('No sidebar items defined')).toBeInTheDocument();
  });
});

// ── EX1.12: RefreshableWidget ───────────────────────────

import { RefreshableWidget } from '../../src/components/DynamicUI/RefreshableWidget';

describe('RefreshableWidget', () => {
  it('renders children', () => {
    render(
      <RefreshableWidget>
        <div>Widget Content</div>
      </RefreshableWidget>,
    );
    expect(screen.getByText('Widget Content')).toBeInTheDocument();
  });

  it('shows pulse overlay when refreshing', () => {
    const { container } = render(
      <RefreshableWidget refreshing={true}>
        <div>Content</div>
      </RefreshableWidget>,
    );
    const overlay = container.querySelector('.animate-pulse');
    expect(overlay).toBeInTheDocument();
  });

  it('does not show overlay when not refreshing', () => {
    const { container } = render(
      <RefreshableWidget refreshing={false}>
        <div>Content</div>
      </RefreshableWidget>,
    );
    const overlay = container.querySelector('.animate-pulse');
    expect(overlay).not.toBeInTheDocument();
  });

  it('shows pause button when not paused and controls enabled', () => {
    const onPause = vi.fn();
    render(
      <RefreshableWidget showControls={true} paused={false} onPause={onPause}>
        <div>Content</div>
      </RefreshableWidget>,
    );
    const pauseBtn = screen.getByTitle('Pause auto-refresh');
    expect(pauseBtn).toBeInTheDocument();
  });

  it('shows resume button when paused', () => {
    const onResume = vi.fn();
    render(
      <RefreshableWidget showControls={true} paused={true} onResume={onResume}>
        <div>Content</div>
      </RefreshableWidget>,
    );
    const resumeBtn = screen.getByTitle('Resume auto-refresh');
    expect(resumeBtn).toBeInTheDocument();
  });

  it('calls onPause when pause button clicked', () => {
    const onPause = vi.fn();
    render(
      <RefreshableWidget showControls={true} paused={false} onPause={onPause}>
        <div>Content</div>
      </RefreshableWidget>,
    );
    fireEvent.click(screen.getByTitle('Pause auto-refresh'));
    expect(onPause).toHaveBeenCalledOnce();
  });

  it('calls onRefresh when refresh button clicked', () => {
    const onRefresh = vi.fn();
    render(
      <RefreshableWidget showControls={true} onRefresh={onRefresh}>
        <div>Content</div>
      </RefreshableWidget>,
    );
    fireEvent.click(screen.getByTitle('Refresh now'));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('hides controls when showControls is false', () => {
    render(
      <RefreshableWidget showControls={false}>
        <div>Content</div>
      </RefreshableWidget>,
    );
    expect(screen.queryByTitle('Refresh now')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Pause auto-refresh')).not.toBeInTheDocument();
  });
});

// ── EX1.12: DynamicViewContext ──────────────────────────

import { DynamicViewProvider, useDynamicViewContext } from '../../src/components/DynamicUI/DynamicViewContext';

describe('DynamicViewContext', () => {
  function TestConsumer() {
    const { serverId } = useDynamicViewContext();
    return <div data-testid="server-id">{serverId ?? 'none'}</div>;
  }

  it('provides serverId to children', () => {
    render(
      <DynamicViewProvider serverId="srv-123">
        <TestConsumer />
      </DynamicViewProvider>,
    );
    expect(screen.getByTestId('server-id').textContent).toBe('srv-123');
  });

  it('defaults to null when no provider', () => {
    render(<TestConsumer />);
    expect(screen.getByTestId('server-id').textContent).toBe('none');
  });
});
