// Wallpaper Definitions — builtin CSS gradients + image-based wallpapers from server
// Builtin wallpapers: CSS gradient layers rendered in-browser (no server needed)
// Image wallpapers: served from server/assets/wallpapers/system/ and ~/.headlessos/wallpapers/

import type { CSSProperties } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WallpaperLayer {
  style: CSSProperties;
}

export interface GradientWallpaper {
  type: 'gradient';
  id: string;
  name: string;
  category: 'builtin';
  layers: WallpaperLayer[];
  showBranding?: boolean;
}

export interface ImageWallpaper {
  type: 'image';
  id: string;
  name: string;
  filename: string;
  category: 'system' | 'user';
  url: string;
}

export type WallpaperDefinition = GradientWallpaper | ImageWallpaper;

// ─── Builtin CSS Gradient Wallpapers ─────────────────────────────────────────

export const BUILTIN_WALLPAPERS: GradientWallpaper[] = [
  /* ── Celestial — deep space navy with cosmic glows (default) ─────────── */
  {
    type: 'gradient',
    id: 'builtin:celestial',
    name: 'Celestial',
    category: 'builtin',
    showBranding: true,
    layers: [
      {
        style: {
          background:
            'linear-gradient(135deg, #0c1426 0%, #1a1a2e 25%, #16213e 50%, #0f3460 75%, #1a1a40 100%)',
        },
      },
      {
        style: {
          background: [
            'radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.08) 0%, transparent 60%)',
            'radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.06) 0%, transparent 50%)',
            'radial-gradient(ellipse at 60% 80%, rgba(20,184,166,0.05) 0%, transparent 50%)',
          ].join(', '),
        },
      },
      {
        style: {
          backgroundImage:
            'radial-gradient(circle, #ffffff 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
          opacity: 0.015,
        },
      },
    ],
  },

  /* ── Aurora — northern lights across dark sky ───────────────────────── */
  {
    type: 'gradient',
    id: 'builtin:aurora',
    name: 'Aurora',
    category: 'builtin',
    layers: [
      {
        style: {
          background:
            'linear-gradient(180deg, #020616 0%, #0a0e27 40%, #0d1117 100%)',
        },
      },
      {
        style: {
          background: [
            'radial-gradient(ellipse 150% 50% at 25% 0%, rgba(34,197,94,0.20) 0%, transparent 70%)',
            'radial-gradient(ellipse 120% 40% at 55% 5%, rgba(45,212,191,0.16) 0%, transparent 60%)',
            'radial-gradient(ellipse 100% 35% at 80% 10%, rgba(139,92,246,0.12) 0%, transparent 55%)',
          ].join(', '),
          filter: 'blur(40px)',
        },
      },
      {
        style: {
          background: [
            'radial-gradient(ellipse 80% 25% at 40% 8%, rgba(16,185,129,0.12) 0%, transparent 50%)',
            'radial-gradient(ellipse 60% 20% at 65% 3%, rgba(52,211,153,0.10) 0%, transparent 45%)',
          ].join(', '),
          filter: 'blur(20px)',
        },
      },
      {
        style: {
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.6) 0.3px, transparent 0.3px)',
          backgroundSize: '40px 40px',
          opacity: 0.03,
        },
      },
    ],
  },

  /* ── Bloom — Windows 11-inspired soft light petals ──────────────────── */
  {
    type: 'gradient',
    id: 'builtin:bloom',
    name: 'Bloom',
    category: 'builtin',
    layers: [
      {
        style: {
          background:
            'linear-gradient(135deg, #0c0a1a 0%, #1a0e2e 50%, #0a1628 100%)',
        },
      },
      {
        style: {
          background:
            'radial-gradient(ellipse 60% 70% at 50% 50%, rgba(59,130,246,0.28) 0%, transparent 70%)',
          filter: 'blur(60px)',
        },
      },
      {
        style: {
          background: [
            'radial-gradient(ellipse 40% 50% at 30% 55%, rgba(244,114,182,0.22) 0%, transparent 70%)',
            'radial-gradient(ellipse 35% 45% at 70% 45%, rgba(251,146,60,0.18) 0%, transparent 65%)',
          ].join(', '),
          filter: 'blur(50px)',
        },
      },
      {
        style: {
          background: [
            'radial-gradient(ellipse 25% 30% at 45% 40%, rgba(168,85,247,0.20) 0%, transparent 60%)',
            'radial-gradient(ellipse 20% 25% at 55% 60%, rgba(56,189,248,0.15) 0%, transparent 55%)',
          ].join(', '),
          filter: 'blur(35px)',
        },
      },
      {
        style: {
          background:
            'radial-gradient(ellipse 15% 20% at 50% 48%, rgba(255,255,255,0.06) 0%, transparent 50%)',
          filter: 'blur(15px)',
        },
      },
    ],
  },

  /* ── Graphite — minimal dark gray with soft grid ────────────────────── */
  {
    type: 'gradient',
    id: 'builtin:graphite',
    name: 'Graphite',
    category: 'builtin',
    layers: [
      {
        style: {
          background:
            'linear-gradient(145deg, #1a1a1a 0%, #2a2a2a 30%, #1e1e1e 60%, #171717 100%)',
        },
      },
      {
        style: {
          background:
            'radial-gradient(ellipse 80% 60% at 60% 40%, rgba(255,255,255,0.03) 0%, transparent 60%)',
        },
      },
      {
        style: {
          backgroundImage: [
            'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '60px 60px',
        },
      },
    ],
  },
];

