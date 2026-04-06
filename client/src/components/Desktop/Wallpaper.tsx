// M6.3: Wallpaper — renders the selected desktop wallpaper from preferences
// Supports both CSS gradient (builtin) and image-based (system/user) wallpapers
// @see docs/phases/phase-6.md

import { useEffect, useState } from 'react';
import { HeadlessOSLogo, HeadlessOSWordmark } from '../../assets/logo';
import { usePreferencesStore } from '../../store/preferences-store';
import {
  findWallpaper,
  fetchWallpapers,
  BUILTIN_WALLPAPERS,
  type WallpaperDefinition,
  type ImageWallpaper,
} from './wallpapers';
import { resolveServerUrl } from '../../lib/api';

interface WallpaperProps {
  className?: string;
}

export function Wallpaper({ className = '' }: WallpaperProps) {
  const wallpaperId = usePreferencesStore((s) => s.wallpaperId);
  const [imageWallpapers, setImageWallpapers] = useState<ImageWallpaper[]>([]);

  const isImageId = wallpaperId.startsWith('system:') || wallpaperId.startsWith('user:');

  // Fetch image wallpapers on mount + whenever wallpaperId switches to an image type
  useEffect(() => {
    fetchWallpapers()
      .then((result) => setImageWallpapers([...result.system, ...result.user]))
      .catch(() => {}); // Fallback to builtins if server is unreachable
  }, [isImageId]);

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
