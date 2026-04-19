// EX5-C.2: Save As App Dialog — Tests
// @see docs/phases/phase-ex5.md — EX5-C.2

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveAsAppDialog } from '@/components/DynamicUI/SaveAsAppDialog';
import * as api from '@/lib/api';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

// ── Mock toast ──

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Test fixture ──

function makeDummyView(): DynamicView {
  return {
    title: 'Docker Dashboard',
    description: 'Monitor running Docker containers',
    icon: 'Container',
    sidebarItems: [{ id: 'main', label: 'Main' }],
    sections: {
      main: {
        layout: 'stack' as const,
        children: [
          { type: 'stat-card' as const, title: 'Containers', value: '5' },
        ],
      },
    },
    meta: {
      tool: 'docker',
      command: 'docker ps',
      generatedAt: new Date().toISOString(),
      templateId: null,
    },
  };
}

describe('SaveAsAppDialog (EX5-C.2)', () => {
  let mockCreateSavedApp: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSavedApp = vi.spyOn(api, 'createSavedApp').mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Docker Dashboard',
      icon: 'Container',
      cliTool: 'docker',
      description: 'Monitor running Docker containers',
      tags: ['docker'],
      view: makeDummyView() as unknown as Record<string, unknown>,
      commandPatterns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders the dialog when open', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
        />,
      );
      expect(screen.getByTestId('save-as-app-dialog')).toBeInTheDocument();
      expect(screen.getByText('Save as App')).toBeInTheDocument();
    });

    it('does not render content when closed', () => {
      render(
        <SaveAsAppDialog
          open={false}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
        />,
      );
      expect(screen.queryByTestId('save-as-app-dialog')).not.toBeInTheDocument();
    });

    it('renders all form fields', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
        />,
      );
      expect(screen.getByTestId('app-name-input')).toBeInTheDocument();
      expect(screen.getByTestId('icon-picker-trigger')).toBeInTheDocument();
      expect(screen.getByTestId('app-cli-tool-input')).toBeInTheDocument();
      expect(screen.getByTestId('app-description-input')).toBeInTheDocument();
      expect(screen.getByTestId('app-tags-input')).toBeInTheDocument();
    });
  });

  describe('pre-fill', () => {
    it('pre-fills name from view title', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
          defaultName="Docker Dashboard"
        />,
      );
      const input = screen.getByTestId('app-name-input') as HTMLInputElement;
      expect(input.value).toBe('Docker Dashboard');
    });

    it('pre-fills CLI tool from prop', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
          defaultCliTool="docker"
        />,
      );
      const input = screen.getByTestId('app-cli-tool-input') as HTMLInputElement;
      expect(input.value).toBe('docker');
    });

    it('pre-fills description from view description', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
          defaultDescription="Monitor running Docker containers"
        />,
      );
      const input = screen.getByTestId('app-description-input') as HTMLTextAreaElement;
      expect(input.value).toBe('Monitor running Docker containers');
    });

    it('pre-fills tags', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
          defaultTags={['docker', 'monitoring']}
        />,
      );
      const input = screen.getByTestId('app-tags-input') as HTMLInputElement;
      expect(input.value).toBe('docker, monitoring');
    });
  });

  describe('icon picker', () => {
    it('shows icon picker grid when trigger is clicked', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
        />,
      );
      // Icon grid should not be visible initially
      expect(screen.queryByTestId('icon-picker-grid')).not.toBeInTheDocument();
      // Click the icon picker trigger
      fireEvent.click(screen.getByTestId('icon-picker-trigger'));
      expect(screen.getByTestId('icon-picker-grid')).toBeInTheDocument();
    });

    it('selects a different icon from the grid', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
          defaultIcon="Package"
        />,
      );
      // Open icon picker
      fireEvent.click(screen.getByTestId('icon-picker-trigger'));
      // Select the Database icon
      fireEvent.click(screen.getByTestId('icon-option-Database'));
      // The icon picker should have closed and the label should update
      expect(screen.queryByTestId('icon-picker-grid')).not.toBeInTheDocument();
      expect(screen.getByText('Database')).toBeInTheDocument();
    });
  });

  describe('save action', () => {
    it('calls createSavedApp with correct data on save', async () => {
      const onSaved = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={onOpenChange}
          view={makeDummyView()}
          defaultName="Docker Dashboard"
          defaultCliTool="docker"
          defaultIcon="Container"
          defaultTags={['docker']}
          serverId="server-1"
          onSaved={onSaved}
        />,
      );

      fireEvent.click(screen.getByTestId('save-app-button'));

      await waitFor(() => {
        expect(mockCreateSavedApp).toHaveBeenCalledTimes(1);
      });

      const call = mockCreateSavedApp.mock.calls[0][0] as api.CreateAppInput;
      expect(call.name).toBe('Docker Dashboard');
      expect(call.icon).toBe('Container');
      expect(call.cliTool).toBe('docker');
      expect(call.tags).toEqual(['docker']);
      expect(call.serverId).toBe('server-1');
    });

    it('shows success toast and calls onSaved after saving', async () => {
      const { toast } = await import('sonner');
      const onSaved = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={onOpenChange}
          view={makeDummyView()}
          defaultName="My App"
          defaultCliTool="systemctl"
          defaultIcon="Power"
          onSaved={onSaved}
        />,
      );

      fireEvent.click(screen.getByTestId('save-app-button'));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'App saved! You can find it in the Start Menu.',
        );
      });
      expect(onSaved).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('shows error toast when save fails', async () => {
      const { toast } = await import('sonner');
      vi.spyOn(api, 'createSavedApp').mockRejectedValueOnce(new Error('Network error'));

      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
          defaultName="Test"
          defaultCliTool="test"
          defaultIcon="Package"
        />,
      );

      fireEvent.click(screen.getByTestId('save-app-button'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Network error');
      });
    });
  });

  describe('validation', () => {
    it('disables save button when name is empty', () => {
      const emptyTitleView = { ...makeDummyView(), title: '' };
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={emptyTitleView}
          defaultName=""
          defaultCliTool="docker"
          defaultIcon="Package"
        />,
      );
      const btn = screen.getByTestId('save-app-button');
      expect(btn).toBeDisabled();
    });

    it('disables save button when CLI tool is empty', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
          defaultName="My App"
          defaultCliTool=""
          defaultIcon="Package"
        />,
      );
      const btn = screen.getByTestId('save-app-button');
      expect(btn).toBeDisabled();
    });

    it('enables save button when all required fields are filled', () => {
      render(
        <SaveAsAppDialog
          open={true}
          onOpenChange={vi.fn()}
          view={makeDummyView()}
          defaultName="My App"
          defaultCliTool="docker"
          defaultIcon="Package"
        />,
      );
      const btn = screen.getByTestId('save-app-button');
      expect(btn).not.toBeDisabled();
    });
  });
});
