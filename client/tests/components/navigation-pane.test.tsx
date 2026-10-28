// EX8.30: File Explorer favourites follow the signed-in user's home
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const fetchHomeDir = vi.hoisted(() => vi.fn());
const fetchFiles = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, fetchHomeDir, fetchFiles };
});

import { NavigationPane, favouritesFor, useHomeFolders } from '../../src/components/FileExplorer/NavigationPane';

const dir = (name: string) => ({ name, type: 'directory', size: 4096, modified: '', permissions: 'drwxr-xr-x', owner: 'deploy', group: 'deploy' });
const file = (name: string) => ({ ...dir(name), type: 'file' });

function Pane({ serverId, onNavigate }: { serverId: string; onNavigate: (p: string) => void }) {
  const homeFolders = useHomeFolders(serverId);
  return <NavigationPane currentPath="/" onNavigate={onNavigate} homeFolders={homeFolders} />;
}

const favouriteLabels = () => {
  const group = screen.getByText('Favorites').closest('div')!.parentElement!;
  return [...group.querySelectorAll('button')].map((b) => b.textContent?.trim());
};

beforeEach(() => {
  fetchHomeDir.mockReset();
  fetchFiles.mockReset();
});

describe('favouritesFor', () => {
  it('has only the favourites that need no home while it is unknown', () => {
    expect(favouritesFor(null).map((f) => f.label)).toEqual(['Recents', 'Recycle Bin']);
  });

  it('points Home at the real home and shows only the shortcuts that exist there', () => {
    const favs = favouritesFor({ home: '/root', folders: ['Documents', 'projects'] });
    expect(favs.map((f) => [f.label, f.path])).toEqual([
      ['Home', '/root'],
      ['Documents', '/root/Documents'],
      ['Recents', '/tmp'],
      ['Recycle Bin', '__trash__'],
    ]);
  });

  it('never points at the old dev-container user', () => {
    const favs = favouritesFor({ home: '/home/deploy', folders: ['Desktop', 'Documents', 'Downloads'] });
    expect(favs.every((f) => !f.path.includes('testuser'))).toBe(true);
    expect(favs.slice(0, 4).map((f) => f.path)).toEqual(['/home/deploy', '/home/deploy/Desktop', '/home/deploy/Documents', '/home/deploy/Downloads']);
  });
});

describe('NavigationPane with the server\'s home', () => {
  it('asks the server for the home folder, lists it, and opens it from Home', async () => {
    fetchHomeDir.mockResolvedValue('/home/deploy');
    fetchFiles.mockResolvedValue([dir('Documents'), dir('Downloads'), dir('projects'), file('notes.txt')]);
    const onNavigate = vi.fn();
    await act(async () => { render(<Pane serverId="s1" onNavigate={onNavigate} />); });

    expect(fetchHomeDir).toHaveBeenCalledWith('s1');
    expect(fetchFiles).toHaveBeenCalledWith('s1', '/home/deploy');
    expect(favouriteLabels()).toEqual(['Home', 'Documents', 'Downloads', 'Recents', 'Recycle Bin']);

    fireEvent.click(screen.getByRole('button', { name: 'Home', exact: true }));
    expect(onNavigate).toHaveBeenCalledWith('/home/deploy');
    fireEvent.click(screen.getByRole('button', { name: 'Documents', exact: true }));
    expect(onNavigate).toHaveBeenLastCalledWith('/home/deploy/Documents');
  });

  it('keeps Recents and Recycle Bin when the home lookup fails', async () => {
    fetchHomeDir.mockRejectedValue(new Error('Server "s1" is not connected'));
    await act(async () => { render(<Pane serverId="s1" onNavigate={vi.fn()} />); });
    expect(favouriteLabels()).toEqual(['Recents', 'Recycle Bin']);
    expect(fetchFiles).not.toHaveBeenCalled();
  });

  it('still offers Home when the home folder cannot be listed', async () => {
    fetchHomeDir.mockResolvedValue('/srv/app');
    fetchFiles.mockRejectedValue(new Error('Permission denied'));
    await act(async () => { render(<Pane serverId="s1" onNavigate={vi.fn()} />); });
    expect(favouriteLabels()).toEqual(['Home', 'Recents', 'Recycle Bin']);
  });
});
