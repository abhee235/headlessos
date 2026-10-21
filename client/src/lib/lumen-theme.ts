// EX8.1: LumenOS appearance — resolves accent / glass / transparency into
// <html> data attributes that switch token presets in styles.css.
// @see docs/phases/phase-ex8.md

export type LumenAccent = 'iris' | 'teal' | 'blue' | 'moss';
export type GlassStrength = 'heavy' | 'balanced' | 'subtle';

/**
 * Theme accent choices, indexed by the `accentColorIndex` preference.
 * Index 0 follows the wallpaper (the LumenOS default). Indices past the end
 * (left over from the old 8-colour picker) also fall back to `auto`.
 */
export const LUMEN_ACCENTS = [
  { id: 'auto', name: 'Match wallpaper', swatch: 'conic-gradient(#6A4FB0, #007187, #2F5FB3, #2F7A4F, #6A4FB0)' },
  { id: 'iris', name: 'Iris violet', swatch: '#8468C8' },
  { id: 'teal', name: 'Tide teal', swatch: '#1F8EA3' },
  { id: 'blue', name: 'Ocean blue', swatch: '#4A7BD0' },
  { id: 'moss', name: 'Moss green', swatch: '#44935F' },
] as const;

export const GLASS_STRENGTHS: ReadonlyArray<{ id: GlassStrength; name: string }> = [
  { id: 'heavy', name: 'Heavy' },
  { id: 'balanced', name: 'Balanced' },
  { id: 'subtle', name: 'Subtle' },
];

/** Accent each Lumen wallpaper picks when the accent is set to "Match wallpaper". */
const WALLPAPER_ACCENTS: Record<string, LumenAccent> = {
  alpine: 'blue',
  highlands: 'moss',
  'still-lake': 'teal',
  mist: 'teal',
  dusk: 'iris',
  'northern-lights': 'moss',
};

/** Image wallpapers dark enough that light-mode glass needs extra opacity. */
const DARK_IMAGE_WALLPAPERS = new Set(['northern-lights']);

/** `system:dusk.jpg` → `dusk`; `builtin:celestial` → `celestial`. */
function wallpaperKey(wallpaperId: string): string {
  const name = wallpaperId.includes(':') ? wallpaperId.slice(wallpaperId.indexOf(':') + 1) : wallpaperId;
  return name.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

export function accentForWallpaper(wallpaperId: string): LumenAccent {
  return WALLPAPER_ACCENTS[wallpaperKey(wallpaperId)] ?? 'iris';
}

export function resolveAccent(accentColorIndex: number, wallpaperId: string): LumenAccent {
  const choice = LUMEN_ACCENTS[accentColorIndex]?.id ?? 'auto';
  return choice === 'auto' ? accentForWallpaper(wallpaperId) : choice;
}

/** Builtin wallpapers are all dark CSS gradients; image ones are listed above. */
export function isDarkWallpaper(wallpaperId: string): boolean {
  if (wallpaperId.startsWith('builtin:') || !wallpaperId.includes(':')) return true;
  return DARK_IMAGE_WALLPAPERS.has(wallpaperKey(wallpaperId));
}

export interface LumenAppearance {
  accent: LumenAccent;
  glass: GlassStrength;
  transparency: boolean;
  darkWallpaper: boolean;
}

export function applyLumenAppearance(root: HTMLElement, a: LumenAppearance): void {
  root.dataset.accent = a.accent;
  root.dataset.glass = a.glass;
  if (a.transparency) delete root.dataset.transparency;
  else root.dataset.transparency = 'off';
  if (a.darkWallpaper) root.dataset.wallTone = 'dark';
  else delete root.dataset.wallTone;
}
