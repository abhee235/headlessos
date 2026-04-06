// Component tests for Desktop — rendering and create logic
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Desktop } from '../../src/components/Desktop/Desktop';

// Mock the stores
const mockOpenWindow = vi.fn();
const mockCloseStartMenu = vi.fn();
let mockActiveServerId: string | null = 'server-1';
let mockServers: Array<{ id: string; state: { status: string } | null }> = [];

vi.mock('../../src/store/window-store', () => ({
  useDesktopStore: (selector: (state: unknown) => unknown) =>
    selector({
      openWindow: mockOpenWindow,
      closeStartMenu: mockCloseStartMenu,
    }),
}));

vi.mock('../../src/store/app-store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeServerId: mockActiveServerId,
      servers: mockServers,
    }),
}));

// Mock the API
const mockCreateDirectory = vi.fn();
const mockWriteFile = vi.fn();
vi.mock('../../src/lib/api', () => ({
  createDirectory: (...args: unknown[]) => mockCreateDirectory(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// Mock Wallpaper to simplify rendering
vi.mock('../../src/components/Desktop/Wallpaper', () => ({
  Wallpaper: () => <div data-testid="wallpaper" />,
  WallpaperPreview: ({ wallpaper }: { wallpaper: { id: string } }) => (
    <div data-testid={`wallpaper-preview-${wallpaper?.id ?? 'unknown'}`} />
  ),
  WallpaperPreviewById: ({ wallpaperId }: { wallpaperId: string }) => (
    <div data-testid={`wallpaper-preview-${wallpaperId}`} />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockActiveServerId = 'server-1';
  mockServers = [
    { id: 'server-1', state: { status: 'connected' } },
  ];
  mockCreateDirectory.mockResolvedValue({ success: true });
  mockWriteFile.mockResolvedValue({ success: true });
});

describe('Desktop rendering', () => {
  it('renders desktop icons when connected', () => {
    render(<Desktop />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('File Explorer')).toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
  });

  it('shows "This PC" and connect prompt when disconnected', () => {
    mockServers = [{ id: 'server-1', state: { status: 'disconnected' } }];

    render(<Desktop />);

    expect(screen.getByText('This PC')).toBeInTheDocument();
    expect(screen.getByText('Connect a server to get started')).toBeInTheDocument();
  });

  it('disables desktop icons when disconnected', () => {
    mockServers = [{ id: 'server-1', state: { status: 'disconnected' } }];

    render(<Desktop />);

    const dashboardBtn = screen.getByText('Dashboard').closest('button');
    expect(dashboardBtn).toBeDisabled();
  });

  it('icons are enabled when connected', () => {
    render(<Desktop />);

    const dashboardBtn = screen.getByText('Dashboard').closest('button');
    expect(dashboardBtn).not.toBeDisabled();
  });
});

describe('Desktop — create dialog', () => {
  it('does not show create dialog by default', () => {
    render(<Desktop />);

    expect(screen.queryByPlaceholderText('folder-name')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('filename.txt')).not.toBeInTheDocument();
  });
});

describe('Desktop — double click opens window', () => {
  it('opens window on double click when connected', () => {
    render(<Desktop />);

    const fileExplorerBtn = screen.getByText('File Explorer').closest('button')!;
    fireEvent.doubleClick(fileExplorerBtn);

    expect(mockOpenWindow).toHaveBeenCalledWith(
      'files',
      'server-1',
      'File Explorer',
      'files',
    );
  });

  it('does not open window on double click when disconnected', () => {
    mockServers = [{ id: 'server-1', state: { status: 'disconnected' } }];

    render(<Desktop />);

    const dashboardBtn = screen.getByText('Dashboard').closest('button')!;
    fireEvent.doubleClick(dashboardBtn);

    expect(mockOpenWindow).not.toHaveBeenCalled();
  });
});
