// M6.3: Wallpaper — renders the selected desktop wallpaper from preferences
// Supports both CSS gradient (builtin) and image-based (system/user) wallpapers
// EX6-D.3: Now respects per-session `wallpaperId` override via `useEffectivePref`.
// M13.1: a saved image wallpaper that is no longer on the server falls back to the default.
// @see docs/phases/phase-6.md
// @see docs/phases/phase-ex6.md
// @see docs/phases/phase-13.md

import { useEffect, useState } from 'react';
import { HeadlessOSLogo, HeadlessOSWordmark } from '../../assets/logo';
import { useEffectivePref } from '../../store/effective-preferences';
import {
  findWallpaper,
  fetchWallpapers,
  BUILTIN_WALLPAPERS,
  DEFAULT_WALLPAPER_ID,
  type WallpaperDefinition,
  type ImageWallpaper,
} from './wallpapers';
import { resolveServerUrl } from '../../lib/api';

interface WallpaperProps {
  className?: string;
}

export function Wallpaper({ className = '' }: WallpaperProps) {
  const savedId = useEffectivePref('wallpaperId');
  const [imageWallpapers, setImageWallpapers] = useState<ImageWallpaper[]>([]);
  const [listLoaded, setListLoaded] = useState(false);

  const savedIsImage = savedId.startsWith('system:') || savedId.startsWith('user:');

  // Fetch image wallpapers on mount + whenever wallpaperId switches to an image type
  useEffect(() => {
    fetchWallpapers()
      .then((result) => {
        setImageWallpapers([...result.system, ...result.user]);
        setListLoaded(true);
      })
      .catch(() => {}); // Fallback to builtins if server is unreachable
  }, [savedIsImage]);

  // M13.1: once the list is known, an image that is not in it (e.g. a removed system
  // wallpaper) shows the default instead of a broken image
  const wallpaperId = listLoaded && savedIsImage && !imageWallpapers.some((w) => w.id === savedId)
    ? DEFAULT_WALLPAPER_ID
    : savedId;
  const isImageId = wallpaperId.startsWith('system:') || wallpaperId.startsWith('user:');

  // If wallpaperId is an image type and we have the URL pattern, render directly
  // without waiting for fetchWallpapers to resolve (avoids flash of builtin wallpaper)
  const wallpaper = findWallpaper(wallpaperId, imageWallpapers);
  const isUnresolvedImage = isImageId && wallpaper.type === 'gradient';

  // Build a direct URL for image wallpapers that haven't been resolved yet
  const directImageUrl = isUnresolvedImage
    ? resolveServerUrl(`/api/wallpapers/${wallpaperId.replace(':', '/')}`)
    : null;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {directImageUrl ? (
        /* Direct image render for unresolved image wallpapers */
        <img
          src={directImageUrl}
          alt="Wallpaper"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : wallpaper.type === 'gradient' ? (
        <>
          {/* Render CSS gradient layers */}
          {wallpaper.layers.map((layer, i) => (
            <div
              key={`${wallpaper.id}-layer-${i}`}
              className="absolute inset-0"
              style={layer.style}
            />
          ))}

          {/* HeadlessOS branding watermark (only on supporting wallpapers) */}
          {wallpaper.showBranding && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3 opacity-[0.035]">
              <HeadlessOSLogo size={64} />
              <HeadlessOSWordmark width={180} className="text-white" />
            </div>
          )}
        </>
      ) : (
        /* Render resolved image wallpaper */
        <img
          src={wallpaper.url}
          alt={wallpaper.name}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      )}

      {/* EX8.1: darkens the wallpaper in dark mode so glass reads as dark */}
      <div className="absolute inset-0 lumen-scrim pointer-events-none" />
    </div>
  );
}

/** Mini wallpaper preview for the picker */
export function WallpaperPreview({
  wallpaper,
  className = '',
}: {
  wallpaper: WallpaperDefinition;
  className?: string;
}) {
  if (wallpaper.type === 'gradient') {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        {wallpaper.layers.map((layer, i) => (
          <div
            key={`preview-${wallpaper.id}-${i}`}
            className="absolute inset-0"
            style={layer.style}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        src={wallpaper.url}
        alt={wallpaper.name}
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}

/**
 * Legacy WallpaperPreview that takes a wallpaperId string.
 * Used by components that only know the ID (e.g., Desktop test mocks).
 */
export function WallpaperPreviewById({
  wallpaperId,
  className = '',
}: {
  wallpaperId: string;
  className?: string;
}) {
  const wallpaper = findWallpaper(wallpaperId);
  return <WallpaperPreview wallpaper={wallpaper} className={className} />;
}
