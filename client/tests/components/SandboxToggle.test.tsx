// EX5-B.4: Frontend Sandbox Toggle — Tests
// @see docs/phases/phase-ex5.md — EX5-B.4

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { UIAgentView } from '@/components/Agent/UIAgentView';
import * as api from '@/lib/api';
import { TooltipProvider } from '@/components/ui/tooltip';

// ── Mock hooks & APIs ──

const mockGenerate = vi.fn().mockReturnValue('req-123');
const mockAbort = vi.fn();

vi.mock('@/hooks/useUIAgent', () => ({
  useUIAgent: () => ({
    generate: mockGenerate,
    abort: mockAbort,
    writeBack: vi.fn(),
    connected: true,
  }),
}));

vi.mock('@/store/agent-store', () => ({
  useAgentStore: () => new Map(),
}));

// We don't need real DynamicUI window opening
vi.mock('@/components/DynamicUI', () => ({
  openDynamicUIWindow: vi.fn(),
}));

// Mock DynamicViewSchema
vi.mock('headlessos-shared/schemas/dynamic-view', () => ({
  DynamicViewSchema: { safeParse: vi.fn().mockReturnValue({ success: false }) },
}));

// Wrap with TooltipProvider
function renderWithProvider(serverId = 'server-1') {
  return render(
    <TooltipProvider>
      <UIAgentView serverId={serverId} />
    </TooltipProvider>,
  );
}

describe('UIAgentView — Sandbox Toggle (EX5-B.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Docker is available
    vi.spyOn(api, 'checkDockerAvailable').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders the sandbox toggle row', async () => {
      renderWithProvider();
      await waitFor(() => {
        expect(screen.getByTestId('sandbox-toggle-row')).toBeInTheDocument();
      });
    });

    it('renders the sandbox switch', async () => {
      renderWithProvider();
      await waitFor(() => {
        expect(screen.getByTestId('sandbox-switch')).toBeInTheDocument();
      });
    });

    it('shows "Sandbox Mode" label', async () => {
      renderWithProvider();
      await waitFor(() => {
        expect(screen.getByText('Sandbox Mode')).toBeInTheDocument();
      });
    });

    it('switch is unchecked by default', async () => {
      renderWithProvider();
      await waitFor(() => {
        const switchEl = screen.getByTestId('sandbox-switch');
        // Radix Switch uses aria-checked
        expect(switchEl).toHaveAttribute('aria-checked', 'false');
      });
    });
  });

  describe('Docker availability', () => {
    it('checks Docker availability on mount', async () => {
      renderWithProvider();
      await waitFor(() => {
        expect(api.checkDockerAvailable).toHaveBeenCalledWith('server-1');
      });
    });

    it('disables the switch when Docker is not available', async () => {
      vi.spyOn(api, 'checkDockerAvailable').mockResolvedValue(false);
      renderWithProvider();
      await waitFor(() => {
        const switchEl = screen.getByTestId('sandbox-switch');
        expect(switchEl).toBeDisabled();
      });
    });

    it('enables the switch when Docker is available', async () => {
      vi.spyOn(api, 'checkDockerAvailable').mockResolvedValue(true);
      renderWithProvider();
      await waitFor(() => {
        const switchEl = screen.getByTestId('sandbox-switch');
        expect(switchEl).not.toBeDisabled();
      });
    });
  });

  describe('toggle interaction', () => {
    it('can be toggled on', async () => {
      renderWithProvider();
      await waitFor(() => {
        expect(screen.getByTestId('sandbox-switch')).not.toBeDisabled();
      });
      const switchEl = screen.getByTestId('sandbox-switch');
      fireEvent.click(switchEl);
      expect(switchEl).toHaveAttribute('aria-checked', 'true');
    });

    it('can be toggled off after being toggled on', async () => {
      renderWithProvider();
      await waitFor(() => {
        expect(screen.getByTestId('sandbox-switch')).not.toBeDisabled();
      });
      const switchEl = screen.getByTestId('sandbox-switch');
      fireEvent.click(switchEl); // on
      expect(switchEl).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(switchEl); // off
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('generate with sandbox options', () => {
    it('sends sandboxMode: true when toggle is on', async () => {
      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('sandbox-switch')).not.toBeDisabled();
      });

      // Enable sandbox
      fireEvent.click(screen.getByTestId('sandbox-switch'));

      // Type a prompt and submit
      const textarea = screen.getByPlaceholderText(/Describe the UI/);
      fireEvent.change(textarea, { target: { value: 'Build UI for nginx' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(mockGenerate).toHaveBeenCalledWith(
        'Build UI for nginx',
        expect.objectContaining({ sandboxMode: true }),
      );
    });

    it('does not send sandboxMode when toggle is off', async () => {
      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('sandbox-switch')).not.toBeDisabled();
      });

      // Leave sandbox off — type a prompt and submit
      const textarea = screen.getByPlaceholderText(/Describe the UI/);
      fireEvent.change(textarea, { target: { value: 'Show disk usage' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(mockGenerate).toHaveBeenCalledWith(
        'Show disk usage',
        expect.objectContaining({ sandboxMode: undefined }),
      );
    });

    it('does not send sandboxMode when Docker is unavailable even if toggled', async () => {
      vi.spyOn(api, 'checkDockerAvailable').mockResolvedValue(false);
      renderWithProvider();

      await waitFor(() => {
        const switchEl = screen.getByTestId('sandbox-switch');
        expect(switchEl).toBeDisabled();
      });

      // Attempt to type and submit
      const textarea = screen.getByPlaceholderText(/Describe the UI/);
      fireEvent.change(textarea, { target: { value: 'Build UI for nginx' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(mockGenerate).toHaveBeenCalledWith(
        'Build UI for nginx',
        expect.objectContaining({ sandboxMode: undefined }),
      );
    });
  });
});
