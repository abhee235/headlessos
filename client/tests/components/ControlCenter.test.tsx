// EX6-C: Tests for Control Center shell + Ctrl+Shift+Space shortcut
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ControlCenter } from '../../src/components/ControlCenter/ControlCenter';
import { useAppStore } from '../../src/store/app-store';
import { useSessionsStore } from '../../src/store/sessions-store';
import { useSessionShortcuts } from '../../src/hooks/useSessionShortcuts';

// Mock heavy children so this is a focused unit test
vi.mock('../../src/components/Login/LoginScreen', () => ({
  LoginScreen: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="login-screen" data-embedded={String(embedded)}>
      LoginScreen
    </div>
  ),
}));
vi.mock('../../src/components/Fleet/FleetDashboardView', () => ({
  FleetDashboardView: () => <div data-testid="fleet-view">FleetView</div>,
}));
vi.mock('../../src/components/Desktop/Wallpaper', () => ({
  Wallpaper: () => <div data-testid="wallpaper" />,
}));

beforeEach(() => {
  useAppStore.setState({ activeServerId: null, servers: [] });
  useSessionsStore.setState({ activeServerId: null, sessions: {}, summaries: [] });
});

describe('ControlCenter', () => {
  it('renders Sessions tab by default with embedded LoginScreen', () => {
    render(<ControlCenter />);
    const login = screen.getByTestId('login-screen');
    expect(login).toBeInTheDocument();
    expect(login).toHaveAttribute('data-embedded', 'true');
  });

  it('switches to Fleet tab on click', () => {
    render(<ControlCenter />);
    fireEvent.click(screen.getByTestId('cc-tab-fleet'));
    expect(screen.getByTestId('fleet-view')).toBeInTheDocument();
  });

  it('switches to Global Settings tab on click', () => {
    render(<ControlCenter />);
    fireEvent.click(screen.getByTestId('cc-tab-settings'));
    // Heading + tab both contain "Global Settings"
    expect(screen.getAllByText(/Global Settings/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Defaults applied to all sessions/i)).toBeInTheDocument();
  });

  it('hides close button when no active session', () => {
    render(<ControlCenter />);
    expect(screen.queryByTestId('cc-close')).not.toBeInTheDocument();
  });

  it('shows close button when there is an active session', () => {
    useAppStore.setState({ activeServerId: 'srv-1' });
    render(<ControlCenter />);
    expect(screen.getByTestId('cc-close')).toBeInTheDocument();
  });

  it('close button transitions back to desktop', () => {
    useAppStore.setState({ activeServerId: 'srv-1', screen: 'login' });
    render(<ControlCenter />);
    fireEvent.click(screen.getByTestId('cc-close'));
    expect(useAppStore.getState().screen).toBe('desktop');
  });
});

describe('useSessionShortcuts — Ctrl+Shift+Space', () => {
  it('opens Control Center via goToLogin when Cmd+Shift+Space is pressed', () => {
    useAppStore.setState({ screen: 'desktop', activeServerId: 'srv-1' });
    renderHook(() => useSessionShortcuts());

    const e = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(e);

    expect(useAppStore.getState().screen).toBe('login');
  });
});
