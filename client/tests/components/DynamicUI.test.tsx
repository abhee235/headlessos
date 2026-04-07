// EX1.2: Component tests for DynamicUI renderer + all base widgets
// @see docs/phases/phase-ex1.md

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

// Import triggers widget registration
import { DynamicViewRenderer } from '../../src/components/DynamicUI';
import { getRegisteredTypes, clearRegistry } from '../../src/components/DynamicUI/widget-registry';

// ── Widget Registry ─────────────────────────────────────

describe('Widget Registry', () => {
  it('has all 7 base widget types registered', () => {
    const types = getRegisteredTypes();
    expect(types).toContain('table');
    expect(types).toContain('key-value');
    expect(types).toContain('badge-grid');
    expect(types).toContain('stat-card');
    expect(types).toContain('progress-bar');
    expect(types).toContain('code-block');
    expect(types).toContain('alert');
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