// ─── Wallpaper Lookup ────────────────────────────────────────────────────────

/**
 * Find a wallpaper by ID. Searches builtins first, then the provided image list.
 * Falls back to the first builtin wallpaper if not found.
 * Also supports legacy IDs without prefix (e.g., 'celestial' → 'builtin:celestial').
 */
export function findWallpaper(
  id: string,
  imageWallpapers: ImageWallpaper[] = [],
): WallpaperDefinition {
  // Direct match in builtins
  const builtin = BUILTIN_WALLPAPERS.find((w) => w.id === id);
  if (builtin) return builtin;

  // Legacy ID fallback: 'celestial' → 'builtin:celestial'
  const legacyBuiltin = BUILTIN_WALLPAPERS.find(
    (w) => w.id === `builtin:${id}`,
  );
  if (legacyBuiltin) return legacyBuiltin;

  // Search image wallpapers
  const image = imageWallpapers.find((w) => w.id === id);
  if (image) return image;

  // Fallback to default
  return BUILTIN_WALLPAPERS[0];
}

/** Convenience alias for backward compat */
export function getWallpaper(id: string): GradientWallpaper {
  const w = findWallpaper(id);
  if (w.type === 'gradient') return w;
  return BUILTIN_WALLPAPERS[0];
}

export function getDefaultWallpaper(): GradientWallpaper {
  return BUILTIN_WALLPAPERS[0];
}

export const DEFAULT_WALLPAPER_ID = 'builtin:celestial';

// ─── API Helpers ─────────────────────────────────────────────────────────────

import { API_BASE, resolveServerUrl } from '../../lib/api';

export interface WallpaperListResponse {
  system: ImageWallpaper[];
  user: ImageWallpaper[];
}

/** Fetch all image wallpapers from the server */
export async function fetchWallpapers(): Promise<WallpaperListResponse> {
  const res = await fetch(`${API_BASE}/wallpapers`);
  if (!res.ok) throw new Error('Failed to fetch wallpapers');
  const data = await res.json();

  // Add type:'image' to each wallpaper from the API
  const mapItems = (
    items: Array<{ id: string; name: string; filename: string; category: 'system' | 'user'; url: string }>,
  ): ImageWallpaper[] =>
    items.map((item) => ({ ...item, type: 'image' as const, url: resolveServerUrl(item.url) }));

  return {
    system: mapItems(data.system ?? []),
    user: mapItems(data.user ?? []),
  };
}

/** Upload a new user wallpaper */
export async function uploadWallpaper(file: File): Promise<ImageWallpaper> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/wallpapers/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error ?? 'Upload failed');
  }
  const data = await res.json();
  return { ...data, type: 'image' as const, url: resolveServerUrl(data.url) };
}

/** Delete a user wallpaper */
export async function deleteWallpaper(filename: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/wallpapers/user/${encodeURIComponent(filename)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Delete failed' }));
    throw new Error(err.error ?? 'Delete failed');
  }
}
