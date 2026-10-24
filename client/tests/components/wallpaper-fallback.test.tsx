// M13.1: a saved wallpaper that is no longer on the server falls back to the default
// @see docs/phases/phase-13.md
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const pref = vi.hoisted(() => ({ wallpaperId: 'system:macos-big-sur.jpg' }));
vi.mock('../../src/store/effective-preferences', () => ({
  useEffectivePref: (key: string) => (key === 'wallpaperId' ? pref.wallpaperId : undefined),
}));
vi.mock('../../src/components/Desktop/wallpapers', async (orig) => {
  const actual = await orig<typeof import('../../src/components/Desktop/wallpapers')>();
  return {
    ...actual,
    fetchWallpapers: vi.fn(async () => ({
      system: [
        { id: 'system:dusk.jpg', name: 'Dusk', filename: 'dusk.jpg', category: 'system', url: 'http://srv/api/wallpapers/system/dusk.jpg', type: 'image' },
        { id: 'system:alpine.jpg', name: 'Alpine', filename: 'alpine.jpg', category: 'system', url: 'http://srv/api/wallpapers/system/alpine.jpg', type: 'image' },
      ],
      user: [],
    })),
  };
});

import { Wallpaper } from '../../src/components/Desktop/Wallpaper';

describe('Wallpaper fallback (M13.1)', () => {
  beforeEach(() => {
    pref.wallpaperId = 'system:macos-big-sur.jpg';
  });

  it('shows the default once the list says the saved image is gone', async () => {
    render(<Wallpaper />);
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'http://srv/api/wallpapers/system/dusk.jpg'));
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Dusk');
  });

  it('keeps a saved image that is still there', async () => {
    pref.wallpaperId = 'system:alpine.jpg';
    render(<Wallpaper />);
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'http://srv/api/wallpapers/system/alpine.jpg'));
  });
});
