// EX8.1: Keeps the <html> appearance attributes (accent, glass, transparency,
// wallpaper tone) in sync with preferences and the effective wallpaper.
// Mounted once in App so it runs on every screen, lock screen included.
// @see docs/phases/phase-ex8.md

import { useEffect } from 'react';
import { usePreferencesStore } from '../store/preferences-store';
import { useEffectivePref } from '../store/effective-preferences';
import { applyLumenAppearance, isDarkWallpaper, resolveAccent } from '../lib/lumen-theme';

export function useLumenAppearance(): void {
  const accentColorIndex = useEffectivePref('accentColorIndex');
  const wallpaperId = useEffectivePref('wallpaperId');
  const glass = usePreferencesStore((s) => s.glassStrength);
  const transparency = usePreferencesStore((s) => s.transparency);

  useEffect(() => {
    applyLumenAppearance(document.documentElement, {
      accent: resolveAccent(accentColorIndex, wallpaperId),
      glass,
      transparency,
      darkWallpaper: isDarkWallpaper(wallpaperId),
    });
  }, [accentColorIndex, wallpaperId, glass, transparency]);
}
